const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    const { data: ings, error } = await supabase.from('ingredients').select('id, name');
    if (error) throw error;
    console.log("INGS:", JSON.stringify(ings, null, 2));
    
    const always = ings.find(i => i.name.includes('Always On 22oz'));
    const horse = ings.find(i => i.name.includes('Ngựa Chill'));
    
    console.log("ALWAYS ID:", always?.id);
    console.log("HORSE ID:", horse?.id);
    
    if (always) {
        const { data: txs } = await supabase.from('stock_transactions')
            .select('*')
            .eq('ingredient_id', always.id)
            .gte('transaction_date', '2026-05-20');
        console.log("ALWAYS TXS:", JSON.stringify(txs, null, 2));
        
        const { data: audits } = await supabase.from('stock_audits')
            .select('*')
            .eq('ingredient_id', always.id)
            .order('audit_date', { ascending: false });
        console.log("ALWAYS AUDITS:", JSON.stringify(audits, null, 2));
    }
  } catch (e) {
    console.error("FATAL ERROR:", e);
  }
}

run();
