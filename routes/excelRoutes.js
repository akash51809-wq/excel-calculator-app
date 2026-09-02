const express = require('express');
const router = express.Router();
const excelController = require('../controllers/excelController');

// Route Mappings
router.get('/dashboard', excelController.getDashboardPage);
router.get('/upload', excelController.getUploadPage);
router.get('/reports', excelController.getReportsPage);
router.get('/settings', excelController.getSettingsPage);

module.exports = router;