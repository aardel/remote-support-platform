const http = require('http');
const https = require('https');

// Simple in-memory cache: ip -> { country, region, city, ts }
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function isPrivateIp(ip) {
    if (!ip) return true;
    const cleaned = ip.replace(/^::ffff:/, '');
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
        const req = lib.get(url, { timeout }, (res) => {
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
 * Primary: reallyfreegeoip.org. Fallback: ip-api.com.
 */
async function geolocate(ip) {
    if (!ip || isPrivateIp(ip)) return null;
    const cleaned = ip.replace(/^::ffff:/, '');

    // Check cache
    const cached = cache.get(cleaned);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return { country: cached.country, region: cached.region, city: cached.city };
    }

    // Try primary
    try {
        const data = await fetchJson(`https://reallyfreegeoip.org/json/${cleaned}`);
        if (data && data.country_name) {
            const result = {
                country: data.country_name || data.country_code || null,
                region: data.region_name || null,
                city: data.city || null
            };
            cache.set(cleaned, { ...result, ts: Date.now() });
            return result;
        }
    } catch (_) { /* fallback */ }

    // Try fallback
    try {
        const data = await fetchJson(`http://ip-api.com/json/${cleaned}?fields=country,regionName,city,status`);
        if (data && data.status === 'success') {
            const result = {
                country: data.country || null,
                region: data.regionName || null,
                city: data.city || null
            };
            cache.set(cleaned, { ...result, ts: Date.now() });
            return result;
        }
    } catch (_) { /* both failed */ }

    return null;
}

module.exports = { geolocate };
