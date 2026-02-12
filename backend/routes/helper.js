const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const PACKAGES_DIR = path.join(__dirname, '../../packages');
const VERSION_FILE = path.join(PACKAGES_DIR, 'support-template.version');

function getLatestVersion() {
  if (fs.existsSync(VERSION_FILE)) {
    try {
      return fs.readFileSync(VERSION_FILE, 'utf8').trim();
    } catch (e) {
      /* ignore */
    }
  }
  try {
    const pkg = require('../../package.json');
    return pkg.version || '0.0.0';
  } catch (e) {
    return '0.0.0';
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * GET /api/helper/update-info?platform=win|darwin&currentVersion=1.0.1
 * No auth - called by the helper app on the customer's machine.
 * Returns latest version and download URL so the helper can prompt "Upgrade now or next session?"
 */
router.get('/update-info', (req, res) => {
  try {
    const platform = (req.query.platform || process.platform || '').toString().toLowerCase();
    const currentVersion = (req.query.currentVersion || '0.0.0').trim();
    const latestVersion = getLatestVersion();

    const platformKey = platform === 'darwin' || platform === 'mac' ? 'darwin' : 'win';
    const ext = platformKey === 'darwin' ? 'dmg' : 'exe';
    const templatePath = path.join(PACKAGES_DIR, `support-template.${ext}`);
    const available = fs.existsSync(templatePath);

    // Only check version comparison - no timestamp checks
    const versionCmp = compareVersions(latestVersion, currentVersion);
    const updateAvailable = available && versionCmp > 0;

    // Use SERVER_URL env if set (includes correct port), otherwise reconstruct from request
    const baseUrl = process.env.SERVER_URL
      ? process.env.SERVER_URL.replace(/\/$/, '')
      : (req.protocol + '://' + req.get('host')).replace(/\/$/, '');
    const downloadUrl = available ? `${baseUrl}/api/helper/download/${platformKey}` : null;

    res.json({
      updateAvailable,
      currentVersion,
      latestVersion,
      downloadUrl,
      releaseNotes: updateAvailable
        ? `Version ${latestVersion} is available.`
        : null
    });
  } catch (e) {
    console.error('Helper update-info error:', e);
    res.status(500).json({ updateAvailable: false, error: e.message });
  }
});

/**
 * GET /api/helper/download/:platform (win | darwin)
 * Serves the latest helper installer (support-template.exe or .dmg). No auth.
 */
router.get('/download/:platform', (req, res) => {
  try {
    const platform = (req.params.platform || '').toLowerCase();
    const ext = platform === 'darwin' ? 'dmg' : 'exe';
    const version = getLatestVersion();
    const filePath = path.join(PACKAGES_DIR, `support-template.${ext}`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Helper installer not available for this platform.' });
    }

    const filename = platform === 'darwin'
      ? `RemoteSupport-${version}.dmg`
      : `RemoteSupport-Setup-${version}.exe`;
    const contentType = ext === 'exe' ? 'application/x-msdownload' : 'application/x-apple-diskimage';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath);
  } catch (e) {
    console.error('Helper download error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
