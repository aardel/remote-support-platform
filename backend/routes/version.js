const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

router.get('/', (req, res) => {
  const rootPkgPath = path.join(__dirname, '../../package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
    res.json({ version: pkg.version, name: pkg.name || 'remote-support-platform' });
  } catch (e) {
    res.status(500).json({ version: '0.0.0', name: 'remote-support-platform' });
  }
});

module.exports = router;
