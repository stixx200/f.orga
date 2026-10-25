import { BadRequestException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Audit } from '../audit/audit.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { RequirePermissions } from '../security/decorators.js';
import { installPackage, type PluginState, removePlugin } from './plugin-directory.js';
import { fingerprint } from './plugin-package.js';
import { MAX_UNPACKED, PackageError } from './tar.js';

/** Plugin packages from outside: list, upload (takes effect after a restart), remove. */
@Controller('core/plugins')
@RequirePermissions('core.modules.manage')
export class PluginsController {
  private readonly states: PluginState[];

  constructor(
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
    private readonly audit: Audit,
  ) {
    this.states = options.plugins?.states ?? [];
  }

  private get config() {
    return this.options.plugins?.config ?? { dir: null, trusted: [], allowUnsigned: false };
  }

  @Get()
  list() {
    return {
      enabled: this.config.dir !== null,
      allowUnsigned: this.config.allowUnsigned,
      trustedKeys: this.config.trusted.map(fingerprint),
      plugins: this.states.map(({ frontendDir: _frontendDir, ...state }) => state),
    };
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UNPACKED } }))
  async upload(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException({ code: 'imports.fileMissing' });
    const builtIn = new Set(this.options.modules.filter((m) => !this.states.some((s) => s.id === m.manifest.id)).map((m) => m.manifest.id));
    try {
      const { info, signer } = installPackage(this.config, file.buffer, builtIn);
      const existing = this.states.find((s) => s.id === info.id);
      const state: PluginState = { id: info.id, version: info.version, signer, status: 'installed', error: null, frontendDir: existing?.frontendDir ?? null };
      if (existing) Object.assign(existing, state);
      else this.states.push(state);
      await this.audit.log('plugins.installed', { id: info.id, version: info.version, signer });
      return { id: info.id, version: info.version, signer, restartRequired: true };
    } catch (error) {
      if (error instanceof PackageError) throw new BadRequestException({ code: error.code });
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    const state = this.states.find((s) => s.id === id);
    if (!state || !removePlugin(this.config, id)) throw new NotFoundException();
    state.status = 'removed';
    await this.audit.log('plugins.removed', { id });
  }
}
