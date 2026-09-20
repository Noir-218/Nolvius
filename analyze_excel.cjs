const xlsx = require('xlsx');

function analyzeFile(filePath) {
    console.log(`\n--- Analyzing ${filePath} ---`);
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    console.log(`Sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (data.length > 0) {
        console.log("Headers (Row 0):", data[0]);
        console.log("Headers (Row 1):", data[1]);
        console.log("Row 2:", data[2]);
    }
}

analyzeFile('Báo cáo tuần B03.xlsx');
analyzeFile('Báo cáo tuần B04.xlsx');
