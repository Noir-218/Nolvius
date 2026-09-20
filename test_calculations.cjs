const xlsx = require('xlsx');

function testCalculations() {
    console.log("=========================================");
    console.log("TESTING B03 - REVENUE BY SOURCE");
    const b03Workbook = xlsx.readFile('Báo cáo tuần B03.xlsx');
    const b03Data = xlsx.utils.sheet_to_json(b03Workbook.Sheets[b03Workbook.SheetNames[0]], { header: 1 });
    
    // Parse sources from row 1
    const sources = [];
    const row1 = b03Data[1];
    for (let i = 1; i < row1.length; i++) {
        if (row1[i] && row1[i] !== 'Tổng') {
            sources.push({ name: row1[i], colIndex: i });
        }
    }

    const b03Results = {};
    sources.forEach(s => {
        b03Results[s.name] = { totalInvoices: 0, revenue: 0 };
    });

    let totalInvoicesAll = 0;
    let totalRevenueAll = 0;

    const dailyRevenue = {};

    // Data starts from row 3
    for (let r = 3; r < b03Data.length; r++) {
        const row = b03Data[r];
        if (!row || row.length === 0 || !row[0]) continue;
        if (row[0] === 'Tổng') continue; // Skip total row if exists

        const date = row[0];
        let dailyTotal = 0;
        
        sources.forEach(s => {
            const invoicesCol = s.colIndex;
            const hoaHongCol = s.colIndex + 2;
            const netCol = s.colIndex + 5;
            
            const invoices = parseFloat(row[invoicesCol]) || 0;
            const hoaHong = parseFloat(row[hoaHongCol]) || 0;
            const net = parseFloat(row[netCol]) || 0;
            
            b03Results[s.name].totalInvoices += invoices;
            b03Results[s.name].revenue += (hoaHong + net);
        });

        // Use the "Tổng" group for daily total if available
        // Find the index of "Tổng" in row 1
        const tongIndex = row1.indexOf('Tổng');
        if (tongIndex !== -1) {
            const hoaHong = parseFloat(row[tongIndex + 2]) || 0;
            const net = parseFloat(row[tongIndex + 5]) || 0;
            dailyRevenue[date] = hoaHong + net;
        }
    }

    // Print B03 Results
    console.log(String("NGUỒN ĐƠN").padEnd(15) + " | " + String("TỔNG HÓA ĐƠN").padEnd(12) + " | DOANH THU (NET + HOA HỒNG)/1.08");
    sources.forEach(s => {
        const rev = b03Results[s.name].revenue / 1.08;
        totalInvoicesAll += b03Results[s.name].totalInvoices;
        totalRevenueAll += rev;
        console.log(String(s.name).padEnd(15) + " | " + String(b03Results[s.name].totalInvoices).padEnd(12) + " | " + Math.round(rev).toLocaleString('vi-VN'));
    });
    console.log(String("TỔNG TUẦN").padEnd(15) + " | " + String(totalInvoicesAll).padEnd(12) + " | " + Math.round(totalRevenueAll).toLocaleString('vi-VN'));

    console.log("\n=========================================");
    console.log("TESTING B03 - DAILY REVENUE (NET + HOA HỒNG)");
    console.log("DATE".padEnd(12) + " | DOANH THU");
    for (const [date, rev] of Object.entries(dailyRevenue)) {
        console.log(String(date).padEnd(12) + " | " + Math.round(rev).toLocaleString('vi-VN'));
    }

    console.log("\n=========================================");
    console.log("TESTING B04 - REVENUE BY PRODUCT GROUP");
    const b04Workbook = xlsx.readFile('Báo cáo tuần B04.xlsx');
    const b04Data = xlsx.utils.sheet_to_json(b04Workbook.Sheets[b04Workbook.SheetNames[0]], { header: 1 });
    
    const keywords = [
        { group: 'Trân Châu', keyword: 'Trân châu' },
        { group: 'Thạch', keyword: 'Thạch' },
        { group: 'Bánh', keyword: 'HN' },
        { group: 'Hoa quả sấy', keyword: 'Hoa Quả Sấy' },
        { group: 'MCD', keyword: 'Merchandise' }
    ];

    const b04Results = {};
    keywords.forEach(k => {
        b04Results[k.group] = 0;
    });

    // B04 data starts from row 3 (index 3) because rows 0,1,2 are headers
    for (let r = 3; r < b04Data.length; r++) {
        const row = b04Data[r];
        if (!row || row.length === 0 || !row[1]) continue;
        
        const tenMon = row[1] ? String(row[1]).toLowerCase() : "";
        const hoaHong = parseFloat(row[6]) || 0;
        const net = parseFloat(row[10]) || 0;
        
        keywords.forEach(k => {
            if (tenMon.includes(k.keyword.toLowerCase())) {
                b04Results[k.group] += (hoaHong + net);
            }
        });
    }

    console.log(String("Nhóm Món").padEnd(15) + " | " + String("KEY word").padEnd(15) + " | DOANH THU (NET + HOA HỒNG)/1.08");
    keywords.forEach(k => {
        const rev = b04Results[k.group] / 1.08;
        console.log(String(k.group).padEnd(15) + " | " + String(k.keyword).padEnd(15) + " | " + Math.round(rev).toLocaleString('vi-VN'));
    });
}

testCalculations();
