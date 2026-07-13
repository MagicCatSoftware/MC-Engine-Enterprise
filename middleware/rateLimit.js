// Lightweight in-memory rate limiter — no Redis needed since PM2 runs a single instance.
// Fixed-window counter per key (IP or user id), with periodic sweep of expired windows.

function rateLimit({ windowMs, max, keyFn, message }) {
  const hits = new Map(); // key -> { count, resetAt }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.min(windowMs, 60000));
  if (sweep.unref) sweep.unref();

  return function (req, res, next) {
    const key = (keyFn ? keyFn(req) : req.ip) || req.ip;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message || 'Too many requests — please slow down.', retryAfter });
    }
    next();
  };
}

module.exports = { rateLimit };
