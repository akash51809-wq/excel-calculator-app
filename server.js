require('dotenv').config();
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
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) console.error('❌ MONGODB_URI/MONGO_URI environment variable is not set.');
else mongoose.connect(MONGO_URI).then(() => console.log('✅ Connected to MongoDB Atlas Successfully!')).catch(err => console.error('❌ MongoDB Connection Error:', err));

const dealerSchema = new mongoose.Schema({ dealerName:{type:String,required:true}, remarkKeyword:{type:String,required:true}, createdAt:{type:Date,default:Date.now} });
const Dealer = mongoose.model('Dealer', dealerSchema);
const settingsSchema = new mongoose.Schema({ key:{type:String,unique:true,required:true}, value:String });
const Settings = mongoose.model('Settings', settingsSchema);
const dailyRecordSchema = new mongoose.Schema({ recordDate:{type:String,required:true,unique:true}, fileName:String, totalRows:Number, totalPurchase:{type:Number,default:0}, totalSale:{type:Number,default:0}, purchaseSaleDiff:{type:Number,default:0}, openingBalance:{type:Number,default:0}, closingBalance:{type:Number,default:0}, previousClosingMatch:{type:Boolean,default:true}, dealerBreakdown:Object, rawExcelData:Object, createdAt:{type:Date,default:Date.now} });
const DailyRecord = mongoose.model('DailyRecord', dailyRecordSchema);

