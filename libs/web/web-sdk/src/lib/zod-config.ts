import { config } from 'zod';

/**
 * Zod compiles parsers with `new Function` unless it runs without JIT; to find out, it tries `Function('')` once. The
 * Content Security Policy of f.orga (`script-src 'self'`, no `unsafe-eval`) refuses that and the browser reports a CSP
 * violation for every frontend. Without JIT nothing is probed; the parsers work the same.
 */
config({ jitless: true });

/** Zod runs without JIT in the frontends (set when the SDK is loaded). */
export const ZOD_JITLESS = true;
