#!/usr/bin/env node
/**
 * Sync version from root package.json to helper and frontend.
 * Run from repo root: node scripts/sync-version.js
 * Optional: node scripts/sync-version.js 1.2.3  (writes 1.2.3 to root then syncs)
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const rootPkgPath = path.join(rootDir, 'package.json');
const helperPkgPath = path.join(rootDir, 'helper', 'package.json');
const frontendPkgPath = path.join(rootDir, 'frontend', 'package.json');

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const newVersion = (process.argv[2] && process.argv[2].trim()) || rootPkg.version;
if (process.argv[2] && process.argv[2].trim()) {
  rootPkg.version = newVersion;
  fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
}

function writeVersion(pkgPath, label) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`${label}: ${newVersion}`);
}

writeVersion(helperPkgPath, 'helper');
writeVersion(frontendPkgPath, 'frontend');
console.log('Version synced. Root is canonical at', newVersion);
