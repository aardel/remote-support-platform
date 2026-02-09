const express = require('express');
const https = require('https');
const { requireAuth } = require('../middleware/sessionAuth');

const router = express.Router();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cache = { ts: 0, data: null };

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'remote-support-platform', ...headers } }, (res) => {
      let body = '';
      res.on('data', (ch) => { body += ch; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

// GET /api/whats-new
// Returns latest GitHub release info (cached). Requires auth to reduce abuse.
router.get('/', requireAuth, async (_req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
      return res.json(cache.data);
    }

    const repo = process.env.GITHUB_REPO || 'aardel/remote-support-platform';
    const data = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);

    const out = {
      repo,
      tag: data.tag_name || null,
      name: data.name || null,
      body: data.body || null,
      publishedAt: data.published_at || null,
      url: data.html_url || null
    };

    cache = { ts: Date.now(), data: out };
    return res.json(out);
  } catch (e) {
    // Do not fail the dashboard if GitHub is down/rate-limited.
    return res.json({ repo: process.env.GITHUB_REPO || 'aardel/remote-support-platform', tag: null, name: null, body: null, publishedAt: null, url: null, error: e.message });
  }
});

module.exports = router;

