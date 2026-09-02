// models/ExcelData.js
const mongoose = require('mongoose');

const excelDataSchema = new mongoose.Schema({
    fileName: {
        type: String,
        required: true
    },
    recordDate: {
        type: Date,
        default: Date.now
    },
    // Raw excel row data saved safely
    originalData: {
        type: Object,
        required: true
    },
    // Calculated values
    expectedClosing: {
        type: Number,
        required: true
    },
    actualClosing: {
        type: Number,
        required: true
    },
    isMatched: {
        type: Boolean,
        default: false
    },
    diffPercent: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ExcelData', excelDataSchema);