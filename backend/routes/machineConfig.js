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

// Same line classification the frontend's Align Parameters / Format Check use
// (configTextTools.js) — kept in sync manually since this runs in a separate
// (CommonJS) module. Only lines that look like KEY=value / KEY|value /
// KEY<ws>value are treated as parameters; everything else (comments, section
// headers, blank lines) is ignored for diffing purposes.
function classifyLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (/^[/*]/.test(trimmed)) return null;
    if (/^;/.test(trimmed)) return null;
    if (/^\[.*\]$/.test(trimmed)) return null;
    if (/^[A-Za-z_][\w.]*\s*=/.test(trimmed)) return 'eq';
    if (/^[A-Za-z_][\w.]*\s*\|/.test(trimmed)) return 'pipe';
    if (/^[A-Za-z_][\w.]*(\s{2,}|\t)\S/.test(trimmed)) return 'ws';
    return null;
}

// Strips ALL whitespace — makes the value comparison immune to purely
// cosmetic reformatting (e.g. Align Parameters padding before a semicolon/
// comma so delimiters line up: "1;" vs "1   ;" must compare equal). Safe for
// this format since values are numeric/short tokens, not free text where
// whitespace could be meaningful.
function normalizeValue(v) {
    return String(v || '').replace(/\s+/g, '');
}

function parseKeyValueMap(text) {
    const map = new Map();
    String(text || '').split(/\r\n|\r|\n/).forEach((line) => {
        const type = classifyLine(line);
        if (!type) return;
        const trimmed = line.trim();
        let key, value;
        if (type === 'eq') {
            const idx = trimmed.indexOf('=');
            key = trimmed.slice(0, idx).trim();
            value = trimmed.slice(idx + 1);
        } else if (type === 'pipe') {
            const idx = trimmed.indexOf('|');
            key = trimmed.slice(0, idx).trim();
            value = trimmed.slice(idx + 1);
        } else {
            const m = trimmed.match(/^(\S+)(\s{2,}|\t)(.*)$/);
            key = m ? m[1] : trimmed;
            value = m ? m[3] : '';
        }
        if (key) map.set(key, normalizeValue(value));
    });
    return map;
}

// Semantic (key/value) diff rather than raw line-by-line comparison — a pure
// whitespace realignment (Align Parameters, or any reformatting that doesn't
// touch an actual value) must NOT show up as a change here, since this feeds
// both the pre-save confirmation dialog and the permanent audit log. Only
// keys whose actual value differs (or that were added/removed) are reported.
function diffContent(oldText, newText) {
    const oldMap = parseKeyValueMap(oldText);
    const newMap = parseKeyValueMap(newText);
    const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
    const changes = [];
    for (const key of allKeys) {
        const hasOld = oldMap.has(key);
        const hasNew = newMap.has(key);
        const oldValue = oldMap.get(key);
        const newValue = newMap.get(key);
        if (hasOld && hasNew && oldValue === newValue) continue; // identical — not a change
        changes.push({ key, oldValue: hasOld ? oldValue : null, newValue: hasNew ? newValue : null });
        if (changes.length >= 200) break; // cap — this is a summary, not a full diff viewer
    }
    return changes.sort((a, b) => a.key.localeCompare(b.key));
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