const uploadDir = path.join(__dirname,'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({ destination:(req,file,cb)=>cb(null,uploadDir), filename:(req,file,cb)=>cb(null,Date.now()+'-'+file.originalname) });
const upload = multer({storage});
app.use(cors()); app.use(express.json()); app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,cookie:{maxAge:24*60*60*1000,secure:process.env.NODE_ENV==='production',sameSite:'lax'}}));
function requireAuth(req,res,next){ if(req.session&&req.session.isAuthenticated)return next(); return res.redirect('/login'); }
app.use((req,res,next)=>{ if(req.method==='GET'&&!req.path.startsWith('/api/')&&!req.path.includes('.'))res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private'); next(); });
app.use(express.static(path.join(__dirname,'public')));

app.get('/login',(req,res)=>{if(req.session&&req.session.isAuthenticated)return res.redirect('/dashboard');res.render('login');});
app.post('/api/login',(req,res)=>{const {username,password}=req.body;if(username===process.env.ADMIN_USERNAME&&password===process.env.ADMIN_PASSWORD){req.session.isAuthenticated=true;req.session.user=username;return res.json({success:true});}return res.status(401).json({success:false,error:'Invalid User ID or Password'});});
app.get('/api/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

app.get('/',requireAuth,(req,res)=>res.redirect('/dashboard'));
app.get('/dashboard',requireAuth,(req,res)=>res.render('dashboard'));
app.get('/upload',requireAuth,(req,res)=>res.render('upload'));
app.get('/reports/upload-report',requireAuth,(req,res)=>res.render('upload-report'));
app.get('/reports/dealer-list',requireAuth,(req,res)=>res.render('dealer-list'));
app.get('/reports/purchase-report',requireAuth,(req,res)=>res.render('purchase-report'));
app.get('/settings',requireAuth,(req,res)=>res.render('settings'));

app.get('/api/dealers',requireAuth,async(req,res)=>{try{res.json(await Dealer.find());}catch(err){res.status(500).json({success:false,error:'Failed to fetch dealers'});}});
app.post('/api/dealers',requireAuth,async(req,res)=>{try{const dealer=new Dealer(req.body);await dealer.save();res.json(dealer);}catch(err){res.status(500).json({success:false,error:'Failed to save dealer'});}});
app.delete('/api/dealers/:id',requireAuth,async(req,res)=>{try{await Dealer.findByIdAndDelete(req.params.id);res.json({success:true});}catch(err){res.status(500).json({success:false,error:'Failed to delete dealer'});}});
app.get('/api/settings/mode',requireAuth,async(req,res)=>{try{const setting=await Settings.findOne({key:'fetchMode'});res.json({mode:setting?setting.value:'dealer_name'});}catch(err){res.status(500).json({success:false,error:'Failed to fetch settings'});}});
app.post('/api/settings/mode',requireAuth,async(req,res)=>{try{const {mode}=req.body;await Settings.findOneAndUpdate({key:'fetchMode'},{value:mode},{upsert:true,new:true});res.json({success:true,mode});}catch(err){res.status(500).json({success:false,error:'Failed to update settings'});}});

app.post('/api/excel/upload',requireAuth,upload.single('file'),async(req,res)=>{try{
 if(!req.file)return res.status(400).json({success:false,error:'No Excel file'});
 const recordDate=req.body.recordDate||new Date().toISOString().split('T')[0]; const currentOpening=parseFloat(req.body.openingBalance)||0;
 const activeMode=await Settings.findOne({key:'fetchMode'}); const isRemarkMode=activeMode&&activeMode.value==='remark';
 const workbook=xlsx.readFile(req.file.path); const sheetData=xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); const registeredDealers=await Dealer.find();
 let dayTotalPurchase=0,dayTotalSale=0,dealerSummary={};
 sheetData.forEach(row=>{const remarkCol=row['dealer name/remark']||row['Dealer Name/Remark']||row.Remark||row.remark||'';const dealerCol=row['Dealer Name']||row['dealer name']||row.Dealer||'';const cellValue=isRemarkMode?String(remarkCol).toLowerCase():String(dealerCol).toLowerCase();const typeStr=String(row.Type||row.type||'').toLowerCase();const amount=parseFloat(row.Amount||row.amount||0)||0;let matchedDealer='Unassigned / General';registeredDealers.forEach(d=>{const searchKeyword=isRemarkMode?d.remarkKeyword.toLowerCase():d.dealerName.toLowerCase();if(cellValue.includes(searchKeyword))matchedDealer=d.dealerName;});if(!dealerSummary[matchedDealer])dealerSummary[matchedDealer]={purchase:0,sale:0};if(typeStr.includes('credit')||typeStr.includes('purchase')||amount>0){dayTotalPurchase+=Math.abs(amount);dealerSummary[matchedDealer].purchase+=Math.abs(amount);}else{dayTotalSale+=Math.abs(amount);dealerSummary[matchedDealer].sale+=Math.abs(amount);}});
 const prevDateObj=new Date(recordDate);prevDateObj.setDate(prevDateObj.getDate()-1);const prevRecord=await DailyRecord.findOne({recordDate:prevDateObj.toISOString().split('T')[0]});const isOpeningMatched=!(prevRecord&&prevRecord.closingBalance!==undefined&&prevRecord.closingBalance!==currentOpening);const calculatedDiff=dayTotalPurchase-dayTotalSale;const calculatedClosing=currentOpening+calculatedDiff;
 const updatedRecord=await DailyRecord.findOneAndUpdate({recordDate},{recordDate,fileName:req.file.originalname,totalRows:sheetData.length,totalPurchase:dayTotalPurchase,totalSale:dayTotalSale,purchaseSaleDiff:calculatedDiff,openingBalance:currentOpening,closingBalance:calculatedClosing,previousClosingMatch:isOpeningMatched,dealerBreakdown:dealerSummary,rawExcelData:sheetData},{upsert:true,new:true});
 fs.unlink(req.file.path,()=>{});res.json({success:true,data:updatedRecord});
}catch(error){console.error('Excel processing error:',error);if(req.file&&req.file.path)fs.unlink(req.file.path,()=>{});res.status(500).json({success:false,error:'Excel processing error'});}});

app.get('/api/excel/reports',requireAuth,async(req,res)=>{try{const records=await DailyRecord.find().sort({recordDate:-1});res.json({success:true,reports:records});}catch(err){res.status(500).json({success:false,error:'Failed to fetch reports'});}});
app.get('/api/excel/dealers-list',requireAuth,async(req,res)=>{try{const records=await DailyRecord.find();let dealerMap={};records.forEach(record=>{if(record.rawExcelData&&Array.isArray(record.rawExcelData))record.rawExcelData.forEach(row=>{const dealerCol=row['Dealer Name']||row['dealer name']||row.Dealer||row['dealer name/remark']||row['Dealer Name/Remark']||row.Remark||row.remark||'Unassigned';const retailerNo=row['RetailerNo']||row['retailerno']||row['Retailer No']||row['retailer no']||row['Mobile']||row['mobile']||'';let cleanDealer=String(dealerCol).trim();if(!cleanDealer)cleanDealer='Unassigned';if(!dealerMap[cleanDealer])dealerMap[cleanDealer]=new Set();if(retailerNo)dealerMap[cleanDealer].add(String(retailerNo).trim());});});const formattedDealers=Object.keys(dealerMap).map((dealerName,index)=>({id:index+1,dealerName,lapuNumbers:Array.from(dealerMap[dealerName])}));res.json({success:true,dealers:formattedDealers});}catch(err){console.error('Error fetching dealer list:',err);res.status(500).json({success:false,error:'Failed to extract dealers'});}});

app.listen(PORT,()=>console.log(`🚀 Server running on http://localhost:${PORT}`));