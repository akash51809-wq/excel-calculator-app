const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');

// Import Models & Routes
const excelRoutes = require('./routes/excelRoutes');

const app = express();
const PORT = process.env.PORT || 10000;

// ================= MONGODB CONNECTION ================= //
const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://akash51809_db_user:D74ZBED7uJ4R3FTz@cluster0.iwznzgx.mongodb.net/daybookDB?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Database Schemas & Models
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

// Upload Directory Setup
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
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Anti-Cache & Public Folder Configuration
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        return next();
    }
    return res.redirect('/login');
}

// ================= AUTHENTICATION ROUTES ================= //
app.get('/login', (req, res) => {
    if (req.session && req.session.isAuthenticated) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
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

app.get('/api/excel/reports', requireAuth, async (req, res) => {
    const records = await DailyRecord.find().sort({ recordDate: -1 });
    res.json({ success: true, reports: records });
});

// ================= PAGE ROUTING VIA CONTROLLER ================= //
app.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));
app.use('/', requireAuth, excelRoutes);

// Server Init
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));