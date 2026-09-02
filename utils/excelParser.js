// utils/excelParser.js

/**
 * Excel Column Reader & Formula Processing Engine
 * Formula: LASTCLOSING + PURCHASEDIFF + ROFFER - AMOUNT = CLOSING
 */

// Helper function to extract exact number values matching uppercase headers
function getVal(row, possibleNames) {
    const keys = Object.keys(row);
    for (const p of possibleNames) {
        const target = p.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const matched = keys.find(k => k.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === target);
        if (matched && row[matched] !== undefined && row[matched] !== null) {
            return Number(row[matched]) || 0;
        }
    }
    return 0;
}

const parseExcelRecords = (rawData, fileName, recordDate) => {
    return rawData.map(row => {
        // Extract exact column values
        const lastClosing = getVal(row, ['LASTCLOSING', 'LastClosing', 'Last Closing']);
        const purchaseDiff = getVal(row, ['PURCHASEDIFF', 'PurchaseDiff', 'Purchase Diff']);
        const roffer = getVal(row, ['ROFFER', 'Roffer', 'R-Offer']);
        const amount = getVal(row, ['AMOUNT', 'Amount', 'Amt']);
        const actualClosing = getVal(row, ['CLOSING', 'Closing', 'ClosingBalance']);

        // Calculation Formula: (LASTCLOSING + PURCHASEDIFF + ROFFER) - AMOUNT
        const expectedClosing = (lastClosing + purchaseDiff + roffer) - amount;

        // Tolerance check (0.50 difference allowance)
        const diffAbs = Math.abs(expectedClosing - actualClosing);
        const baseVal = Math.abs(actualClosing) || Math.abs(expectedClosing) || 1;
        const diffPercent = (diffAbs / baseVal) * 100;

        const isMatched = diffPercent <= 0.50 || diffAbs <= 0.50;

        return {
            fileName,
            recordDate: recordDate || new Date(),
            originalData: row,
            expectedClosing: Number(expectedClosing.toFixed(2)),
            actualClosing: Number(actualClosing.toFixed(2)),
            isMatched,
            diffPercent: Number(diffPercent.toFixed(2))
        };
    });
};

module.exports = { parseExcelRecords };