import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log("Searching for 'Always' ingredients...");
    const { data: allIngs } = await supabase.from('ingredients').select('id, name, substitute_id');
    const matches = allIngs.filter(i => i.name.toLowerCase().includes('always'));
    
    console.log("MATCHES:", JSON.stringify(matches, null, 2));

    if (matches.length === 0) {
        console.log("No ingredients found with 'Always' in name. Listing first 10 ingredients:");
        console.log(JSON.stringify(allIngs.slice(0, 10), null, 2));
        return;
    }

    const targetDate = '2026-05-22';
    for (const ing of matches) {
        console.log(`\n--- Debugging Ing: ${ing.name} [ID: ${ing.id}] ---`);
        
        // Latest audit
        const { data: audits } = await supabase.from('stock_audits').select('*').eq('ingredient_id', ing.id).lt('audit_date', targetDate).order('audit_date', { ascending: false }).limit(1);
        console.log("Latest Audit:", JSON.stringify(audits, null, 2));
        
        // Transactions
        const { data: txs } = await supabase.from('stock_transactions').select('*').eq('ingredient_id', ing.id).gte('transaction_date', '2026-05-01').lte('transaction_date', targetDate + 'T23:59:59');
        console.log("Transactions found:", txs?.length || 0);
        
        let stock = audits[0]?.actual_stock || 0;
        const auditDate = audits[0]?.audit_date || '1970-01-01';
        console.log(`Starting Stock: ${stock} (Audit Date: ${auditDate})`);
        
        if (txs) {
            txs.forEach(tx => {
                const isAfter = tx.transaction_date.slice(0, 10) > auditDate.slice(0, 10);
                if (isAfter) {
                    const qty = Number(tx.quantity);
                    if (['IN', 'IN_TRANSFER'].includes(tx.type)) stock += qty;
                    else stock -= Math.abs(qty);
                    console.log(`  + Applied Tx [${tx.type}] Qty: ${tx.quantity} Date: ${tx.transaction_date} -> New Stock: ${stock}`);
                }
            });
        }
        console.log(`FINAL SIMULATED STOCK FOR ${ing.name}: ${stock}`);
    }

  } catch (e) {
    console.error(e);
  }
}

run();
