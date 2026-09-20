const xlsx = require('xlsx');

function findCombinations() {
    const b04Workbook = xlsx.readFile('Báo cáo tuần B04.xlsx');
    const b04Data = xlsx.utils.sheet_to_json(b04Workbook.Sheets[b04Workbook.SheetNames[0]], { header: 1 });
    
    const targetB04 = {
        'Trân Châu': 14878755,
        'Thạch': 1846668,
        'Bánh': 4387098,
        'Hoa quả sấy': 809861,
        'MCD': 2054469
    };

    const records = [];
    
    for (let r = 3; r < b04Data.length; r++) {
        const row = b04Data[r];
        if (!row || row.length === 0 || !row[1]) continue;
        
        const tenMon = row[1] ? String(row[1]).normalize('NFC') : "";
        const nhomMon = row[3] ? String(row[3]).normalize('NFC') : "";
        const loaiMon = row[4] ? String(row[4]).normalize('NFC') : "";
        const net = parseFloat(row[10]) || 0;
        const hoaHong = parseFloat(row[6]) || 0;
        const rev = (net + hoaHong) / 1.08;
        
        records.push({ tenMon, nhomMon, loaiMon, rev });
    }

    console.log("Analyzing combinations to reach targets...");

    function search(keyword, target) {
        console.log(`\n--- Target: ${target} for ${keyword} ---`);
        let sumTenMon = 0;
        let sumNhomMon = 0;
        let sumLoaiMon = 0;

        const matchedItems = [];

        records.forEach(r => {
            let matched = false;
            if (r.tenMon.toLowerCase().includes(keyword.toLowerCase())) {
                sumTenMon += r.rev;
                matched = true;
            }
            if (r.nhomMon.toLowerCase().includes(keyword.toLowerCase())) {
                sumNhomMon += r.rev;
                matched = true;
            }
            if (r.loaiMon.toLowerCase().includes(keyword.toLowerCase())) {
                sumLoaiMon += r.rev;
                matched = true;
            }

            if (matched) {
                matchedItems.push(r);
            }
        });

        console.log(`Sum Tên Món: ${Math.round(sumTenMon)}`);
        console.log(`Sum Nhóm Món: ${Math.round(sumNhomMon)}`);
        console.log(`Sum Loại Món: ${Math.round(sumLoaiMon)}`);
        
        // Let's try to find a subset that matches the target exactly
        // We'll use a simple greedy approach or print the items to see which one might be excluded
        console.log(`Difference (Ten Mon - Target): ${Math.round(sumTenMon - target)}`);
        console.log(`Difference (Nhom Mon - Target): ${Math.round(sumNhomMon - target)}`);
        
        // Find which item(s) to remove to get the target
        matchedItems.forEach(item => {
            const diffTen = Math.abs(sumTenMon - item.rev - target);
            if (diffTen < 1) console.log(`  -> Exclude ${item.tenMon} to match target!`);
            
            const diffNhom = Math.abs(sumNhomMon - item.rev - target);
            if (diffNhom < 1) console.log(`  -> Exclude ${item.tenMon} (Nhóm: ${item.nhomMon}) to match target!`);
        });
    }

    search('Thạch', targetB04['Thạch']);
    search('HN', targetB04['Bánh']);
    search('Hoa Quả Sấy', targetB04['Hoa quả sấy']);
    search('Merchandise', targetB04['MCD']);
}

findCombinations();
