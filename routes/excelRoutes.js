const express = require('express');
const router = express.Router();
const path = require('path');

// Page Handlers with Anti-Cache Headers
router.get('/dashboard', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, '../public', 'dashboard.html'));
});

router.get('/upload', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, '../public', 'upload.html'));
});

router.get('/reports', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, '../public', 'reports.html'));
});

router.get('/settings', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, '../public', 'settings.html'));
});

module.exports = router;