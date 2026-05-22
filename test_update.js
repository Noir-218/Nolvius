import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  console.log("Updating ingredient with ID in payload...");
  const { data: updateRes, error: updateErr } = await supabase
    .from('ingredients')
    .update({
      id: 'CCVS990010', // Khóa chính
      name: 'Cồn Smart San Food Grade Alcohol',
      order_type_id: 'db7c7a52-c38d-4f27-be8e-7e9b04856f61'
    })
    .eq('id', 'CCVS990010');

  if (updateErr) {
    console.error("Update error detail:", updateErr);
  } else {
    console.log("Update success!", updateRes);
  }
}

testUpdate();
