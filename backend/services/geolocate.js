const http = require('http');
const https = require('https');

// Simple in-memory cache: ip -> { country, region, city, ts }
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const failCache = new Map(); // ip -> { ts, error }
const FAIL_TTL = 10 * 60 * 1000; // 10 minutes

function normalizeIp(ip) {
    if (!ip) return null;
    let cleaned = String(ip).trim();
    // X-Forwarded-For can be a list: take first hop.
    if (cleaned.includes(',')) cleaned = cleaned.split(',')[0].trim();
    // Strip IPv6 prefix for IPv4-mapped addresses.
    cleaned = cleaned.replace(/^::ffff:/, '');
    // If we have a bracketed IPv6 like "[::1]:1234", strip brackets and port.
    const bracketed = cleaned.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (bracketed) {
        cleaned = bracketed[1];
        return cleaned || null;
    }
    // Strip IPv4 port suffix "1.2.3.4:1234". Do NOT strip on raw IPv6 literals.
    if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(cleaned)) {
        cleaned = cleaned.replace(/:\d+$/, '');
    }
    return cleaned || null;
}

function isPrivateIp(ip) {
    const cleaned = normalizeIp(ip);
    if (!cleaned) return true;
    return (
        cleaned === '127.0.0.1' ||
        cleaned === '::1' ||
        cleaned === 'localhost' ||
        cleaned.startsWith('10.') ||
        cleaned.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(cleaned)
    );
}

function fetchJson(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { timeout, headers: { 'User-Agent': 'remote-support-platform' } }, (res) => {
            let body = '';
            res.on('data', (ch) => { body += ch; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

/**
 * Geolocate an IP address. Returns { country, region, city } or null.
 * Use HTTPS-only providers (many hosts block outbound plain HTTP).
 * Primary: ipwho.is. Fallback: ipapi.co.
 */
async function geolocate(ip) {
    const cleaned = normalizeIp(ip);
    if (!cleaned || isPrivateIp(cleaned)) return null;

    const failed = failCache.get(cleaned);
    if (failed && Date.now() - failed.ts < FAIL_TTL) {
        return null;
    }

    // Check cache
    const cached = cache.get(cleaned);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return { country: cached.country, region: cached.region, city: cached.city, provider: cached.provider };
    }

    // Try primary (HTTPS)
    try {
        const data = await fetchJson(`https://ipwho.is/${encodeURIComponent(cleaned)}`);
        if (data && data.success) {
            const result = {
                country: data.country || data.country_code || null,
                region: data.region || null,
                city: data.city || null,
                provider: 'ipwho.is'
            };
            cache.set(cleaned, { ...result, ts: Date.now() });
            return result;
        }
    } catch (_) { /* fallback */ }

    // Try fallback (HTTPS)
    try {
        const data = await fetchJson(`https://ipapi.co/${encodeURIComponent(cleaned)}/json/`);
        if (data && (data.country_name || data.country)) {
            const result = {
                country: data.country_name || data.country || null,
                region: data.region || data.region_code || null,
                city: data.city || null,
                provider: 'ipapi.co'
            };
            cache.set(cleaned, { ...result, ts: Date.now() });
            return result;
        }
    } catch (_) { /* both failed */ }

    failCache.set(cleaned, { ts: Date.now(), error: 'providers_failed' });
    if (process.env.GEO_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.warn('[geo] failed to geolocate', cleaned);
    }
    return null;
}

module.exports = { geolocate, normalizeIp };
