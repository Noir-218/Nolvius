import { useState, useEffect } from 'react';
import { useFacility } from '../contexts/FacilityContext';
import {
  Calculator, TrendingDown, ShoppingCart,
  Clock, RefreshCw, AlertTriangle, CheckCircle2,
  Calendar, Search, Sun, CloudRain, Cloud,
  CloudSun
} from 'lucide-react';
import { format, subDays, addDays, parseISO, differenceInCalendarDays, startOfToday, isWithinInterval } from 'date-fns';
import { useMemo } from 'react';

const unsignedString = (str: string) =>
  str.normalize('NFC').toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[\u0300\u0301\u0309\u0303\u0327\u0309\u0323]/g, '');

// ─── Types ────────────────────────────────────────────────────────────────────

type ConsumptionSource = 'sales' | 'audit_diff' | 'none';

interface ForecastRow {
  id: string;
  name: string;
  unit: string;
  // Tiêu hao
  totalConsumption: number;     // tổng tiêu hao trong kỳ
  avgDaily: number;             // TB / ngày
  source: ConsumptionSource;   // nguồn tính tiêu hao
  // Tồn kho
  currentStock: number;
  daysRemaining: number | null;
  // Đặt hàng
  minStock: number;
  cycleDays: number;
  reorderQty: number;
  order_type_id?: string;
  incomingQty: number;          // hàng sắp về (user nhập)
}

interface OrderType {
  id: string;
  name: string;
}

// ─── Periods ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '1 ngày', days: 1 },
  { label: '3 ngày', days: 3 },
  { label: '7 ngày', days: 7 },
  { label: '14 ngày', days: 14 },
  { label: '30 ngày', days: 30 },
  { label: '60 ngày', days: 60 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);

