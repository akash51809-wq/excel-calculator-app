const express = require('express');
const session = require('express-session');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// ================= MONGODB CONNECTION ================= //
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://akash51809_db_user:D74ZBED7uJ4R3FTz@cluster0.iwznzgx.mongodb.net/daybookDB?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ================= SCHEMAS & MODELS ================= //

// 1. Dealer Mapping Schema
const dealerSchema = new mongoose.Schema({
    dealerName: { type: String, required: true },
    remarkKeyword: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Dealer = mongoose.model('Dealer', dealerSchema);

// 2. Global Settings Schema
const settingsSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    value: String
});
const Settings = mongoose.model('Settings', settingsSchema);

// 3. Daily Transaction & Reconciliation Schema
const dailyRecordSchema = new mongoose.Schema({
    recordDate: { type: String, required: true, unique: true },
    fileName: String,
    totalRows: Number,
    totalPurchase: { type: Number, default: 0 },
    totalSale: { type: Number, default: 0 },
    purchaseSaleDiff: { type: Number, default: 0 },
    openingBalance: { type: Number, default: 0 },
    closingBalance: { type: Number, default: 0 },
    previousClosingMatch: { type: Boolean, default: true },
    dealerBreakdown: Object,
    rawExcelData: Object,
    createdAt: { type: Date, default: Date.now }
});
const DailyRecord = mongoose.model('DailyRecord', dailyRecordSchema);

// Upload Storage Setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session Configuration
app.use(session({
    secret: 'daybook_secret_key_987654321',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 Hours Session
}));

// Authentication Middleware to protect routes
function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        return next();
    }
    return res.redirect('/login');
}

// Serve public static assets (CSS, JS) but keep HTML protected
app.use('/assets', express.static(path.join(__dirname, 'public')));

// ================= AUTHENTICATION ROUTES ================= //

app.get('/login', (req, res) => {
    if (req.session && req.session.isAuthenticated) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'Admin@123') {
        req.session.isAuthenticated = true;
        req.session.user = username;
        return res.json({ success: true, message: 'Login successful' });
    }
    return res.status(401).json({ success: false, error: 'Invalid User ID or Password' });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ================= PROTECTED PAGE ROUTES ================= //

app.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/upload', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'upload.html')));
app.get('/reports', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'reports.html')));
app.get('/settings', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));

// ================= PROTECTED API ENDPOINTS ================= //

// 1. Dealer Rules APIs
app.get('/api/dealers', requireAuth, async (req, res) => {
    try {
        const dealers = await Dealer.find();
        res.json(dealers);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch dealers' });
    }
});

app.post('/api/dealers', requireAuth, async (req, res) => {
    try {
        const { dealerName, remarkKeyword } = req.body;
        const dealer = new Dealer({ dealerName, remarkKeyword });
        await dealer.save();
        res.json(dealer);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save dealer' });
    }
});

app.delete('/api/dealers/:id', requireAuth, async (req, res) => {
    try {
        await Dealer.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Dealer deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete dealer' });
    }
});

// 2. Fetch Mode Settings APIs (Switch Button)
app.get('/api/settings/mode', requireAuth, async (req, res) => {
    try {
        const setting = await Settings.findOne({ key: 'fetchMode' });
        res.json({ mode: setting ? setting.value : 'dealer_name' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch settings mode' });
    }
});

app.post('/api/settings/mode', requireAuth, async (req, res) => {
    try {
        const { mode } = req.body;
        await Settings.findOneAndUpdate(
            { key: 'fetchMode' },
            { value: mode },
            { upsert: true, new: true }
        );
        res.json({ success: true, mode });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save settings mode' });
    }
});

// 3. Excel Upload & Reconciliation Processing API
app.post('/api/excel/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No Excel file uploaded' });
        }

        const recordDate = req.body.recordDate || new Date().toISOString().split('T')[0];
        const currentOpening = parseFloat(req.body.openingBalance) || 0;

        // Active Mode Check (Dealer Name vs Remark)
        const activeMode = await Settings.findOne({ key: 'fetchMode' });
        const isRemarkMode = activeMode && activeMode.value === 'remark';

        // Read Excel File
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Fetch Saved Dealers Configuration
        const registeredDealers = await Dealer.find();

        let dayTotalPurchase = 0;
        let dayTotalSale = 0;
        let dealerSummary = {};

        sheetData.forEach(row => {
            const remarkCol = row['dealer name/remark'] || row['Dealer Name/Remark'] || row.Remark || row.remark || '';
            const dealerCol = row['Dealer Name'] || row['dealer name'] || row.Dealer || '';

            const cellValueToMatch = isRemarkMode ? String(remarkCol).toLowerCase() : String(dealerCol).toLowerCase();
            const typeStr = String(row.Type || row.type || '').toLowerCase();
            const amount = parseFloat(row.Amount || row.amount || 0) || 0;

            let matchedDealer = "Unassigned / General";

            registeredDealers.forEach(d => {
                const searchKeyword = isRemarkMode ? d.remarkKeyword.toLowerCase() : d.dealerName.toLowerCase();
                if (cellValueToMatch.includes(searchKeyword)) {
                    matchedDealer = d.dealerName;
                }
            });

            if (!dealerSummary[matchedDealer]) {
                dealerSummary[matchedDealer] = { purchase: 0, sale: 0 };
            }

            if (typeStr.includes('credit') || typeStr.includes('purchase') || amount > 0) {
                dayTotalPurchase += Math.abs(amount);
                dealerSummary[matchedDealer].purchase += Math.abs(amount);
            } else {
                dayTotalSale += Math.abs(amount);
                dealerSummary[matchedDealer].sale += Math.abs(amount);
            }
        });

        // Previous Closing Reconciliation Logic
        const prevDateObj = new Date(recordDate);
        prevDateObj.setDate(prevDateObj.getDate() - 1);
        const prevDateStr = prevDateObj.toISOString().split('T')[0];

        const prevRecord = await DailyRecord.findOne({ recordDate: prevDateStr });

        let isOpeningMatched = true;
        if (prevRecord && prevRecord.closingBalance !== undefined) {
            if (prevRecord.closingBalance !== currentOpening) {
                isOpeningMatched = false;
            }
        }

        const calculatedDiff = dayTotalPurchase - dayTotalSale;
        const calculatedClosing = currentOpening + calculatedDiff;

        // Save Record to MongoDB
        const updatedRecord = await DailyRecord.findOneAndUpdate(
            { recordDate: recordDate },
            {
                recordDate: recordDate,
                fileName: req.file.originalname,
                totalRows: sheetData.length,
                totalPurchase: dayTotalPurchase,
                totalSale: dayTotalSale,
                purchaseSaleDiff: calculatedDiff,
                openingBalance: currentOpening,
                closingBalance: calculatedClosing,
                previousClosingMatch: isOpeningMatched,
                dealerBreakdown: dealerSummary,
                rawExcelData: sheetData
            },
            { upsert: true, new: true }
        );

        fs.unlink(req.file.path, () => {});

        res.json({
            success: true,
            message: 'Excel parsed and reconciled successfully!',
            data: updatedRecord
        });

    } catch (error) {
        console.error('Processing Error:', error);
        res.status(500).json({ success: false, error: 'Failed to process Excel file' });
    }
});

// 4. Reports API
app.get('/api/excel/reports', requireAuth, async (req, res) => {
    try {
        const records = await DailyRecord.find().sort({ recordDate: -1 });
        res.json({ success: true, reports: records });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch reports' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));