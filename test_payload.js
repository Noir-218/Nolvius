import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yehdhcugcaomaylurind.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllaGRoY3VnY2FvbWF5bHVyaW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjAxODAsImV4cCI6MjA4ODczNjE4MH0.V8BwT_yed5OP1h_7QGWD2h3ilpZ4rRaw1-7FgiVE5xY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPayload() {
  console.log("Signing in...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'aikdew21@gmail.com',
    password: '123456'
  });

  if (authErr) {
    console.error("Sign in failed:", authErr);
    return;
  }
  console.log("Sign in successful!");

  // Lấy dữ liệu đầy đủ của ingredient giống như ứng dụng lấy (kèm theo relation)
  const { data: ing, error: getErr } = await supabase
    .from('ingredients')
    .select(`*, ingredient_categories(name), ingredient_order_types(name)`)
    .eq('id', 'CCVS990010')
    .single();

  if (getErr) {
    console.error("Get error:", getErr);
    return;
  }

  console.log("Fetched Ingredient from DB:", JSON.stringify(ing, null, 2));

  // Mô phỏng openModal: setFormData
  const formData = {
    id: ing.id,
    name: ing.name,
    category_id: ing.category_id || '',
    unit: ing.unit,
    min_stock: ing.min_stock || 0,
    unit_price: ing.unit_price || 0,
    order_type_id: ing.order_type_id || '',
    substitute_id: ing.substitute_id || ''
  };

  // Giả sử người dùng thay đổi order_type_id trên UI
  // Lấy danh sách order types trước để lấy 1 cái id khác
  const { data: orderTypes } = await supabase.from('ingredient_order_types').select('id, name');
  console.log("Available order types:", orderTypes);
  
  if (orderTypes && orderTypes.length > 0) {
    // Chọn cái khác cái hiện tại
    const currentOrderTypeId = formData.order_type_id;
    const newOrderType = orderTypes.find(t => t.id !== currentOrderTypeId) || orderTypes[0];
    formData.order_type_id = newOrderType.id;
    console.log(`Simulating user changed order_type_id to: ${newOrderType.name} (${newOrderType.id})`);
  }

  // Mô phỏng handleSubmit
  const payload = {
    ...formData,
    category_id: formData.category_id || null,
    order_type_id: formData.order_type_id || null,
    substitute_id: formData.substitute_id || null,
  };
  delete payload.reorder_cycle_days;

  console.log("Constructed payload to update:", JSON.stringify(payload, null, 2));

  const { data: updateRes, error: updateErr } = await supabase
    .from('ingredients')
    .update(payload)
    .eq('id', ing.id);

  if (updateErr) {
    console.error("UPDATE ERROR DETAIL:", JSON.stringify(updateErr, null, 2));
  } else {
    console.log("UPDATE SUCCESS!", updateRes);
  }
}

testPayload();
