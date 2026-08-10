-- SQL Migration Script để thiết lập cơ sở dữ liệu Supabase con mới
-- Chạy đoạn script này trên Supabase Database của cơ sở mới được tạo.

-- 1. Tạo các bảng cơ bản

-- Bảng danh mục nguyên vật liệu
CREATE TABLE IF NOT EXISTS ingredient_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng loại đơn hàng nguyên vật liệu
CREATE TABLE IF NOT EXISTS ingredient_order_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng nhà cung cấp
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng nguyên vật liệu (ingredients)
CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_id UUID REFERENCES ingredient_categories(id) ON DELETE SET NULL,
    unit TEXT NOT NULL,
    min_stock NUMERIC(12, 6) DEFAULT 0,
    unit_price NUMERIC(12, 6) DEFAULT 0,
    order_type_id UUID REFERENCES ingredient_order_types(id) ON DELETE SET NULL,
    substitute_id TEXT REFERENCES ingredients(id) ON DELETE SET NULL,
    reorder_cycle_days INT DEFAULT 7,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng các đơn vị quy đổi của nguyên vật liệu
CREATE TABLE IF NOT EXISTS ingredient_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    unit_name TEXT NOT NULL,
    conversion_factor NUMERIC(12, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(ingredient_id, unit_name)
);

-- Bảng danh mục sản phẩm (đồ uống/đồ ăn)
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng sản phẩm (products)
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    unit TEXT,
    price NUMERIC(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng công thức pha chế sản phẩm (recipes)
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id TEXT REFERENCES ingredients(id) ON DELETE CASCADE,
    sub_product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(12, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_target CHECK (
        (ingredient_id IS NOT NULL AND sub_product_id IS NULL) OR
        (ingredient_id IS NULL AND sub_product_id IS NOT NULL)
    )
);

-- Bảng giao dịch kho (stock_transactions)
CREATE TABLE IF NOT EXISTS stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'IN_TRANSFER', 'OUT_TRANSFER', 'WASTE', 'WASTE_SYSTEM', 'SALES_USAGE')),
    quantity NUMERIC(12, 6) NOT NULL,
    transaction_date DATE NOT NULL,
    notes TEXT,
    metadata JSONB,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng kiểm kê định kỳ NVL (stock_audits)
CREATE TABLE IF NOT EXISTS stock_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    audit_date DATE NOT NULL,
    stock_in_store NUMERIC(12, 6),
    stock_in_counter NUMERIC(12, 6) DEFAULT 0,
    actual_stock NUMERIC(12, 6) NOT NULL,
    opening_stock NUMERIC(12, 6) NOT NULL,
    theoretical_stock NUMERIC(12, 6) NOT NULL,
    variance NUMERIC(12, 6) GENERATED ALWAYS AS (actual_stock - theoretical_stock) STORED,
    notes TEXT,
    audited_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(ingredient_id, audit_date)
);

-- Bảng tồn kho đầu tháng (monthly_opening_stock)
CREATE TABLE IF NOT EXISTS monthly_opening_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year_month TEXT NOT NULL, -- Định dạng 'YYYY-MM'
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    opening_stock NUMERIC(12, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(year_month, ingredient_id)
);

-- Bảng kiểm kê trà & bánh (tea_cake_audits)
CREATE TABLE IF NOT EXISTS tea_cake_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_date DATE NOT NULL,
    ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('tea', 'cake')),
    manufacture_date DATE,
    expiry_date DATE,
    quantity NUMERIC(12, 6),
    notes TEXT,
    audited_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng chi phí vận hành cửa hàng (expenses)
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    expense_date DATE NOT NULL,
    category TEXT NOT NULL,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Bảng lưu doanh thu chi tiết (sales)
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_date DATE NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Tạo views hỗ trợ báo cáo và truy vấn tồn kho hiện tại

CREATE OR REPLACE VIEW vw_current_stock AS
WITH last_audit AS (
    -- Lấy đợt kiểm kê gần nhất của từng nguyên vật liệu
    SELECT DISTINCT ON (ingredient_id) 
        ingredient_id,
        audit_date,
        actual_stock
    FROM stock_audits
    ORDER BY ingredient_id, audit_date DESC
),
tx_since_audit AS (
    -- Tính tổng biến động kho kể từ đợt kiểm kê gần nhất
    SELECT 
        t.ingredient_id,
        COALESCE(SUM(
            CASE 
                WHEN t.type IN ('IN', 'IN_TRANSFER') THEN ABS(t.quantity)
                WHEN t.type IN ('OUT', 'OUT_TRANSFER', 'WASTE', 'WASTE_SYSTEM', 'SALES_USAGE') THEN -ABS(t.quantity)
                ELSE 0
            END
        ), 0) as net_qty
    FROM stock_transactions t
    LEFT JOIN last_audit la ON t.ingredient_id = la.ingredient_id
    WHERE la.audit_date IS NULL OR t.transaction_date > la.audit_date
    GROUP BY t.ingredient_id
)
SELECT 
    i.id AS ingredient_id,
    i.name AS ingredient_name,
    i.unit,
    COALESCE(la.actual_stock, 0) + COALESCE(ts.net_qty, 0) AS current_stock,
    la.audit_date AS last_audit_date
FROM ingredients i
LEFT JOIN last_audit la ON i.id = la.ingredient_id
LEFT JOIN tx_since_audit ts ON i.id = ts.ingredient_id;
