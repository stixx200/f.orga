const MAX_TRACKED = 10_000;

/**
 * Counts events per key in a fixed window and blocks a key that exceeded the limit for `blockMs` (in the memory of
 * the process, like the login lock). Bounded: many different keys never grow the map without limit.
 */
export class RateLimiter {
  private readonly entries = new Map<string, { count: number; windowStart: number; blockedUntil: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly blockMs = 0,
  ) {}

  /** Is the key blocked right now (without counting)? */
  blocked(key: string, now = Date.now()): boolean {
    const entry = this.entries.get(key);
    return Boolean(entry && entry.blockedUntil > now);
  }

  /** Counts an event; `false` if the key is over its limit (the event should be refused). */
  hit(key: string, now = Date.now()): boolean {
    let entry = this.entries.get(key);
    if (entry && entry.blockedUntil > now) return false;
    if (!entry || now - entry.windowStart >= this.windowMs) {
      if (!entry && this.entries.size >= MAX_TRACKED) this.prune(now);
      entry = { count: 0, windowStart: now, blockedUntil: 0 };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      if (this.blockMs) entry.blockedUntil = now + this.blockMs;
      return false;
    }
    return true;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) if (entry.blockedUntil <= now && now - entry.windowStart >= this.windowMs) this.entries.delete(key);
    if (this.entries.size >= MAX_TRACKED) this.entries.delete(this.entries.keys().next().value!);
  }
}
