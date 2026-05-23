import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // 1. List all ingredients containing 'cốc' or 'cup'
  const { data: allIngs, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, substitute_id')
    .or('name.ilike.%cốc%,name.ilike.%cup%,name.ilike.%Cốc%');
  
  console.log("=== CUP-RELATED INGREDIENTS ===");
  console.log(JSON.stringify(allIngs, null, 2));
  if (error) console.error("Error:", error);

  // 2. Check audits for date 2026-05-22 to see actual ingredient IDs stored
  const { data: audits22 } = await supabase
    .from('stock_audits')
    .select('ingredient_id, actual_stock, audit_date')
    .eq('audit_date', '2026-05-22')
    .limit(20);
  
  console.log("\n=== AUDITS ON 2026-05-22 ===");
  console.log(JSON.stringify(audits22, null, 2));
  
  // 3. Check transactions on 2026-05-22
  const { data: txs22 } = await supabase
    .from('stock_transactions')
    .select('ingredient_id, type, quantity, transaction_date, branch_id')
    .gte('transaction_date', '2026-05-22')
    .lte('transaction_date', '2026-05-22T23:59:59')
    .limit(50);
  
  console.log("\n=== TRANSACTIONS ON 2026-05-22 ===");
  console.log(JSON.stringify(txs22, null, 2));
  
  // 4. Look at their ingredient IDs and cross-reference with ingredient names
  if (txs22 && txs22.length > 0 && allIngs) {
    console.log("\n=== TRANSACTIONS RESOLVED ===");
    const ingMap = {};
    allIngs.forEach(i => ingMap[i.id] = i.name);
    txs22.forEach(tx => {
      console.log(`[${tx.type}] qty:${tx.quantity} date:${tx.transaction_date} ing:${ingMap[tx.ingredient_id] || tx.ingredient_id}`);
    });
  }
}

run();
