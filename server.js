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

app.set('trust proxy', 1);

// ================= EJS VIEW ENGINE SETUP ================= //
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ================= MONGODB CONNECTION ================= //
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://akash51809_db_user:D74ZBED7uJ4R3FTz@cluster0.iwznzgx.mongodb.net/daybookDB?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ================= SCHEMAS & MODELS ================= //
const dealerSchema = new mongoose.Schema({
    dealerName: { type: String, required: true },
    remarkKeyword: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Dealer = mongoose.model('Dealer', dealerSchema);

const settingsSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true },
    value: String
});
const Settings = mongoose.model('Settings', settingsSchema);

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

app.use(session({
    secret: 'daybook_secret_key_987654321',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        return next();
    }
    return res.redirect('/login');
}

app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.includes('.')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ================= AUTH ROUTES ================= //
app.get('/login', (req, res) => {
    if (req.session && req.session.isAuthenticated) return res.redirect('/dashboard');
    res.render('login');
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'Admin@123') {
        req.session.isAuthenticated = true;
        req.session.user = username;
        return res.json({ success: true });
    }
    return res.status(401).json({ success: false, error: 'Invalid User ID or Password' });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// ================= EXPLICIT VIEW ROUTES (EJS) ================= //
app.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', requireAuth, (req, res) => {
    res.render('dashboard');
});

app.get('/upload', requireAuth, (req, res) => {
    res.render('upload');
});

// Reports Submenu Routes
app.get('/reports/upload-report', requireAuth, (req, res) => {
    res.render('upload-report');
});

app.get('/reports/dealer-list', requireAuth, (req, res) => {
    res.render('dealer-list');
});

app.get('/settings', requireAuth, (req, res) => {
    res.render('settings');
});

// ================= API ENDPOINTS ================= //
app.get('/api/dealers', requireAuth, async (req, res) => {
    const dealers = await Dealer.find();
    res.json(dealers);
});

app.post('/api/dealers', requireAuth, async (req, res) => {
    const dealer = new Dealer(req.body);
    await dealer.save();
    res.json(dealer);
});

app.delete('/api/dealers/:id', requireAuth, async (req, res) => {
    await Dealer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/settings/mode', requireAuth, async (req, res) => {
    const setting = await Settings.findOne({ key: 'fetchMode' });
    res.json({ mode: setting ? setting.value : 'dealer_name' });
});

app.post('/api/settings/mode', requireAuth, async (req, res) => {
    const { mode } = req.body;
    await Settings.findOneAndUpdate({ key: 'fetchMode' }, { value: mode }, { upsert: true, new: true });
    res.json({ success: true, mode });
});

app.post('/api/excel/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No Excel file' });

        const recordDate = req.body.recordDate || new Date().toISOString().split('T')[0];
        const currentOpening = parseFloat(req.body.openingBalance) || 0;

        const activeMode = await Settings.findOne({ key: 'fetchMode' });
        const isRemarkMode = activeMode && activeMode.value === 'remark';

        const workbook = xlsx.readFile(req.file.path);
        const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const registeredDealers = await Dealer.find();

        let dayTotalPurchase = 0;
        let dayTotalSale = 0;
        let dealerSummary = {};

        sheetData.forEach(row => {
            const remarkCol = row['dealer name/remark'] || row['Dealer Name/Remark'] || row.Remark || row.remark || '';
            const dealerCol = row['Dealer Name'] || row['dealer name'] || row.Dealer || '';

            const cellValue = isRemarkMode ? String(remarkCol).toLowerCase() : String(dealerCol).toLowerCase();
            const typeStr = String(row.Type || row.type || '').toLowerCase();
            const amount = parseFloat(row.Amount || row.amount || 0) || 0;

            let matchedDealer = "Unassigned / General";
            registeredDealers.forEach(d => {
                const searchKeyword = isRemarkMode ? d.remarkKeyword.toLowerCase() : d.dealerName.toLowerCase();
                if (cellValue.includes(searchKeyword)) matchedDealer = d.dealerName;
            });

            if (!dealerSummary[matchedDealer]) dealerSummary[matchedDealer] = { purchase: 0, sale: 0 };

            if (typeStr.includes('credit') || typeStr.includes('purchase') || amount > 0) {
                dayTotalPurchase += Math.abs(amount);
                dealerSummary[matchedDealer].purchase += Math.abs(amount);
            } else {
                dayTotalSale += Math.abs(amount);
                dealerSummary[matchedDealer].sale += Math.abs(amount);
            }
        });

        const prevDateObj = new Date(recordDate);
        prevDateObj.setDate(prevDateObj.getDate() - 1);
        const prevRecord = await DailyRecord.findOne({ recordDate: prevDateObj.toISOString().split('T')[0] });

        let isOpeningMatched = true;
        if (prevRecord && prevRecord.closingBalance !== undefined && prevRecord.closingBalance !== currentOpening) {
            isOpeningMatched = false;
        }

        const calculatedDiff = dayTotalPurchase - dayTotalSale;
        const calculatedClosing = currentOpening + calculatedDiff;

        const updatedRecord = await DailyRecord.findOneAndUpdate(
            { recordDate: recordDate },
            {
                recordDate, fileName: req.file.originalname, totalRows: sheetData.length,
                totalPurchase: dayTotalPurchase, totalSale: dayTotalSale, purchaseSaleDiff: calculatedDiff,
                openingBalance: currentOpening, closingBalance: calculatedClosing,
                previousClosingMatch: isOpeningMatched, dealerBreakdown: dealerSummary, rawExcelData: sheetData
            },
            { upsert: true, new: true }
        );

        fs.unlink(req.file.path, () => {});
        res.json({ success: true, data: updatedRecord });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Excel processing error' });
    }
});

app.get('/api/excel/reports', requireAuth, async (req, res) => {
    const records = await DailyRecord.find().sort({ recordDate: -1 });
    res.json({ success: true, reports: records });
});

app.get('/api/excel/dealers-list', requireAuth, async (req, res) => {
    try {
        const records = await DailyRecord.find();
        let dealerMap = {};

        records.forEach(record => {
            if (record.rawExcelData && Array.isArray(record.rawExcelData)) {
                record.rawExcelData.forEach(row => {
                    const dealerCol = row['Dealer Name'] || row['dealer name'] || row.Dealer || row['dealer name/remark'] || row['Dealer Name/Remark'] || row.Remark || row.remark || 'Unassigned';
                    const retailerNo = row['RetailerNo'] || row['retailerno'] || row['Retailer No'] || row['retailer no'] || row['Mobile'] || row['mobile'] || '';

                    let cleanDealer = String(dealerCol).trim();
                    if (!cleanDealer) cleanDealer = 'Unassigned';

                    if (!dealerMap[cleanDealer]) {
                        dealerMap[cleanDealer] = new Set();
                    }

                    if (retailerNo) {
                        dealerMap[cleanDealer].add(String(retailerNo).trim());
                    }
                });
            }
        });

        const formattedDealers = Object.keys(dealerMap).map((dealerName, index) => {
            return {
                id: index + 1,
                dealerName: dealerName,
                lapuNumbers: Array.from(dealerMap[dealerName])
            };
        });

        res.json({ success: true, dealers: formattedDealers });
    } catch (err) {
        console.error("Error fetching dealer list:", err);
        res.status(500).json({ success: false, error: 'Failed to extract dealers' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));