const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRaw() {
  const { data: txs } = await supabase.from('stock_transactions').select('id, transaction_date').limit(1).order('created_at', { ascending: false });
  console.log("RAW TX:", JSON.stringify(txs, null, 2));
}

checkRaw();
