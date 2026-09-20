-- Tạo bảng weekly_reports để lưu trữ báo cáo tuần
CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  source_data JSONB NOT NULL,
  total_invoices INT NOT NULL,
  total_revenue NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(facility_id, start_date, end_date)
);

-- Bật RLS
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

-- Tạo policy cho phép authenticated users xem báo cáo tuần
CREATE POLICY "Cho phép xem báo cáo tuần" ON public.weekly_reports
  FOR SELECT USING (auth.role() = 'authenticated');

-- Tạo policy cho phép inserts
CREATE POLICY "Cho phép thêm báo cáo tuần" ON public.weekly_reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Cấp quyền
GRANT ALL ON TABLE public.weekly_reports TO authenticated;
GRANT ALL ON TABLE public.weekly_reports TO service_role;
