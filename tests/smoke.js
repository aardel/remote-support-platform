#!/usr/bin/env node
/**
 * Smoke test: GET /api/health. Skips (exit 0) if server is not running.
 * Run from repo root: node tests/smoke.js
 * BASE_URL env (e.g. http://localhost:3000) overrides default.
 */
const http = require('http');

const base = process.env.BASE_URL || 'http://localhost:3000';
const url = new URL('/api/health', base);

const req = http.get(url, (res) => {
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
