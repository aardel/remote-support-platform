#!/usr/bin/env node
/**
 * Smoke test: GET /api/health. Skips (exit 0) if server is not running.
 * Run from repo root: node tests/smoke.js
 * BASE_URL env (e.g. https://your-domain.example/remote) overrides default.
 */
const http = require('http');
const https = require('https');

const base = process.env.BASE_URL || 'https://your-domain.example/remote';
const url = new URL('/api/health', base);

const client = url.protocol === 'https:' ? https : http;
const req = client.get(url, (res) => {
  let body = '';
  res.on('data', (ch) => { body += ch; });
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('smoke: /api/health returned', res.statusCode, body);
      process.exit(1);
    }
    try {
      const data = JSON.parse(body);
      if (data.status !== 'ok') {
        console.error('smoke: expected status "ok", got', data.status);
        process.exit(1);
      }
      console.log('smoke: /api/health OK');
      process.exit(0);
    } catch (e) {
      console.error('smoke: invalid JSON', e.message);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
    console.log('smoke: server not running, skip');
    process.exit(0);
  }
  console.error('smoke:', e.message);
  process.exit(1);
});

req.setTimeout(5000, () => {
  req.destroy();
  console.error('smoke: timeout');
  process.exit(1);
});
