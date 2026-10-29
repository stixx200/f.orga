import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PUBLIC, REQUIRED_PERMISSIONS, STEP_UP } from './decorators.js';
import { PermissionRegistry } from './permission-registry.js';

/** A controller class with its handlers, as far as the check needs them. */
export interface EndpointSource {
  controller: object;
  handlers: { name: string; handler: object }[];
}

/**
 * Endpoints without a user session (`@Public()`, e.g. the kiosk endpoints of the info terminal with their own device
 * guard) cannot ask for the second factor. Returns the endpoints that nevertheless require a permission with `stepUp`
 * or are marked `@StepUp()`.
 */
export function publicStepUpEndpoints(sources: readonly EndpointSource[], reflector: Reflector, stepUp: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const { controller, handlers } of sources) {
    for (const { name, handler } of handlers) {
      const method = handler as () => void;
      const type = controller as new () => unknown;
      const classPublic = reflector.get<boolean>(PUBLIC, type) ?? false;
      if (!reflector.get<boolean>(PUBLIC, method) && !classPublic) continue;
      // A single public handler in a protected controller (e.g. the restore status of the maintenance page) ignores the
      // permissions of the class; a public controller (kiosk) counts them.
      const permissions = reflector.get<string[]>(REQUIRED_PERMISSIONS, method) ?? (classPublic ? (reflector.get<string[]>(REQUIRED_PERMISSIONS, type) ?? []) : []);
      const marked = reflector.get<boolean>(STEP_UP, method) ?? (classPublic ? reflector.get<boolean>(STEP_UP, type) : false);
      if (marked || permissions.some((p) => stepUp.has(p))) {
        found.push(`${(controller as { name?: string }).name ?? 'controller'}.${name}`);
      }
    }
  }
  return found;
}

/** Startup check: the server does not start if a public (kiosk) endpoint requires a permission with step-up. */
@Injectable()
export class StepUpCheck implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly registry: PermissionRegistry,
  ) {}

  onModuleInit(): void {
    const sources = this.discovery.getControllers().flatMap((wrapper) => {
      const type = wrapper.metatype as (new () => unknown) | null;
      if (!type) return [];
      const prototype = type.prototype as Record<string, object>;
      return [{ controller: type, handlers: this.scanner.getAllMethodNames(prototype).map((name) => ({ name, handler: prototype[name] })) }];
    });
    const endpoints = publicStepUpEndpoints(sources, this.reflector, this.registry.stepUp);
    if (endpoints.length) {
      throw new Error(`Public (kiosk) endpoints must not require a permission with step-up: ${endpoints.join(', ')}`);
    }
  }
}
