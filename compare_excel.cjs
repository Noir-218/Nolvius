const xlsx = require('xlsx');
const path = require('path');

// 1. Đọc file mẫu gốc
const templatePath = path.join(__dirname, 'Phiếu xuất kho.xlsx');
const templateWb = xlsx.readFile(templatePath);
const templateWs = templateWb.Sheets[templateWb.SheetNames[0]];

// 2. Tạo file mới với logic đã sửa (giống code trong Transactions.tsx)
const headers = [
  "Mã hàng", "Tên mặt hàng", "Đvt", "Mã kho", "Mã lô", "Số lượng", 
  "Giá đích danh", "Giá", "Tiền", "Mã nx", "Tk nợ", "Tk có", 
  "Vụ việc", "Bộ phận", "Lsx", "Sản phẩm", "Hợp đồng", "Phí", "Khế ước"
];

const worksheet = {};

// Ghi hàng tiêu đề vào hàng 5 (index 4)
headers.forEach((h, c) => {
  worksheet[xlsx.utils.encode_cell({ r: 4, c })] = { t: 's', v: h };
});

// Dữ liệu test giống file mẫu
const testItems = [
  { code: "VL01010073", name: "22Oz_Cốc giấy Ngựa Chill cốc 2 lớp & cán PE, cán vân  & in logo 3D nổi", unit: "", qty: 5 },
  { code: "VL01010072", name: "", unit: "", qty: 15 }
];

let currentRow = 5;
for (const item of testItems) {
  if (item.code) worksheet[xlsx.utils.encode_cell({ r: currentRow, c: 0 })] = { t: 's', v: item.code };
  if (item.name) worksheet[xlsx.utils.encode_cell({ r: currentRow, c: 1 })] = { t: 's', v: item.name };
  if (item.unit) worksheet[xlsx.utils.encode_cell({ r: currentRow, c: 2 })] = { t: 's', v: item.unit };
  worksheet[xlsx.utils.encode_cell({ r: currentRow, c: 5 })] = { t: 'n', v: item.qty };
  currentRow++;
}

const lastRow = currentRow - 1;
worksheet['!ref'] = xlsx.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: lastRow, c: 18 } });

const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");

const outputPath = path.join(__dirname, 'test_generated_v2.xlsx');
xlsx.writeFile(workbook, outputPath);

// 3. Đọc lại file vừa ghi
const rereadWb = xlsx.readFile(outputPath);
const rereadWs = rereadWb.Sheets[rereadWb.SheetNames[0]];

// 4. So sánh
console.log('=== SO SÁNH CẤU TRÚC ===');
console.log(`Template ref: "${templateWs['!ref']}"`);
console.log(`Generated ref: "${rereadWs['!ref']}"`);

console.log('\n=== SO SÁNH TẤT CẢ CÁC CELL ===');
const allKeys = new Set([
  ...Object.keys(templateWs).filter(k => !k.startsWith('!')),
  ...Object.keys(rereadWs).filter(k => !k.startsWith('!'))
]);

let diffCount = 0;
const sortedKeys = [...allKeys].sort((a, b) => {
  const ca = xlsx.utils.decode_cell(a);
  const cb = xlsx.utils.decode_cell(b);
  return ca.r !== cb.r ? ca.r - cb.r : ca.c - cb.c;
});

for (const key of sortedKeys) {
  const tCell = templateWs[key];
  const gCell = rereadWs[key];
  const tVal = tCell ? `${tCell.t}:"${tCell.v}"` : '(empty)';
  const gVal = gCell ? `${gCell.t}:"${gCell.v}"` : '(empty)';
  
  if (tVal === gVal) {
    console.log(`  ${key}: ✓ MATCH — ${tVal}`);
  } else {
    console.log(`  ${key}: ✗ DIFF — Template=${tVal} | Generated=${gVal}`);
    diffCount++;
  }
}

console.log(`\n=== KẾT QUẢ: ${diffCount === 0 ? '✓ HOÀN TOÀN GIỐNG NHAU' : `✗ CÓ ${diffCount} KHÁC BIỆT`} ===`);

// Cleanup
const fs = require('fs');
fs.unlinkSync(outputPath);
console.log('\nĐã xóa file test.');
