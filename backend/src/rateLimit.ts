import type { Request, RequestHandler } from 'express';

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function defaultKeyGenerator(req: Request): string {
  return req.ip || 'unknown';
}

export function createRateLimiter({
  windowMs,
  max,
  message,
  keyPrefix,
  keyGenerator = defaultKeyGenerator,
}: RateLimiterOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const now = Date.now();

    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }

    const bucketKey = `${keyPrefix}:${keyGenerator(req)}`;
    const existingBucket = buckets.get(bucketKey);

    if (!existingBucket) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existingBucket.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existingBucket.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existingBucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: message });
      return;
    }

    existingBucket.count += 1;
    next();
  };
}