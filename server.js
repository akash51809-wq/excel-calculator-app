const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= MONGODB ATLAS CONNECTION ================= //
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://akash51809_db_user:D74ZBED7uJ4R3FTz@cluster0.iwznzgx.mongodb.net/daybookDB?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ================= SCHEMAS & MODELS ================= //

// 1. Dealer Rules Schema (Dealer Name and Remark Mapping)
const DealerSchema = new mongoose.Schema({
    dealerName: { type: String, required: true },
    lapuNumbers: [String],
    remarkKeywords: [String],
    createdAt: { type: Date, default: Date.now }
});
const Dealer = mongoose.model('Dealer', DealerSchema);

// 2. Daily Record & Reports Schema
const DailyRecordSchema = new mongoose.Schema({
    recordDate: { type: String, required: true, unique: true },
    fileName: String,
    totalRows: Number,
    totalPurchase: { type: Number, default: 0 },
    totalSale: { type: Number, default: 0 },
    purchaseSaleDiff: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    closingBalance: { type: Number, default: 0 },
    previousClosingMatch: { type: Boolean, default: true },
    rawExcelData: Object,
    dealerWiseBreakdown: Object,
    createdAt: { type: Date, default: Date.now }
});
const DailyRecord = mongoose.model('DailyRecord', DailyRecordSchema);

// Ensure Uploads Directory Exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ================= PAGE ROUTES ================= //

app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, 'public', 'upload.html')));
app.get('/reports', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reports.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));

// ================= API ENDPOINTS ================= //

// Login API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        return res.json({ success: true, message: 'Login successful', redirectUrl: '/dashboard' });
    }
    return res.json({ success: true, message: 'Welcome back', redirectUrl: '/dashboard' });
});

// Upload and Process Excel (Saves to MongoDB Atlas)
app.post('/api/excel/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const recordDate = req.body.recordDate || new Date().toISOString().split('T')[0];

        // Read Excel
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Reconciliation Check: Match Yesterday Closing with Today Opening
        const prevDateObj = new Date(recordDate);
        prevDateObj.setDate(prevDateObj.getDate() - 1);
        const prevDateStr = prevDateObj.toISOString().split('T')[0];

        const prevRecord = await DailyRecord.findOne({ recordDate: prevDateStr });

        let currentOpening = 0;
        let isOpeningMatched = true;

        if (prevRecord && prevRecord.closingBalance !== undefined) {
            if (prevRecord.closingBalance !== currentOpening) {
                isOpeningMatched = false;
            }
        }

        // Save or Update Record in MongoDB Atlas
        await DailyRecord.findOneAndUpdate(
            { recordDate: recordDate },
            {
                recordDate: recordDate,
                fileName: req.file.originalname,
                totalRows: sheetData.length,
                rawExcelData: sheetData,
                previousClosingMatch: isOpeningMatched
            },
            { upsert: true, new: true }
        );

        // Delete temporary upload file
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("Temp file deletion error:", err);
        });

        res.json({
            success: true,
            message: 'Excel data stored in MongoDB Atlas successfully!',
            count: sheetData.length,
            recordDate: recordDate,
            previousClosingMatched: isOpeningMatched
        });

    } catch (error) {
        console.error('Processing Error:', error);
        res.status(500).json({ success: false, error: 'Failed to process Excel file' });
    }
});

// Get All Reports API
app.get('/api/excel/reports', async (req, res) => {
    try {
        const records = await DailyRecord.find().sort({ recordDate: -1 });
        res.json({ success: true, reports: records });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch reports from database' });
    }
});

// Dealers API
app.get('/api/dealers', async (req, res) => {
    try {
        const dealers = await Dealer.find();
        res.json({ success: true, dealers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch dealers' });
    }
});

app.post('/api/dealers', async (req, res) => {
    try {
        const { dealerName, lapuNumbers, remarkKeywords } = req.body;
        const dealer = new Dealer({ dealerName, lapuNumbers, remarkKeywords });
        await dealer.save();
        res.json({ success: true, dealer });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create dealer mapping' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});