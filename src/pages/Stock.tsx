import { useState, useEffect } from 'react';
import { useFacility } from '../contexts/FacilityContext';
import { Search, AlertTriangle, AlertCircle, CheckCircle2, ClipboardList, Calendar, Archive, Info, CalendarCheck } from 'lucide-react';
import { format, parseISO, endOfMonth } from 'date-fns';
import { StockAIAssistant } from '../components/StockAIAssistant';
import { IngredientLossAnalyzer } from '../components/IngredientLossAnalyzer';

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

interface IngredientRow {
  id: string;
  name: string;
  unit: string;
  min_stock: number | null;
  category_name: string | null;
  // from latest audit
  stock_in_store: number | null;
  stock_in_counter: number | null;
  actual_stock: number | null; // latest audit actual
  theoretical_stock: number | null; // monthly true book stock
  audit_date: string | null;
  // calculated
  monthly_variance: number;
  current_actual: number | null; // estimated current real stock (latest actual + changes since)
  order_type_id: string | null;
}

interface OrderType {
  id: string;
  name: string;
}

const Stock = () => {
  const { facilityClient } = useFacility();
  const supabase = facilityClient!;
  const [selectedMonth, setSelectedMonth] = useState<string>(() => format(new Date(), 'yyyy-MM'));
  const [selectedClosingDate, setSelectedClosingDate] = useState<string>(''); // empty = use end of month
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [filterOrderType, setFilterOrderType] = useState('');
  const [orderTypes, setOrderTypes] = useState<OrderType[]>([]);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [totalWasteCost, setTotalWasteCost] = useState<number>(0);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<{ id: string; name: string; unit: string } | null>(null);

  const fetchStock = async () => {
    setLoading(true);

    const parsedDate = parseISO(`${selectedMonth}-01`);
    const monthStart = format(parsedDate, 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(parsedDate), 'yyyy-MM-dd');
    // Use closing date if specified, otherwise use end of month
    const effectiveEndDate = selectedClosingDate || monthEnd;
    const yearMonth = selectedMonth;

    // 0. Fetch monthly opening stock for book stock calculation
    const { data: openingData } = await supabase
      .from('monthly_opening_stock')
      .select('ingredient_id, opening_stock')
      .eq('year_month', yearMonth);
    
    const openingMap: Record<string, number> = {};
    if (openingData) {
      openingData.forEach(m => {
        openingMap[m.ingredient_id] = m.opening_stock ?? 0;
      });
    }

    const { data: typesData } = await supabase
      .from('ingredient_order_types')
      .select('id, name')
      .order('name');
    setOrderTypes(typesData || []);

    // 0. Fetch branches to identify sealed ones
    const { data: allBranches } = await supabase.from('branches').select('id, name');
    const sealedBranchIds = new Set(
      (allBranches || [])
        .filter(b => {
          const n = b.name.toLowerCase();
          return n.includes('niêm phong') || n.includes('sealed') || n.includes('lưu trữ') || n.includes('kho cũ');
        })
        .map(b => b.id)
    );

    // 1. Fetch all ingredients
    const { data: ingData } = await supabase
      .from('ingredients')
      .select('id, name, unit, min_stock, order_type_id, ingredient_categories(name)')
      .order('name');

    if (!ingData) {
      setLoading(false);
      return;
    }

    // 2. Fetch all audits for this month up to effectiveEndDate (to calculate cumulative loss)
    const { data: monthlyAudits } = await supabase
      .from('stock_audits')
      .select('ingredient_id, actual_stock, theoretical_stock, audit_date')
      .gte('audit_date', monthStart)
      .lte('audit_date', effectiveEndDate)
      .order('audit_date', { ascending: false });

    // Build map: ingredient_id → { latest_actual, latest_date, cumulative_variance }
    const auditStats: Record<string, { 
      latest_actual: number | null, 
      latest_theoretical: number | null,
      latest_date: string | null, 
      cumulative_variance: number,
      latest_in_store: number | null,
      latest_in_counter: number | null
    }> = {};

    // We also need the very latest audit up to effectiveEndDate
    const { data: allLatestAudits } = await supabase
      .from('stock_audits')
      .select('ingredient_id, stock_in_store, stock_in_counter, actual_stock, theoretical_stock, audit_date')
      .lte('audit_date', effectiveEndDate)
      .order('audit_date', { ascending: false })
      .order('created_at', { ascending: false });

    const latestAuditMap: Record<string, any> = {};
    if (allLatestAudits) {
      allLatestAudits.forEach((a: any) => {
        if (a.ingredient_id && latestAuditMap[a.ingredient_id] === undefined) {
          latestAuditMap[a.ingredient_id] = a;
        }
      });
    }

    if (monthlyAudits) {
      monthlyAudits.forEach((a: any) => {
        if (!a.ingredient_id) return;
        if (!auditStats[a.ingredient_id]) {
          auditStats[a.ingredient_id] = {
            latest_actual: null,
            latest_theoretical: null,
            latest_date: null,
            cumulative_variance: 0,
            latest_in_store: null,
            latest_in_counter: null
          };
        }
        // Cumulative variance = sum of (actual - theoretical)
        const v = (a.actual_stock ?? 0) - (a.theoretical_stock ?? 0);
        auditStats[a.ingredient_id].cumulative_variance += v;
      });
    }

    // 3. Fetch transactions up to effectiveEndDate
    const { data: recentTx } = await supabase
      .from('stock_transactions')
      .select('ingredient_id, type, quantity, transaction_date, branch_id, ingredients(name)')
      .gte('transaction_date', monthStart)
      .lte('transaction_date', effectiveEndDate);

    const txSinceMap: Record<string, number> = {};
    const totalTxMap: Record<string, number> = {};

    if (recentTx) {
      recentTx.forEach(tx => {
        const id = tx.ingredient_id;
        if (!id) return;
        
        const qty = Number(tx.quantity);
        let change = 0;
        
        if (['IN', 'IN_TRANSFER'].includes(tx.type)) {
          if (!tx.branch_id || !sealedBranchIds.has(tx.branch_id)) {
            change = qty;
          }
        } else {
          change = -Math.abs(qty);
        }
        
        // Cumulative total for the whole month (for Book Stock)
        totalTxMap[id] = (totalTxMap[id] ?? 0) + change;

        const latestDate = latestAuditMap[id]?.audit_date;
        
        // Only count transactions happening AFTER the latest audit date (for Current Actual)
        if (latestDate && tx.transaction_date > latestDate) {
          txSinceMap[id] = (txSinceMap[id] ?? 0) + change;
        } else if (!latestDate) {
          txSinceMap[id] = (txSinceMap[id] ?? 0) + change;
        }
      });
    }

    // 4. Merge
    const merged: IngredientRow[] = ingData.map((ing: any) => {
      const latest = latestAuditMap[ing.id];
      const stats = auditStats[ing.id]; // monthly audit stats (within effectiveEndDate)
      
      const latestActual = latest ? (latest.actual_stock ?? 0) : null;
      const changeSince = txSinceMap[ing.id] ?? 0;
      const totalTxMonth = totalTxMap[ing.id] ?? 0;
      const openStock = openingMap[ing.id] ?? 0;
      
      // If a recent audit exists, use its stored theoretical_stock as the
      // baseline for book stock (authoritative source from the audit module).
      // Then project forward by adding transactions that happened after that audit.
      // If no audit: fall back to opening_stock + all month transactions.
      const bookStock = latest
        ? (latest.theoretical_stock ?? 0) + changeSince
        : openStock + totalTxMonth;

      const currentActual = latestActual !== null ? latestActual + changeSince : null;

      // "Hao Hụt" = cumulative monthly variance (sum of all audit variances this month)
      // This matches what IngredientLossAnalyzer shows as "Chênh lệch lũy kế".
      // If audited this month: use cumulative sum of (actual - theoretical) across all audits.
      // If not audited this month but has historical audit: use currentActual - bookStock.
      // If never audited: 0.
      const monthly_variance = stats
        ? stats.cumulative_variance // DO NOT add changeSince (transactions are not loss)
        : currentActual !== null
          ? currentActual - bookStock
          : 0;

      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        min_stock: ing.min_stock ?? 0,
        category_name: ing.ingredient_categories?.name ?? null,
        stock_in_store: latest ? latest.stock_in_store : null,
        stock_in_counter: latest ? latest.stock_in_counter : null,
        actual_stock: latestActual,
        theoretical_stock: bookStock,
        audit_date: latest ? latest.audit_date : null,
        monthly_variance,
        current_actual: currentActual,
        order_type_id: ing.order_type_id
      };
    });

    setRows(merged);
    const cats = Array.from(
      new Set(merged.map(r => r.category_name).filter(Boolean))
    ) as string[];
    setCategories(cats);

    // Fetch total revenue up to effectiveEndDate from SALES_USAGE metadata transactions
    const { data: revenueData } = await supabase
      .from('stock_transactions')
      .select('notes')
      .eq('type', 'SALES_USAGE')
      .is('ingredient_id', null)
      .gte('transaction_date', monthStart)
      .lte('transaction_date', effectiveEndDate);
    
    let revSum = 0;
    if (revenueData) {
      revenueData.forEach(tx => {
        if (tx.notes) {
          const match = tx.notes.match(/^\[REVENUE: ([\d,.]+)\]/);
          if (match) {
            revSum += parseFloat(match[1].replace(/,/g, ''));
          }
        }
      });
    }
    setTotalRevenue(revSum);

    // Fetch actual waste cost up to effectiveEndDate by joining WASTE transactions with ingredients to get unit_price
    const { data: wasteTx } = await supabase
      .from('stock_transactions')
      .select('quantity, ingredients(unit_price)')
      .eq('type', 'WASTE')
      .gte('transaction_date', monthStart)
      .lte('transaction_date', effectiveEndDate);
    
    let wasteSum = 0;
    if (wasteTx) {
      wasteTx.forEach(tx => {
        const qty = Math.abs(tx.quantity);
        const price = (tx.ingredients as any)?.unit_price || 0;
        wasteSum += qty * price;
      });
    }
    setTotalWasteCost(wasteSum);
    setRecentTransactions(recentTx || []);

    setLoading(false);
  };

  useEffect(() => {
    fetchStock();
  }, [selectedMonth, selectedClosingDate]);

  const getStatus = (current: number | null, min: number | null) => {
    if (current === null) return { label: 'Chưa kiểm kê', color: 'text-gray-500 bg-gray-100', icon: ClipboardList };
    if (current <= 0) return { label: 'Hết hàng', color: 'text-red-600 bg-red-100', icon: AlertCircle };
    if (current <= (min ?? 0)) return { label: 'Sắp hết', color: 'text-orange-600 bg-orange-100', icon: AlertTriangle };
    return { label: 'Đủ hàng', color: 'text-green-600 bg-green-100', icon: CheckCircle2 };
  };

  const filtered = rows.filter(r => {
    const matchSearch = unsignedString(r.name).includes(unsignedString(search));
    const matchCat = filterCategory ? r.category_name === filterCategory : true;
    const matchOrderType = filterOrderType ? r.order_type_id === filterOrderType : true;
    return matchSearch && matchCat && matchOrderType;
  });

  // Stats
  const audited = rows.filter(r => r.actual_stock !== null);
  const outOfStock = audited.filter(r => (r.current_actual ?? 0) <= 0);
  const lowStock = audited.filter(r => (r.current_actual ?? 0) > 0 && (r.current_actual ?? 0) <= (r.min_stock ?? 0));

  // Calculate closing date constraints for the date picker
  const closingDateMin = selectedMonth ? `${selectedMonth}-01` : undefined;
  const closingDateMax = selectedMonth ? format(endOfMonth(parseISO(`${selectedMonth}-01`)), 'yyyy-MM-dd') : undefined;
  const effectiveClosingLabel = selectedClosingDate
    ? format(parseISO(selectedClosingDate), 'dd/MM/yyyy')
    : 'Cuối tháng';

  return (
    <div className="container-fluid py-4 pb-10 animate__animated animate__fadeIn">
      {/* HEADER */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-teal-600 p-3 rounded-2xl shadow-lg shadow-teal-100 ring-4 ring-teal-50">
            <Archive className="text-white" size={28} />
          </div>
          <div>
            <h1 className="h3 fw-black text-gray-800 mb-0 tracking-tight text-uppercase">QUẢN LÝ TỒN KHO</h1>
            <p className="text-gray-400 small mb-0 font-bold uppercase tracking-widest mt-1">
              Số liệu hiển thị dựa trên <span className="text-teal-600">phiếu kiểm kê gần nhất</span>
              {selectedClosingDate && (
                <span className="ms-2 text-amber-600 font-black">• Chốt tồn đến <span className="underline underline-offset-2">{effectiveClosingLabel}</span></span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* SUMMARY STATS */}
      <div className="row g-4 mb-8">
        <div className="col-12 col-md-4">
          <div className="bg-white border-0 shadow-sm rounded-4 p-4 border-start border-5 border-teal-500 premium-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Đã kiểm kê</p>
                <div className="flex items-baseline gap-2">
                   <h2 className="fw-black text-gray-800 mb-0">{audited.length}</h2>
                   <span className="text-gray-400 font-bold">/ {rows.length} món</span>
                </div>
              </div>
              <div className="bg-teal-50 p-2 rounded-xl text-teal-600">
                <CheckCircle2 size={24} />
              </div>
            </div>
            <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
               <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${(audited.length/rows.length)*100}%` }}></div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="bg-white border-0 shadow-sm rounded-4 p-4 border-start border-5 border-warning premium-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] text-warning-emphasis font-black uppercase tracking-widest mb-1">Cảnh báo sắp hết</p>
                <div className="flex items-baseline gap-2">
                   <h2 className="fw-black text-orange-600 mb-0">{lowStock.length}</h2>
                   <span className="text-gray-400 font-bold">mặt hàng</span>
                </div>
              </div>
              <div className="bg-orange-50 p-2 rounded-xl text-orange-600">
                <AlertTriangle size={24} />
              </div>
            </div>
            <p className="mt-2 mb-0 text-[10px] text-gray-400 font-bold uppercase">Ưu tiên nhập hàng sớm</p>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="bg-white border-0 shadow-sm rounded-4 p-4 border-start border-5 border-danger premium-shadow text-red-50">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] text-danger font-black uppercase tracking-widest mb-1">Hết hàng / Cháy kho</p>
                <div className="flex items-baseline gap-2">
                   <h2 className="fw-black text-danger mb-0">{outOfStock.length}</h2>
                   <span className="text-gray-400 font-bold">mặt hàng</span>
                </div>
              </div>
              <div className="bg-red-50 p-2 rounded-xl text-danger">
                <AlertCircle size={24} />
              </div>
            </div>
            <p className="mt-2 mb-0 text-[10px] text-gray-400 font-bold uppercase">Cần nhập kho ngay lập tức</p>
          </div>
        </div>
      </div>

      {/* DISPOSAL & ALLOWANCE OVERVIEW */}
      <div className="mb-8">
        <h5 className="fw-black text-gray-800 text-uppercase tracking-wider mb-3">TỔNG QUAN HẠN MỨC HỦY HÀNG</h5>
        <div className="row g-4">
          {/* Total Revenue */}
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="bg-white border-0 shadow-sm rounded-4 p-4 border-start border-5 border-primary h-100 premium-shadow">
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Tổng Doanh Thu</p>
              <h4 className="fw-black text-gray-800 mb-1">{totalRevenue.toLocaleString()} <small className="text-xs text-gray-400">VND</small></h4>
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-0">Lũy kế từ dữ liệu số bán đã nhập</p>
            </div>
          </div>
          {/* Allowed Disposal */}
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="bg-white border-0 shadow-sm rounded-4 p-4 border-start border-5 border-info h-100 premium-shadow">
              <p className="text-[10px] text-info font-black uppercase tracking-widest mb-1">Hạn Mức Hủy Cho Phép</p>
              <h4 className="fw-black text-info mb-1">{(totalRevenue * 0.00075).toLocaleString()} <small className="text-xs text-info">VND</small></h4>
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-0">Tương đương 0.075% doanh thu</p>
            </div>
          </div>
          {/* Actual Waste */}
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="bg-white border-0 shadow-sm rounded-4 p-4 border-start border-5 border-danger h-100 premium-shadow">
              <p className="text-[10px] text-danger font-black uppercase tracking-widest mb-1">Chi Phí Đã Hủy</p>
              <h4 className="fw-black text-danger mb-1">{totalWasteCost.toLocaleString()} <small className="text-xs text-danger">VND</small></h4>
              <p className="text-[10px] text-gray-400 font-bold uppercase mb-0">Tính theo đơn giá nguyên liệu</p>
            </div>
          </div>
          {/* Remaining Allowance */}
          <div className="col-12 col-sm-6 col-lg-3">
            {(() => {
              const limit = totalRevenue * 0.00075;
              const diff = limit - totalWasteCost;
              const borderClass = diff >= 0 ? 'border-success' : 'border-danger';
              const textClass = diff >= 0 ? 'text-success' : 'text-danger';
              const badgeClass = diff >= 0 ? 'bg-success-subtle text-success border-success' : 'bg-danger-subtle text-danger border-danger';
              
              return (
                <div className={`bg-white border-0 shadow-sm rounded-4 p-4 border-start border-5 ${borderClass} h-100 premium-shadow`}>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-0 ${textClass}`}>Hạn Mức Còn Lại</p>
                    <span className={`badge border rounded-pill ${badgeClass}`} style={{ fontSize: '9px' }}>
                      {diff >= 0 ? 'AN TOÀN' : 'VƯỢT MỨC'}
                    </span>
                  </div>
                  <h4 className={`fw-black mb-1 ${textClass}`}>{diff.toLocaleString()} <small className={`text-xs ${textClass}`}>VND</small></h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-0">
                    {diff >= 0 ? 'Hạn mức chi phí còn được phép hủy' : 'Chi phí đã vượt hạn mức cho phép'}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-4 p-4 mb-6 shadow-sm border border-gray-100">
        <div className="row g-3 align-items-center">
          <div className="col-12 col-sm-6 col-lg-3">
             <div className="relative">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => { setSelectedMonth(e.target.value); setSelectedClosingDate(''); }}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border-0 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-teal-500/20 focus:bg-white transition-all outline-none"
                />
                <Calendar className="absolute left-4 top-3.5 text-gray-400" size={18} />
             </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <div className="relative">
              <input
                type="date"
                value={selectedClosingDate}
                min={closingDateMin}
                max={closingDateMax}
                onChange={(e) => setSelectedClosingDate(e.target.value)}
                className={`w-full pl-11 pr-4 py-3 border-0 rounded-2xl text-sm font-bold focus:ring-2 focus:bg-white transition-all outline-none ${
                  selectedClosingDate
                    ? 'bg-amber-50 text-amber-700 focus:ring-amber-500/20'
                    : 'bg-gray-50 text-gray-500 focus:ring-teal-500/20'
                }`}
                placeholder="Ngày chốt tồn..."
              />
              <CalendarCheck className={`absolute left-4 top-3.5 ${selectedClosingDate ? 'text-amber-500' : 'text-gray-400'}`} size={18} />
              {selectedClosingDate && (
                <button
                  onClick={() => setSelectedClosingDate('')}
                  className="absolute right-3 top-3 text-amber-400 hover:text-amber-600 font-black text-xs px-1 py-0.5 rounded hover:bg-amber-100 transition-all"
                  title="Xóa ngày chốt tồn"
                >
                  ✕
                </button>
              )}
            </div>
            {!selectedClosingDate && (
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-wider mt-1.5 ms-1">Ngày chốt tồn (mặc định: cuối tháng)</p>
            )}
            {selectedClosingDate && (
              <p className="text-[9px] text-amber-500 font-black uppercase tracking-wider mt-1.5 ms-1">⚡ Chốt tồn đến {effectiveClosingLabel}</p>
            )}
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
             <div className="relative">
                <input
                  id="main-search-input"
                  type="text"
                  placeholder="Tìm tên nguyên liệu..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border-0 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-teal-500/20 focus:bg-white transition-all outline-none"
                />
                <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
             </div>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="form-select border-0 bg-gray-50 h-[46px] rounded-2xl text-sm font-bold px-4 focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <select
              value={filterOrderType}
              onChange={(e) => setFilterOrderType(e.target.value)}
              className="form-select border-0 bg-gray-50 h-[46px] rounded-2xl text-sm font-bold px-4 focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="">Nguồn nhập (Loại đơn)</option>
              {orderTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
        <h5 className="fw-black text-gray-800 text-uppercase tracking-wider mb-0">Bảng Đối Soát Tồn Kho</h5>
        <span className="text-[10px] text-teal-600 bg-teal-50 border border-teal-100/50 px-2.5 py-1.5 rounded-xl font-black uppercase tracking-wider animate-pulse flex items-center gap-1.5 shadow-sm">
          <Info size={12} className="shrink-0" /> Click vào dòng bất kỳ để phân tích hao hụt chi tiết
        </span>
      </div>
      <div className="bg-white rounded-4 shadow-sm border border-gray-100 overflow-hidden premium-shadow">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Nguyên Liệu</th>
                <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Số Sách</th>
                <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Thực Tế</th>
                <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Hao Hụt</th>
                <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Kiểm kê</th>
                <th className="px-6 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Trạng Thái</th>
              </tr>
            </thead>
            <tbody className="border-0">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-20 text-center">
                  <div className="spinner-border text-teal-500 mb-3"></div>
                  <p className="text-gray-400 font-bold uppercase tracking-widest small">Đang đối soát dữ liệu...</p>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-20 text-center text-gray-400 font-bold">Không tìm thấy dữ liệu phù hợp</td></tr>
              ) : (
                filtered.map((item) => {
                  const status = getStatus(item.actual_stock, item.min_stock);
                  const StatusIcon = status.icon;
                  const v = item.monthly_variance;
                  const varianceColor = v < -0.001 ? 'bg-red-50 text-danger' : v > 0.001 ? 'bg-teal-50 text-teal-600' : 'bg-gray-50 text-gray-400';

                  return (
                    <tr 
                      key={item.id} 
                      className="group transition-all cursor-pointer hover:bg-teal-50/10 active:bg-teal-50/20"
                      onClick={() => setSelectedIngredient({ id: item.id, name: item.name, unit: item.unit })}
                      title={`Click để xem phân tích hao hụt chi tiết của ${item.name}`}
                    >
                      <td className="px-6 py-4 border-gray-50">
                        <p className="fw-black text-gray-800 mb-0 tracking-tight">{item.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{item.category_name || 'Không phân loại'}</p>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50">
                        <span className="text-sm font-bold text-gray-500">
                          {item.theoretical_stock !== null ? item.theoretical_stock.toLocaleString() : '--'}
                        </span>
                        <small className="text-[9px] text-gray-400 font-black uppercase ms-1">{item.unit}</small>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50">
                        {item.current_actual !== null ? (
                          <div className="inline-flex flex-col">
                            <span className="text-base font-black text-gray-900 leading-none">{item.current_actual.toLocaleString()}</span>
                            <span className="text-[9px] text-gray-400 font-black uppercase mt-1">HIỆN TẠI</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black text-gray-300 uppercase italic">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50">
                        <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-xs ${varianceColor}`}>
                           {v > 0.001 ? '+' : ''}{v.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50">
                         {item.audit_date ? (
                            <div className="flex flex-col items-center">
                               <Calendar size={14} className="text-gray-300 mb-1" />
                               <span className="text-[10px] font-black text-gray-500">{format(parseISO(item.audit_date), 'dd/MM/yyyy')}</span>
                            </div>
                         ) : (
                            <span className="text-gray-200">--</span>
                         )}
                      </td>
                      <td className="px-6 py-4 text-center border-gray-50">
                        <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${status.color}`}>
                          <StatusIcon size={14} />
                          {status.label}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <StockAIAssistant
        rows={rows}
        recentTransactions={recentTransactions}
        selectedMonth={selectedMonth}
      />
      {selectedIngredient && (
        <IngredientLossAnalyzer
          ingredientId={selectedIngredient.id}
          ingredientName={selectedIngredient.name}
          unit={selectedIngredient.unit}
          selectedMonth={selectedMonth}
          selectedClosingDate={selectedClosingDate}
          onClose={() => setSelectedIngredient(null)}
        />
      )}
    </div>
  );
};

export default Stock;
