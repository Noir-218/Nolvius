const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAudit() {
  console.log("--- Ingredients ---");
  const { data: ings } = await supabase.from('ingredients')
    .select('id, name, substitute_id')
    .or('name.ilike.%Always On%,name.ilike.%Ngựa Chill%');
  console.log(JSON.stringify(ings, null, 2));

  if (!ings || ings.length === 0) return;

  const ids = ings.map(i => i.id);

  console.log("\n--- Latest Audits ---");
  const { data: audits } = await supabase.from('stock_audits')
    .select('*')
    .in('ingredient_id', ids)
    .order('audit_date', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(audits, null, 2));

  console.log("\n--- Recent Transactions ---");
  const { data: txs } = await supabase.from('stock_transactions')
    .select('*')
    .in('ingredient_id', ids)
    .gte('transaction_date', '2026-05-20')
    .order('transaction_date', { ascending: false });
  console.log(JSON.stringify(txs, null, 2));
  
  console.log("\n--- Branches ---");
  const { data: branches } = await supabase.from('branches').select('id, name');
  console.log(JSON.stringify(branches, null, 2));
}

debugAudit();
