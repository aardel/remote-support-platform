const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
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

function getHelperVersion() {
  try {
    const versionFile = path.join(__dirname, '../../packages/support-template.version');
    if (fs.existsSync(versionFile)) {
      return fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch (e) {
    // ignore
  }
  try {
    const pkg = require('../../helper/package.json');
    return pkg.version || null;
  } catch (e) {
    return null;
  }
}

// GET /api/whats-new
// Returns latest helper version info (cached). Requires auth to reduce abuse.
router.get('/', requireAuth, async (_req, res) => {
  try {
    if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
      return res.json(cache.data);
    }

    const helperVersion = getHelperVersion();
    const repo = process.env.GITHUB_REPO || 'aardel/remote-support-platform';
    
    // Try to get GitHub release info, but use helper version as primary
    let githubData = null;
    try {
      githubData = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
    } catch (e) {
      // If GitHub fails, we'll still return helper version
    }

    // Use helper version if available, otherwise fall back to GitHub tag
    const version = helperVersion || githubData?.tag_name?.replace(/^v/, '') || null;
    const tag = version ? `v${version}` : (githubData?.tag_name || null);
    const name = version ? `Helper v${version}` : (githubData?.name || null);

    const out = {
      repo,
      tag,
      name,
      body: githubData?.body || `Version ${version} is available. Windows: use the .exe installer. macOS: use the .dmg image.`,
      publishedAt: githubData?.published_at || null,
      url: githubData?.html_url || null
    };

    cache = { ts: Date.now(), data: out };
    return res.json(out);
  } catch (e) {
    // Fallback to helper version even if everything fails
    const helperVersion = getHelperVersion();
    return res.json({ 
      repo: process.env.GITHUB_REPO || 'aardel/remote-support-platform', 
      tag: helperVersion ? `v${helperVersion}` : null, 
      name: helperVersion ? `Helper v${helperVersion}` : null, 
      body: helperVersion ? `Version ${helperVersion} is available. Windows: use the .exe installer. macOS: use the .dmg image.` : null,
      publishedAt: null, 
      url: null, 
      error: e.message 
    });
  }
});

module.exports = router;

