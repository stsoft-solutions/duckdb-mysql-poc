type FixedWindowRateLimitEntry = {
  count: number;
  resetAt: number;
};

export type FixedWindowRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
  count: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, FixedWindowRateLimitEntry>();
  private operationsSinceSweep = 0;

  constructor(private readonly sweepInterval: number = 100) {
  }

  public get size(): number {
    return this.entries.size;
  }

  public reset(): void {
    this.entries.clear();
    this.operationsSinceSweep = 0;
  }

  public consume(
    key: string,
    windowMs: number,
    limit: number,
    now: number = Date.now()
  ): FixedWindowRateLimitResult {
    this.sweepExpired(now);

    const current = this.entries.get(key);

    let nextEntry: FixedWindowRateLimitEntry;
    if (!current || current.resetAt <= now) {
      nextEntry = {
        count: 1,
        resetAt: now + windowMs
      };
    } else {
      nextEntry = {
        count: current.count + 1,
        resetAt: current.resetAt
      };
    }

    this.entries.set(key, nextEntry);

    return {
      allowed: nextEntry.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((nextEntry.resetAt - now) / 1000)),
      limit,
      remaining: Math.max(0, limit - nextEntry.count),
      count: nextEntry.count,
      resetAt: nextEntry.resetAt
    };
  }

  private sweepExpired(now: number): void {
    this.operationsSinceSweep++;
    if (this.operationsSinceSweep < Math.max(1, this.sweepInterval)) {
      return;
    }

    this.operationsSinceSweep = 0;

    for (const [key, entry] of this.entries.entries()) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}

