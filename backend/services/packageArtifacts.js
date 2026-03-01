const fs = require('fs/promises');
const path = require('path');

const SESSION_ID_RE = /^[A-Z0-9]{3}-[0-9]{3}-[A-Z0-9]{3}$/;
const SUPPORT_FILE_RE = /^support-([A-Z0-9]{3}-[0-9]{3}-[A-Z0-9]{3})\.(zip|exe|dmg)$/;

function getPackagesDir() {
    return path.join(__dirname, '../../packages');
}

function isSessionId(s) {
    return SESSION_ID_RE.test(String(s || ''));
}

async function pathExists(p) {
    try {
        await fs.access(p);
        return true;
    } catch (_) {
        return false;
    }
}

async function deleteArtifactsForSession({ sessionId, packagesDir = getPackagesDir() }) {
    if (!isSessionId(sessionId)) {
        return { deleted: 0, skipped: true };
    }

    const targets = [
        path.join(packagesDir, sessionId),
        path.join(packagesDir, `support-${sessionId}.zip`),
        path.join(packagesDir, `support-${sessionId}.exe`),
        path.join(packagesDir, `support-${sessionId}.dmg`)
    ];

    let deleted = 0;
    for (const t of targets) {
        if (!(await pathExists(t))) continue;
        try {
            const st = await fs.lstat(t);
            if (st.isDirectory()) {
                await fs.rm(t, { recursive: true, force: true });
            } else {
                await fs.rm(t, { force: true });
            }
            deleted++;
        } catch (_) {
            // Best-effort cleanup: do not throw from a delete handler.
        }
    }

    return { deleted, skipped: false };
}

async function cleanupOrphanArtifacts({ validSessionIds, packagesDir = getPackagesDir() }) {
    const keep = new Set((validSessionIds || []).filter(isSessionId));

    let deletedDirs = 0;
    let deletedFiles = 0;

    let entries = [];
    try {
        entries = await fs.readdir(packagesDir, { withFileTypes: true });
    } catch (_) {
        return { deletedDirs, deletedFiles };
    }

    for (const ent of entries) {
        const name = ent.name;

        // Always keep bundles and templates.
        if (name === 'bundles') continue;
        if (name === 'support-template.version') continue;
        if (name.startsWith('support-template.')) continue;

        if (ent.isDirectory()) {
            if (isSessionId(name) && !keep.has(name)) {
                try {
                    await fs.rm(path.join(packagesDir, name), { recursive: true, force: true });
                    deletedDirs++;
                } catch (_) {}
            }
            continue;
        }

        if (ent.isFile()) {
            const m = name.match(SUPPORT_FILE_RE);
            if (m) {
                const sid = m[1];
                if (!keep.has(sid)) {
                    try {
                        await fs.rm(path.join(packagesDir, name), { force: true });
                        deletedFiles++;
                    } catch (_) {}
                }
            }
        }
    }

    return { deletedDirs, deletedFiles };
}

module.exports = {
    getPackagesDir,
    deleteArtifactsForSession,
    cleanupOrphanArtifacts
};

