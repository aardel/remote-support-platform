const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/sessionAuth');
const { rateLimit } = require('../middleware/rateLimit');
const MachineConfigBackup = require('../models/MachineConfigBackup');
const AuditLog = require('../models/AuditLog');

const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB — generous for .mk/pfields.dat, guards against abuse

function tooLarge(content) {
    return typeof content !== 'string' || content.length > MAX_CONTENT_SIZE;
}

// Line-level diff: identifies changed lines and, where the line looks like
// KEY=value / KEY value / KEY|value, extracts the key so the audit trail and
// the pre-save confirmation can show "KEY: old -> new" instead of raw lines.
function diffContent(oldText, newText) {
    const oldLines = String(oldText || '').split(/\r\n|\r|\n/);
    const newLines = String(newText || '').split(/\r\n|\r|\n/);
    const max = Math.max(oldLines.length, newLines.length);
    const changes = [];
    for (let i = 0; i < max; i++) {
        const a = oldLines[i] ?? '';
        const b = newLines[i] ?? '';
        if (a === b) continue;
        const keyOf = (line) => {
            const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*[=|\t]/);
            return m ? m[1] : null;
        };
        changes.push({ line: i + 1, key: keyOf(a) || keyOf(b), oldValue: a.trim(), newValue: b.trim() });
        if (changes.length >= 200) break; // cap — this is a summary, not a full diff viewer
    }
    return changes;
}

const VALID_BACKUP_REASONS = ['pre-edit', 'pre-save', 'post-edit'];

// Safety snapshot — taken when a file is opened ("pre-edit") and again right
// before every write-back to the machine ("pre-save", covering the case where
// a technician saves more than once in the same session — otherwise only the
// very first open would be recoverable, not the state just before a later edit).
router.post('/backup', requireAuth, rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
    try {
        const { sessionId, deviceId, filePath, content, reason, onMachinePath } = req.body || {};
        if (!filePath || tooLarge(content)) {
            return res.status(400).json({ error: 'filePath and content (<=5MB) are required' });
        }
        const row = await MachineConfigBackup.create({
            sessionId, deviceId, filePath, content,
            technician: req.user?.username || req.user?.displayName || 'technician',
            reason: VALID_BACKUP_REASONS.includes(reason) ? reason : 'pre-edit',
            onMachinePath: typeof onMachinePath === 'string' ? onMachinePath.slice(0, 1000) : null
        });
        AuditLog.log('machine_config_backup', {
            sessionId, deviceId, actor: req.user?.username,
            detail: { filePath, backupId: row.id, reason: row.reason, onMachinePath: row.on_machine_path }
        });
        res.json({ success: true, backup: row });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Called after a successful write-back to the customer's machine: logs the
// diff as a structured, durable audit event (not a comment inside the file).
router.post('/log-change', requireAuth, rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
    try {
        const { sessionId, deviceId, filePath, oldContent, newContent, backupId } = req.body || {};
        if (!filePath || tooLarge(oldContent) || tooLarge(newContent)) {
            return res.status(400).json({ error: 'filePath, oldContent and newContent (<=5MB each) are required' });
        }
        const changes = diffContent(oldContent, newContent);
        const actor = req.user?.username || req.user?.displayName || 'technician';
        AuditLog.log('machine_config_changed', {
            sessionId, deviceId, actor,
            detail: { filePath, backupId: backupId || null, changeCount: changes.length, changes: changes.slice(0, 50) }
        });
        res.json({ success: true, changeCount: changes.length, changes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Compute a diff without logging anything — used for the pre-save confirmation
// dialog so the technician (and optionally the customer) sees exactly what
// will change before it's written to the live machine.
router.post('/diff', requireAuth, rateLimit({ windowMs: 60 * 1000, max: 60 }), (req, res) => {
    const { oldContent, newContent } = req.body || {};
    if (tooLarge(oldContent) || tooLarge(newContent)) {
        return res.status(400).json({ error: 'oldContent and newContent (<=5MB each) are required' });
    }
    const changes = diffContent(oldContent, newContent);
    res.json({ changeCount: changes.length, changes });
});

router.get('/backups', requireAuth, async (req, res) => {
    try {
        const { deviceId, sessionId, filePath, limit } = req.query;
        const rows = await MachineConfigBackup.list({ deviceId, sessionId, filePath, limit: Number(limit) || undefined });
        res.json({ backups: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/backups/:id', requireAuth, async (req, res) => {
    try {
        const row = await MachineConfigBackup.getById(req.params.id);
        if (!row) return res.status(404).json({ error: 'Backup not found' });
        res.json({ backup: row });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
