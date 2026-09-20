const xlsx = require('xlsx');

function debugB04() {
    const b04Workbook = xlsx.readFile('Báo cáo tuần B04.xlsx');
    const b04Data = xlsx.utils.sheet_to_json(b04Workbook.Sheets[b04Workbook.SheetNames[0]], { header: 1 });
    
    const records = [];
    
    for (let r = 3; r < b04Data.length; r++) {
        const row = b04Data[r];
        if (!row || row.length === 0 || !row[1]) continue;
        
        const tenMon = row[1] ? String(row[1]).normalize('NFC') : "";
        const nhomMon = row[3] ? String(row[3]).normalize('NFC') : "";
        records.push({ 
            tenMon, 
            nhomMon, 
            hoaHong: parseFloat(row[6])||0, 
            net: parseFloat(row[10])||0,
            revenue: ((parseFloat(row[6])||0) + (parseFloat(row[10])||0)) / 1.08
        });
    }

    const checkCategory = (name, keyword) => {
        console.log(`\n--- Matches for ${name} (Keyword: ${keyword}) ---`);
        let total = 0;
        let matchedItems = [];
        records.forEach(r => {
            if (r.tenMon.toLowerCase().includes(keyword.toLowerCase()) || 
                r.nhomMon.toLowerCase().includes(keyword.toLowerCase())) {
                total += r.revenue;
                matchedItems.push(`${r.tenMon} (${r.nhomMon}): ${r.revenue.toFixed(2)}`);
            }
        });
        console.log(`Total: ${Math.round(total).toLocaleString('vi-VN')}`);
        // Print distinct matched items with their sums
        const itemSums = {};
        records.forEach(r => {
            if (r.tenMon.toLowerCase().includes(keyword.toLowerCase()) || 
                r.nhomMon.toLowerCase().includes(keyword.toLowerCase())) {
                itemSums[r.tenMon] = (itemSums[r.tenMon] || 0) + r.revenue;
            }
        });
        for (const [k, v] of Object.entries(itemSums)) {
            console.log(`  - ${k}: ${Math.round(v).toLocaleString('vi-VN')}`);
        }
    };

    checkCategory('Thạch', 'Thạch');
    checkCategory('Bánh', 'HN');
    checkCategory('Hoa quả sấy', 'Hoa Quả Sấy');
    checkCategory('MCD', 'Merchandise');
}

debugB04();
