import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // 1. Get ALL ingredients (no filter)
  const { data: allIngs } = await supabase.from('ingredients').select('id, name, unit, substitute_id').limit(5);
  console.log("SAMPLE INGREDIENTS (first 5):", JSON.stringify(allIngs, null, 2));

  // 2. Get RECENT audits to see date format
  const { data: audits } = await supabase.from('stock_audits').select('ingredient_id, actual_stock, audit_date').order('audit_date', { ascending: false }).limit(5);
  console.log("\nRECENT AUDITS:", JSON.stringify(audits, null, 2));

  // 3. Get RECENT transactions to see date format
  const { data: txs } = await supabase.from('stock_transactions').select('ingredient_id, type, quantity, transaction_date').order('transaction_date', { ascending: false }).limit(10);
  console.log("\nRECENT TRANSACTIONS:", JSON.stringify(txs, null, 2));
}

run();
