#!/usr/bin/env node
/* eslint-disable no-console */
const Session = require('../models/Session');
const PackageArtifacts = require('../services/packageArtifacts');

async function main() {
    const validSessionIds = await Session.listSessionIds();
    const stats = await PackageArtifacts.cleanupOrphanArtifacts({ validSessionIds });
    console.log(JSON.stringify({ ok: true, ...stats }, null, 2));
}

main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: e && e.message ? e.message : String(e) }, null, 2));
    process.exit(1);
});

