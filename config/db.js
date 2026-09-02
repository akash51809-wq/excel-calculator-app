// config/db.js
const mongoose = require('mongoose');

/**
 * MongoDB Database Connection Config
 */
const connectDB = async () => {
    try {
        // Fallback URI अगर .env सेट न हो
        const connURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/excel_calc';

        const conn = await mongoose.connect(connURI);

        console.log(`MongoDB Connected Successfully: ${conn.connection.host}`);
    } catch (error) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        console.error('Note: Ensure MongoDB service is running via "sudo service mongodb start"');
        process.exit(1);
    }
};

module.exports = connectDB;