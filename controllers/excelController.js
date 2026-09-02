// controllers/excelController.js
const XLSX = require('xlsx');
const ExcelData = require('../models/ExcelData');
const { parseExcelRecords } = require('../utils/excelParser');

// Upload and Process Excel File
exports.uploadExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Excel file is required!' });
        }

        const recordDate = req.body.recordDate ? new Date(req.body.recordDate) : new Date();
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Process data using excelParser util
        const processedRecords = parseExcelRecords(rawData, req.file.originalname, recordDate);

        // Save into Database
        const savedData = await ExcelData.insertMany(processedRecords);

        res.json({
            success: true,
            message: 'Excel processing completed and saved successfully!',
            count: savedData.length
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get Summary Reports
exports.getReports = async (req, res) => {
    try {
        const reports = await ExcelData.aggregate([
            {
                $group: {
                    _id: "$fileName",
                    fileName: { $first: "$fileName" },
                    recordDate: { $first: "$recordDate" },
                    count: { $sum: 1 },
                    mismatchedCount: {
                        $sum: { $cond: [{ $eq: ["$isMatched", false] }, 1, 0] }
                    },
                    createdAt: { $max: "$createdAt" }
                }
            },
            { $sort: { createdAt: -1 } }
        ]);

        res.json({ success: true, reports });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get Details for Specific File
exports.getFileDetails = async (req, res) => {
    try {
        const fileName = req.query.fileName;
        const records = await ExcelData.find({ fileName });
        res.json({ success: true, records });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};