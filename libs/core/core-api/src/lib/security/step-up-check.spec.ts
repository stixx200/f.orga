import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public, RequirePermissions, StepUp } from './decorators.js';
import { publicStepUpEndpoints } from './step-up-check.js';

@Controller('kiosk')
@Public()
class Kiosk {
  @Get('ok')
  ok() {
    return 1;
  }

  @Get('bad')
  @RequirePermissions('test.sensitive')
  bad() {
    return 1;
  }

  @Get('marked')
  @StepUp()
  marked() {
    return 1;
  }
}

@Controller('admin')
@RequirePermissions('test.sensitive')
class Admin {
  /** Public status in a protected controller: the class permission does not apply. */
  @Get('status')
  @Public()
  status() {
    return 1;
  }

  @Get()
  list() {
    return 1;
  }
}

const source = (type: new () => object, names: string[]) => ({
  controller: type,
  handlers: names.map((name) => ({ name, handler: (type.prototype as Record<string, object>)[name] })),
});

describe('startup check for public (kiosk) endpoints', () => {
  it('finds public endpoints that require a permission with step-up', () => {
    const found = publicStepUpEndpoints([source(Kiosk, ['ok', 'bad', 'marked']), source(Admin, ['status', 'list'])], new Reflector(), new Set(['test.sensitive']));
    expect(found).toEqual(['Kiosk.bad', 'Kiosk.marked']);
  });
});
