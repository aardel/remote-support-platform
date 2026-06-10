// Minimal fixed-window rate limiter (per client IP + route), no external deps.
// Intended for unauthenticated endpoints (session lookup, register, approval).

function rateLimit({ windowMs = 60 * 1000, max = 30 } = {}) {
    const hits = new Map(); // key -> { count, resetAt }

    const timer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(key);
        }
    }, windowMs);
    if (timer.unref) timer.unref();

    return (req, res, next) => {
        const xf = req.headers['x-forwarded-for'];
        const ip = (Array.isArray(xf) ? xf[0] : (xf || '')).split(',')[0].trim() || req.ip || 'unknown';
        const key = `${ip}:${req.baseUrl}${req.route?.path || req.path}`;
        const now = Date.now();

        let entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }
        entry.count += 1;

        if (entry.count > max) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({ error: 'Too many requests' });
        }
        next();
    };
}

module.exports = { rateLimit };
