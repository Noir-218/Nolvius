
const dailyTx = {};
const priorAudits = [
  { ingredient_id: 'ing1', audit_date: '2026-04-06', actual_stock: 100 }
];
const transactions = [
  { ingredient_id: 'ing1', transaction_date: '2026-04-09', quantity: -10, type: 'OUT' }
];

function test(selectedDate) {
  const txSummary = {};
  const startOfThisMonth = '2026-04-01';
  
  // Simulated filter: .lte('transaction_date', selectedDate)
  const filteredTx = transactions.filter(tx => tx.transaction_date <= selectedDate);
  
  filteredTx.forEach(tx => {
    const priorAuditForIng = priorAudits.find(a => a.ingredient_id === tx.ingredient_id);
    const lastDate = priorAuditForIng ? priorAuditForIng.audit_date : null;
    
    let shouldCount = false;
    if (tx.transaction_date === selectedDate) {
      shouldCount = true;
    } else if (lastDate && tx.transaction_date > lastDate) {
      shouldCount = true;
    } else if (!lastDate && tx.transaction_date < selectedDate) {
      shouldCount = true;
    }
    
    if (shouldCount) {
      if (!txSummary[tx.ingredient_id]) txSummary[tx.ingredient_id] = { in: 0, out: 0 };
      const qty = Math.abs(tx.quantity);
      if (['IN', 'IN_TRANSFER'].includes(tx.type)) txSummary[tx.ingredient_id].in += qty;
      else if (['OUT', 'WASTE', 'SALES_USAGE'].includes(tx.type)) txSummary[tx.ingredient_id].out += qty;
    }
  });
  return txSummary;
}

console.log('Result for 7/4:', test('2026-04-07'));
console.log('Result for 8/4:', test('2026-04-08'));
console.log('Result for 9/4:', test('2026-04-09'));
