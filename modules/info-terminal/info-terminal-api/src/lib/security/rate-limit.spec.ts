import { RateLimiter } from './rate-limit.js';

describe('rate limiter', () => {
  it('refuses events above the limit within the window and counts again afterwards', () => {
    const limiter = new RateLimiter(2, 1_000);
    expect([limiter.hit('a', 0), limiter.hit('a', 10), limiter.hit('a', 20)]).toEqual([true, true, false]);
    expect(limiter.hit('b', 20)).toBe(true);
    expect(limiter.hit('a', 1_000)).toBe(true);
  });

  it('blocks a key that exceeded the limit for the block time', () => {
    const limiter = new RateLimiter(1, 1_000, 5_000);
    limiter.hit('ip', 0);
    limiter.hit('ip', 1);
    expect(limiter.blocked('ip', 2_000)).toBe(true);
    expect(limiter.hit('ip', 2_000)).toBe(false);
    expect(limiter.blocked('ip', 5_002)).toBe(false);
    expect(limiter.hit('ip', 5_002)).toBe(true);
  });
});