const SOURCE_LABEL: Record<ConsumptionSource, { text: string; cls: string; tip: string }> = {
  sales: { text: 'Bán hàng', cls: 'bg-purple-100 text-purple-700 border-purple-200', tip: 'Tính từ SALES_USAGE + WASTE' },
  audit_diff: { text: 'Chênh lệch KK', cls: 'bg-teal-100 text-teal-700 border-teal-200', tip: 'Tính từ chênh lệch tồn kho giữa các ngày kiểm kê' },
  none: { text: 'Chưa có dữ liệu', cls: 'bg-gray-100 text-gray-400 border-gray-200', tip: 'Không có giao dịch và không có kiểm kê trong kỳ' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Forecast() {
  const { facilityClient } = useFacility();
  const supabase = facilityClient!;
  const [periodDays, setPeriodDays] = useState(7);
  const [data, setData] = useState<ForecastRow[]>([]);
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([]);
  const [selectedOrderTypeId, setSelectedOrderTypeId] = useState<string>('');
  const [stockDate, setStockDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [targetDate, setTargetDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [incomingQtyMap, setIncomingQtyMap] = useState<Record<string, number>>({});
  const [weatherFactor, setWeatherFactor] = useState(1.0);
  const [weatherDesc, setWeatherDesc] = useState('Đang cập nhật thời tiết...');
  const [weatherIcon, setWeatherIcon] = useState<any>(null);

  // ── Fetch & compute ────────────────────────────────────────────────────────

  const fetchWeather = async () => {
    try {
      // Sử dụng WeatherAPI (Bạn có thể thay VITE_WEATHER_API_KEY trong .env)
      const apiKey = import.meta.env.VITE_WEATHER_API_KEY || 'no_key';
      const city = 'Hanoi';
      
      // Nếu không có Key, chúng ta dùng mock data hoặc thông báo
      if (apiKey === 'no_key') {
        setWeatherDesc('Bình thường (Chưa có API Key)');
        setWeatherFactor(1.0);
        setWeatherIcon(<Cloud size={20} className="text-secondary" />);
        return;
      }

      const res = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${city}&days=10&aqi=no`);
      const data = await res.json();

      if (data && data.forecast) {
        // Tính factor trung bình dựa trên targetDate
        const forecasts = data.forecast.forecastday;
        const target = parseISO(targetDate);
        const today = startOfToday();
        
        let totalFactor = 0;
        let count = 0;
        let mainCond = '';

        forecasts.forEach((day: any) => {
          const dDate = parseISO(day.date);
          if (isWithinInterval(dDate, { start: today, end: target })) {
            const cond = day.day.condition.text.toLowerCase();
            const temp = day.day.avgtemp_c;
            
            let factor = 1.0;
            if (cond.includes('rain') || cond.includes('thunder')) factor = 0.85;
            else if (cond.includes('sunny') || cond.includes('clear')) {
                factor = temp > 30 ? 1.25 : 1.15;
            } else if (cond.includes('cloudy') || cond.includes('overcast')) {
                factor = 0.95;
            }
            
            totalFactor += factor;
            count++;
            if (count === 1) mainCond = day.day.condition.text;
          }
        });

        const avgFactor = count > 0 ? totalFactor / count : 1.0;
        setWeatherFactor(avgFactor);
        setWeatherDesc(`${mainCond} (${avgFactor > 1 ? '+' : ''}${Math.round((avgFactor - 1) * 100)}% nhu cầu)`);
        
        // Pick icon
        if (avgFactor > 1.1) setWeatherIcon(<Sun size={20} className="text-warning" />);
        else if (avgFactor < 0.9) setWeatherIcon(<CloudRain size={20} className="text-primary" />);
        else setWeatherIcon(<CloudSun size={20} className="text-info" />);
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
      setWeatherDesc('Không thể lấy thời tiết');
    }
  };

  const fetchForecast = async (days: number) => {
    setLoading(true);
    try {
      const today = new Date();
      const fromDate = subDays(today, days);
      const fromStr = format(fromDate, 'yyyy-MM-dd');
      const todayStr = format(today, 'yyyy-MM-dd');

      // ── Fetch Weather ──────────────────────────────────────────────────────
      await fetchWeather();

      // ── 0. Fetch Order Types ────────────────────────────────────────────────
      const { data: typesData } = await supabase
        .from('ingredient_order_types')
        .select('id, name')
        .order('name');
      setOrderTypes(typesData || []);

      // ── 1. Fetch tất cả ingredients ──────────────────────────────────────────
      const { data: ingredients } = await supabase
        .from('ingredients')
        .select('id, name, unit, min_stock, reorder_cycle_days, order_type_id');

      // ── 2. Fetch tồn kho hiện tại ─────────────────────────────────────────────
      const { data: stocksData } = await supabase
        .from('vw_current_stock')
        .select('*');

      // ── 3. Fetch SALES_USAGE + WASTE trong kỳ ────────────────────────────────
      const { data: txData } = await supabase
        .from('stock_transactions')
        .select('ingredient_id, quantity, type, transaction_date')
        .in('type', ['SALES_USAGE', 'WASTE', 'WASTE_SYSTEM'])
        .gte('transaction_date', fromStr)
        .lte('transaction_date', todayStr);

      // ── 4. Fetch stock_audits trong kỳ để tính chênh lệch ────────────────────
      const { data: auditData } = await supabase
        .from('stock_audits')
        .select('ingredient_id, actual_stock, audit_date')
        .gte('audit_date', fromStr)
        .lte('audit_date', todayStr)
        .order('audit_date', { ascending: true });

      if (!ingredients) { setLoading(false); return; }

      // ── Tính tiêu hao từ SALES_USAGE + WASTE theo ingredient ─────────────────
      const salesMap: Record<string, number> = {};
      (txData ?? []).forEach((tx: any) => {
        if (!tx.ingredient_id) return;
        salesMap[tx.ingredient_id] = (salesMap[tx.ingredient_id] || 0) + Math.abs(tx.quantity);
      });

      // ── Tính tiêu hao từ chênh lệch kiểm kê theo ingredient ─────────────────
      const auditDiffMap: Record<string, number> = {};
      if (auditData) {
        const auditByIng: Record<string, { date: string; stock: number }[]> = {};
        auditData.forEach((a: any) => {
          if (!a.ingredient_id || a.actual_stock === null) return;
          if (!auditByIng[a.ingredient_id]) auditByIng[a.ingredient_id] = [];
          auditByIng[a.ingredient_id].push({ date: a.audit_date, stock: a.actual_stock });
        });

        Object.entries(auditByIng).forEach(([ingId, entries]) => {
          let totalDrop = 0;
          for (let i = 1; i < entries.length; i++) {
            const diff = entries[i - 1].stock - entries[i].stock;
            if (diff > 0) totalDrop += diff;
          }
          auditDiffMap[ingId] = totalDrop;
        });
      }

      // ── Tính số ngày tới ngày mục tiêu ────────────────────────────────────────
      const daysToTarget = Math.max(1, differenceInCalendarDays(parseISO(targetDate), parseISO(stockDate)));

      // ── Build forecast rows ───────────────────────────────────────────────────
      const rows: ForecastRow[] = ingredients.map((ing: any) => {
        const hasSales = (salesMap[ing.id] ?? 0) > 0;
        const hasAuditDiff = (auditDiffMap[ing.id] ?? 0) > 0;

        let totalConsumption = 0;
        let source: ConsumptionSource = 'none';

        if (hasSales) {
          totalConsumption = salesMap[ing.id];
          source = 'sales';
        } else if (hasAuditDiff) {
          totalConsumption = auditDiffMap[ing.id];
          source = 'audit_diff';
        }

        const rawAvgDaily = totalConsumption / days;
        const avgDaily = rawAvgDaily * weatherFactor; // Áp dụng hệ số thời tiết
        
        const stockInfo = (stocksData ?? [] as any[]).find((s: any) => s.ingredient_id === ing.id);
        const currentStock = stockInfo?.current_stock ?? 0;
        const minStock = ing.min_stock ?? 0;
        const incomingQty = incomingQtyMap[ing.id] || 0;

        // Số ngày tồn còn dùng được
        const daysRemaining = avgDaily > 0
          ? Math.floor(currentStock / avgDaily)
          : null;

        // Công thức mới: (Tiêu hao + Min) - (Tồn hiện tại + Hàng sắp về)
        const totalNeeded = (avgDaily * daysToTarget + minStock);
        const totalAvailable = (currentStock + incomingQty);
        const reorderQty = Math.max(0, totalNeeded - totalAvailable);

        return {
          id: ing.id,
          name: ing.name,
          unit: ing.unit,
          totalConsumption,
          avgDaily,
          source,
          currentStock,
          daysRemaining,
          minStock,
          cycleDays: daysToTarget,
          reorderQty,
          order_type_id: ing.order_type_id,
          incomingQty,
        };
      });

      // Sắp xếp: có tiêu hao + nguy cấp lên trên
      rows.sort((a, b) => {
        // none xuống cuối
        if (a.source === 'none' && b.source !== 'none') return 1;
        if (a.source !== 'none' && b.source === 'none') return -1;
        // Trong nhóm có tiêu hao: daysRemaining thấp lên trên
        const da = a.daysRemaining ?? 9999;
        const db = b.daysRemaining ?? 9999;
        if (da !== db) return da - db;
        return a.name.localeCompare(b.name);
      });

      setData(rows);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchForecast(periodDays); }, [periodDays, targetDate, stockDate]);

  const calculatedData = useMemo(() => {
    return data.map(item => {
      const incomingQty = incomingQtyMap[item.id] || 0;
      const totalNeeded = (item.avgDaily * item.cycleDays + item.minStock);
      const totalAvailable = (item.currentStock + incomingQty);
      const reorderQty = Math.max(0, totalNeeded - totalAvailable);
      return { ...item, incomingQty, reorderQty };
    });
  }, [data, incomingQtyMap]);

  const filteredData = calculatedData.filter(r => {
    const matchSearch = unsignedString(r.name).includes(unsignedString(search));
    const matchOrderType = !selectedOrderTypeId || r.order_type_id === selectedOrderTypeId;
    return matchSearch && matchOrderType;
  });



  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="container-fluid py-3 py-md-4">
      {/* Header */}
      <div className="row align-items-center mb-4 g-3">
        <div className="col-12 col-md-auto me-md-auto">
          <div className="d-flex align-items-center gap-3">
             <div>
                <h1 className="h3 fw-black text-dark mb-1 text-uppercase">Dự đoán & Đề xuất đặt hàng</h1>
                <p className="text-secondary small mb-0">
                  Phân tích tiêu thụ thực tế & thời tiết Hà Nội để tối ưu tồn kho.
                </p>
             </div>
             {weatherDesc && (
                <div className="d-none d-lg-flex align-items-center gap-2 bg-white px-3 py-2 rounded-4 shadow-sm border border-light">
                   <div className="bg-light p-2 rounded-circle">
                      {weatherIcon || <Sun size={20} className="text-warning" />}
                   </div>
                   <div>
                      <div className="fw-black text-dark" style={{ fontSize: '13px' }}>Hà Nội - Dự báo</div>
                      <div className="small text-muted fw-bold" style={{ fontSize: '11px' }}>{weatherDesc}</div>
                   </div>
                </div>
             )}
          </div>
        </div>
        <div className="col-12 col-md-auto">
          <button
            onClick={() => fetchForecast(periodDays)}
            disabled={loading}
            className="btn btn-outline-secondary btn-sm px-4 rounded-pill w-100 d-flex align-items-center justify-content-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Tải lại
          </button>
        </div>
      </div>

      {/* Period & Filter selector */}
      <div className="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
        <div className="card-body p-3 bg-light">
          <div className="row align-items-center g-3">
            <div className="col-12 col-md-auto">
              <div className="input-group input-group-sm shadow-sm">
                <span className="input-group-text bg-white border-0 rounded-start-pill pe-0">
                  <Search size={14} className="text-muted" />
                </span>
                <input
                  type="text"
                  placeholder="Tìm nguyên liệu..."
                  className="form-control border-0 shadow-none rounded-end-pill ps-2"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '180px' }}
                />
              </div>
            </div>
            <div className="col-12 col-md-auto border-start ps-md-4">
              <span className="small fw-bold text-muted text-uppercase tracking-wider">Phân tích:</span>
            </div>
            <div className="col-12 col-md-auto">
              <div className="btn-group btn-group-sm shadow-sm rounded-pill overflow-hidden">
                {PERIODS.map(p => (
                  <button
                    key={p.days}
                    onClick={() => setPeriodDays(p.days)}
                    className={`btn px-3 fw-bold ${periodDays === p.days ? 'btn-primary' : 'btn-white bg-white text-secondary border'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-12 col-md-auto border-start ps-md-4">
              <span className="small fw-bold text-muted text-uppercase tracking-wider">Loại đơn:</span>
            </div>
            <div className="col-12 col-md-auto">
              <select 
                className="form-select form-select-sm rounded-pill shadow-sm border-0 px-3"
                value={selectedOrderTypeId}
                onChange={e => setSelectedOrderTypeId(e.target.value)}
                style={{ minWidth: '160px' }}
              >
                <option value="">Tất cả loại đơn</option>
                {orderTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-auto border-start ps-md-4">
              <span className="small fw-bold text-muted text-uppercase tracking-wider">Ngày chốt tồn:</span>
            </div>
            <div className="col-12 col-md-auto">
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-white border-0 shadow-sm rounded-start-pill pe-0">
                  <Calendar size={14} className="text-secondary" />
                </span>
                <input 
                  type="date" 
                  className="form-control form-control-sm border-0 shadow-sm rounded-end-pill ps-2 fw-bold"
                  value={stockDate}
                  onChange={e => setStockDate(e.target.value)}
                  max={targetDate}
                />
              </div>
            </div>
            <div className="col-12 col-md-auto border-start ps-md-4">
              <span className="small fw-bold text-muted text-uppercase tracking-wider">Dự trù đến:</span>
            </div>
            <div className="col-12 col-md-auto">
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-white border-0 shadow-sm rounded-start-pill pe-0">
                  <Calendar size={14} className="text-primary" />
                </span>
                <input 
                  type="date" 
                  className="form-control form-control-sm border-0 shadow-sm rounded-end-pill ps-2 fw-bold"
                  value={targetDate}
                  min={stockDate}
                  onChange={e => setTargetDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="row g-3 mb-4">
          <div className="col-12 col-md-4">
            <div className="card h-100 border-0 shadow-sm rounded-4 text-center text-md-start">
              <div className="card-body">
                <div className="d-flex align-items-center gap-2 mb-2 justify-content-center justify-content-md-start">
                  <TrendingDown size={16} className="text-primary" />
                  <span className="small fw-bold text-muted text-uppercase tracking-wider">Có tiêu hao</span>
                </div>
                <h2 className="display-6 fw-black text-dark mb-0">{filteredData.filter(r => r.source !== 'none').length}</h2>
                <p className="small text-muted mt-1 opacity-75">nguyên liệu đang xem</p>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className={`card h-100 border-start border-4 border-danger shadow-sm rounded-4 text-center text-md-start ${filteredData.filter(r => r.daysRemaining !== null && r.daysRemaining <= 3).length > 0 ? 'bg-danger-subtle' : 'bg-white border-0'}`}>
              <div className="card-body">
                <div className="d-flex align-items-center gap-2 mb-2 justify-content-center justify-content-md-start">
                  <AlertTriangle size={16} className={filteredData.filter(r => r.daysRemaining !== null && r.daysRemaining <= 3).length > 0 ? 'text-danger' : 'text-muted'} />
                  <span className="small fw-bold text-muted text-uppercase tracking-wider">Cần nhập gấp</span>
                </div>
                <h2 className={`display-6 fw-black mb-0 ${filteredData.filter(r => r.daysRemaining !== null && r.daysRemaining <= 3).length > 0 ? 'text-danger' : 'text-dark'}`}>{filteredData.filter(r => r.daysRemaining !== null && r.daysRemaining <= 3).length}</h2>
                <p className="small text-muted mt-1 opacity-75">còn ≤ 3 ngày tồn</p>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="card h-100 border-0 shadow-sm rounded-4 text-center text-md-start">
              <div className="card-body">
                <div className="d-flex align-items-center gap-2 mb-2 justify-content-center justify-content-md-start">
                  <ShoppingCart size={16} className="text-success" />
                  <span className="small fw-bold text-muted text-uppercase tracking-wider">Cần đặt hàng</span>
                </div>
                <h2 className="display-6 fw-black text-dark mb-0">{filteredData.filter(r => r.reorderQty > 0).length}</h2>
                <p className="small text-muted mt-1 opacity-75">nguyên liệu cần nhập</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="row g-2 mb-4">
        {Object.entries(SOURCE_LABEL).map(([key, val]) => (
          <div key={key} className="col-12 col-md-auto">
            <div className={`px-3 py-1 rounded-pill border small fw-bold d-inline-flex align-items-center gap-2 ${val.cls.replace('bg-', 'bg-subtle-')}`} style={{ fontSize: '11px' }}>
              <span>{val.text}</span>
              <span className="opacity-50 fw-normal d-none d-xl-inline">· {val.tip}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
            <thead className="table-light shadow-sm">
              <tr>
                <th className="px-3 py-3 text-dark text-uppercase small fw-bold tracking-widest border-0">Nguyên Liệu</th>
                <th className="px-3 py-3 text-dark text-uppercase small fw-bold tracking-widest border-0">Loại Đơn</th>
                <th className="px-3 py-3 text-dark text-uppercase small fw-bold tracking-widest border-0 text-center">Nguồn</th>
                <th className="px-3 py-3 text-dark text-uppercase small fw-bold tracking-widest border-0 text-end">Tiêu hao</th>
                <th className="px-3 py-3 text-dark text-uppercase small fw-bold tracking-widest border-0 text-end">TB/ngày</th>
                <th className="px-3 py-3 text-dark text-uppercase small fw-bold tracking-widest border-0 text-end">Tồn kho</th>
                <th className="px-3 py-3 text-dark text-uppercase small fw-bold tracking-widest border-0 text-center">Hàng sắp về</th>
                <th className="px-3 py-3 text-dark text-uppercase small fw-bold tracking-widest border-0 text-center">Dự báo</th>
                <th className="px-3 py-3 text-primary text-uppercase small fw-black tracking-widest border-0 text-end">Đề xuất đặt</th>
              </tr>
            </thead>
            <tbody className="border-top-0">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-center text-muted">
                    <Calculator size={32} className="animate-pulse mb-3 opacity-50" />
                    <p className="fw-bold mb-1">Đang tính toán...</p>
                    <p className="small opacity-50">Dữ liệu tiêu thụ thực tế & Dự trù đến {format(parseISO(targetDate), 'dd/MM')}</p>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-center text-muted">
                    <p className="mb-0">Không tìm thấy nguyên liệu nào phù hợp điều kiện lọc.</p>
                  </td>
                </tr>
              ) : (
                filteredData.map(item => {
                  const src = SOURCE_LABEL[item.source];
                  const isUrgent = item.daysRemaining !== null && item.daysRemaining <= 3;
                  const isWarn = item.daysRemaining !== null && item.daysRemaining > 3 && item.daysRemaining <= 7;
                  const isNone = item.source === 'none';

                  let daysBadge = null;
                  if (item.daysRemaining !== null) {
                    if (item.daysRemaining <= 0) daysBadge = { text: 'Hết hàng', cls: 'bg-danger text-white border-danger' };
                    else if (isUrgent) daysBadge = { text: `${item.daysRemaining}d ⚠️`, cls: 'bg-danger text-white border-danger' };
                    else if (isWarn) daysBadge = { text: `${item.daysRemaining}d`, cls: 'bg-warning text-dark border-warning' };
                    else daysBadge = { text: `${item.daysRemaining}d`, cls: 'bg-success text-white border-success' };
                  }

                  return (
                    <tr
                      key={item.id}
                      className={isUrgent ? 'table-danger-subtle' : ''}
                    >
                      <td className="px-3 py-3 fw-bold text-dark">{item.name}</td>
                      <td className="px-3 py-3">
                        <span className={`small fw-bold ${isNone ? 'text-muted' : 'text-primary-emphasis'}`}>
                          {orderTypes.find(t => t.id === item.order_type_id)?.name || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`badge rounded-pill fw-black border px-3 py-1 ${src.cls}`} style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                          {src.text}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-end text-muted">
                        {item.totalConsumption > 0 ? (
                          <span className="fw-bold text-dark">
                            {fmt(item.totalConsumption)} <small>{item.unit}</small>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 text-end text-warning-emphasis">
                        {item.avgDaily > 0 ? (
                          <span className="fw-black">
                            {fmt(item.avgDaily)} <small>{item.unit}</small>
                          </span>
                        ) : '—'}
                      </td>
                      <td className={`px-3 py-3 text-end fw-black ${item.currentStock <= 0 ? 'text-danger' : 'text-dark'}`} style={{ fontSize: '15px' }}>
                        {fmt(item.currentStock)} <small className="fw-normal text-muted" style={{ fontSize: '11px' }}>{item.unit}</small>
                      </td>
                      <td className="px-3 py-3" style={{ width: '120px' }}>
                        <div className="input-group input-group-sm">
                          <input 
                            type="number"
                            className="form-control form-control-sm text-center fw-bold border-primary-subtle rounded-pill"
                            placeholder="0"
                            value={incomingQtyMap[item.id] || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setIncomingQtyMap(prev => ({ ...prev, [item.id]: val }));
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {daysBadge ? (
                          <span className={`badge rounded-pill d-inline-flex align-items-center gap-1 shadow-sm px-2 py-1 ${daysBadge.cls}`}>
                            <Clock size={10} /> {daysBadge.text}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 text-end">
                        {item.reorderQty > 0 ? (
                          <div className="btn btn-sm btn-primary rounded-pill fw-black shadow-sm px-3 py-1" style={{ fontSize: '11px' }}>
                            +{Math.ceil(item.reorderQty)} {item.unit}
                          </div>
                        ) : item.source !== 'none' ? (
                          <span className="badge rounded-pill bg-success-subtle text-success border border-success fw-bold p-1 px-2" style={{ fontSize: '10px' }}>
                            <CheckCircle2 size={10} className="me-1" /> Đủ hàng
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && data.length > 0 && (
          <div className="card-footer bg-light border-0 py-3 px-4">
              <p className="small text-muted mb-0 lh-base" style={{ fontSize: '11px' }}>
                <span className="me-3"><strong>Bán hàng:</strong> SALES_USAGE + WASTE</span>
                <span className="me-3"><strong>Chênh lệch:</strong> NVL không có sales</span>
                <span className="me-3"><strong>Hệ số thời tiết:</strong> {weatherFactor.toFixed(2)}x (Áp dụng cho TB/ngày)</span>
                <span className="me-3"><strong>Đề xuất:</strong> (TB/ngày × Hệ số × Ngày dự trù + tồn min) − (tồn hiện tại + hàng sắp về)</span>
             </p>
          </div>
        )}
      </div>
    </div>
  );
}