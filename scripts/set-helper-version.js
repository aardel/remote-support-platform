#!/usr/bin/env node
/**
 * Set helper/package.json version (e.g. from tag v1.0.0 -> 1.0.0).
 * Usage: node scripts/set-helper-version.js [version]
 * Example: node scripts/set-helper-version.js v1.0.0
 */
const fs = require('fs');
const path = require('path');
let version = process.argv[2] || '0.0.0';
if (version.startsWith('v')) version = version.slice(1);
const helperPkgPath = path.join(__dirname, '..', 'helper', 'package.json');
const pkg = JSON.parse(fs.readFileSync(helperPkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(helperPkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('helper version set to', version);
