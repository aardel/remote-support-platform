const express = require('express');
const PDFDocument = require('pdfkit');
const { requireAuth } = require('../middleware/sessionAuth');
const Case = require('../models/Case');
const Session = require('../models/Session');
const Device = require('../models/Device');

const router = express.Router();

function computeRemoteViewingSeconds(sessionRow) {
    if (!sessionRow) return 0;
    let seconds = Number(sessionRow.billable_seconds || 0) || 0;
    const startedAt = sessionRow.billable_started_at ? new Date(sessionRow.billable_started_at).getTime() : null;
    if (startedAt && Number.isFinite(startedAt)) {
        seconds += Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    }
    return Math.max(0, Math.floor(seconds));
}

function fmtDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// List cases (Online Cases page)
router.get('/', requireAuth, async (req, res) => {
    try {
        const { status, q, deviceId, limit } = req.query;
        const rows = await Case.list({ status: status || undefined, q: q || undefined, deviceId: deviceId || undefined, limit });
        res.json({ cases: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create a case/report from a session after disconnect
router.post('/', requireAuth, async (req, res) => {
    try {
        const { sessionId, problemDescription, phoneSupportHours, whatsappSupportHours, phoneSupportMinutes, whatsappSupportMinutes } = req.body || {};
        if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
        const desc = String(problemDescription || '').trim();
        if (!desc) return res.status(400).json({ error: 'problemDescription required' });

        const session = await Session.findBySessionId(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const remoteViewingSeconds = computeRemoteViewingSeconds(session);

        const phoneMin =
            phoneSupportMinutes != null
                ? Math.max(0, Math.floor(Number(phoneSupportMinutes) || 0))
                : Math.max(0, Math.floor((Number(phoneSupportHours) || 0) * 60));
        const whatsappMin =
            whatsappSupportMinutes != null
                ? Math.max(0, Math.floor(Number(whatsappSupportMinutes) || 0))
                : Math.max(0, Math.floor((Number(whatsappSupportHours) || 0) * 60));

        const technicianId = req.user?.id || req.user?.nextcloudId || req.user?.username || 'technician';
        const technicianName = req.user?.username || 'Technician';

        let device = null;
        const deviceId = session.device_id || null;
        if (deviceId) {
            try { device = await Device.findByDeviceId(deviceId); } catch (_) {}
        }

        const customerName = session.customer_name || device?.customer_name || null;
        const machineName = session.machine_name || device?.machine_name || device?.display_name || null;

        const billableTotalSeconds = remoteViewingSeconds + (phoneMin * 60) + (whatsappMin * 60);

        const row = await Case.create({
            sessionId,
            deviceId,
            customerName,
            machineName,
            technicianId,
            technicianName,
            status: 'closed',
            problemDescription: desc,
            remoteViewingSeconds,
            phoneSupportMinutes: phoneMin,
            whatsappSupportMinutes: whatsappMin,
            billableTotalSeconds
        });

        res.json({ success: true, case: row });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:caseId', requireAuth, async (req, res) => {
    try {
        const row = await Case.findById(req.params.caseId);
        if (!row) return res.status(404).json({ error: 'Case not found' });
        res.json({ case: row });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete a case
router.delete('/:caseId', requireAuth, async (req, res) => {
    try {
        const deleted = await Case.deleteById(req.params.caseId);
        if (!deleted) return res.status(404).json({ error: 'Case not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Export case report PDF
router.get('/:caseId/pdf', requireAuth, async (req, res) => {
    try {
        const row = await Case.findById(req.params.caseId);
        if (!row) return res.status(404).json({ error: 'Case not found' });

        const filename = `case-${row.case_number || row.id}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        doc.pipe(res);

        doc.fontSize(18).text('Remote Support Case Report', { align: 'center' });
        doc.moveDown(1);

        doc.fontSize(11);
        doc.text(`Case: ${row.case_number || row.id}`);
        if (row.created_at) doc.text(`Created: ${new Date(row.created_at).toLocaleString()}`);
        doc.text(`Technician: ${row.technician_name || '—'}`);
        if (row.session_id) doc.text(`Session: ${row.session_id}`);
        doc.text(`Customer: ${row.customer_name || '—'}`);
        doc.text(`Machine: ${row.machine_name || '—'}`);
        doc.text(`Remote viewing: ${fmtDuration(row.remote_viewing_seconds || 0)}`);
        doc.text(`Phone support: ${Number(row.phone_support_minutes || 0)} min`);
        doc.text(`WhatsApp support: ${Number(row.whatsapp_support_minutes || 0)} min`);
        doc.text(`Total billable: ${fmtDuration(row.billable_total_seconds || 0)}`);

        doc.moveDown(1);
        doc.fontSize(12).text('Problem Description', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11).text(String(row.problem_description || '').trim() || '—', { width: 500, align: 'left' });

        doc.end();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

