const path = require('path');

exports.getDashboardPage = (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'dashboard.html'));
};

exports.getUploadPage = (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'upload.html'));
};

exports.getReportsPage = (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, '../public', 'reports.html'));
};

exports.getSettingsPage = (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.sendFile(path.join(__dirname, '../public', 'settings.html'));
};