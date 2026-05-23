import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const targetDate = '2026-05-22';
  try {
    // 1. Fetch Always Cup
    const { data: ings } = await supabase.from('ingredients').select('id, name, substitute_id').ilike('name', '%Always On 22oz%');
    console.log("INGREDIENTS MATCHING 'Always On 22oz':", JSON.stringify(ings, null, 2));
    if (!ings || ings.length === 0) return;
    
    const alwaysId = ings[0].id;
    const horseId = ings[0].substitute_id;
    console.log("Always ID:", alwaysId, "Horse ID:", horseId);

    // 2. Fetch Latest Audit before 22nd
    const { data: audits } = await supabase
      .from('stock_audits')
      .select('ingredient_id, actual_stock, audit_date')
      .eq('ingredient_id', alwaysId)
      .lt('audit_date', targetDate)
      .order('audit_date', { ascending: false })
      .limit(1);
    console.log("LATEST AUDIT BEFORE 22nd:", JSON.stringify(audits, null, 2));

    // 3. Fetch Transactions on 22nd
    const { data: txs } = await supabase
      .from('stock_transactions')
      .select('*')
      .eq('ingredient_id', alwaysId)
      .gte('transaction_date', '2026-05-01')
      .lte('transaction_date', targetDate + 'T23:59:59');
    console.log("TRANSACTIONS (Raw):", JSON.stringify(txs, null, 2));

    // 4. Simulate Loop
    let stock = audits[0]?.actual_stock || 0;
    const auditDateStr = audits[0]?.audit_date || '1970-01-01';
    
    console.log("\nStarting Stock:", stock, "as of", auditDateStr);
    
    if (txs) {
      txs.forEach(tx => {
         const txDate = tx.transaction_date.slice(0, 10);
         const auditDate = auditDateStr.slice(0, 10);
         const matchesDate = txDate > auditDate;
         
         console.log(`Checking Tx [${tx.type}] Qty: ${tx.quantity} Date: ${tx.transaction_date} -> txDate > auditDate? ${matchesDate}`);
         
         if (matchesDate) {
           if (['IN', 'IN_TRANSFER'].includes(tx.type)) {
               stock += Number(tx.quantity);
           } else {
               stock -= Math.abs(Number(tx.quantity));
           }
           console.log("   New Stock:", stock);
         }
      });
    }
    
    console.log("\nFINAL AVAILABLE STOCK FOR SYNC:", stock);

  } catch (e) {
    console.error(e);
  }
}

run();
