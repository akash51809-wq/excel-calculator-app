// routes/excelRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

// File Upload Config
const upload = multer({ dest: 'uploads/' });

// Import Controllers
const { uploadExcel, getReports, getFileDetails } = require('../controllers/excelController');

// Define API Endpoints
router.post('/upload', upload.single('file'), uploadExcel);
router.get('/reports', getReports);
router.get('/file-details', getFileDetails);

module.exports = router;