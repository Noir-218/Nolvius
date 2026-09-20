const xlsx = require('xlsx');

function checkB04() {
    const b04Workbook = xlsx.readFile('Báo cáo tuần B04.xlsx');
    const b04Data = xlsx.utils.sheet_to_json(b04Workbook.Sheets[b04Workbook.SheetNames[0]], { header: 1 });
    
    const nhomMonSet = new Set();
    const records = [];
    
    for (let r = 3; r < b04Data.length; r++) {
        const row = b04Data[r];
        if (!row || row.length === 0 || !row[1]) continue;
        
        const tenMon = row[1] ? String(row[1]) : "";
        const nhomMon = row[3] ? String(row[3]) : "";
        nhomMonSet.add(nhomMon);
        
        records.push({ tenMon, nhomMon, hoaHong: parseFloat(row[6])||0, net: parseFloat(row[10])||0 });
    }

    console.log("Distinct Nhóm món:", Array.from(nhomMonSet));

    console.log("\nSearching for keywords in Tên Món AND Nhóm Món:");
    const keywords = ['Trân châu', 'Thạch', 'HN', 'Hoa Quả Sấy', 'Merchandise'];
    
    keywords.forEach(kw => {
        let revTenMon = 0;
        let revNhomMon = 0;
        records.forEach(r => {
            if (r.tenMon.toLowerCase().includes(kw.toLowerCase())) {
                revTenMon += (r.hoaHong + r.net) / 1.08;
            }
            if (r.nhomMon.toLowerCase().includes(kw.toLowerCase())) {
                revNhomMon += (r.hoaHong + r.net) / 1.08;
            }
        });
        console.log(`Keyword: ${kw} | By Tên Món: ${Math.round(revTenMon)} | By Nhóm Món: ${Math.round(revNhomMon)}`);
    });
}

checkB04();
