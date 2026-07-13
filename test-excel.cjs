const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname);
const excelFiles = files.filter(f => f.endsWith('.xlsx') && f.includes('6-12'));

if (excelFiles.length > 0) {
  const excelFile = excelFiles[0];
  console.log('Reading file:', excelFile);
  const workbook = XLSX.readFile(path.join(__dirname, excelFile));
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log('\n--- HEADERS (First 15 rows) ---');
  console.log(JSON.stringify(rawData.slice(0, 15), null, 2));
} else {
  console.log('File not found. All xlsx files:', files.filter(f => f.endsWith('.xlsx')));
}
