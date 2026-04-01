import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Save, History, PackageOpen, ChevronLeft, ChevronRight, AlertCircle, CupSoda } from 'lucide-react';
import { TeaAndCakeAuditTab } from '../components/audit/TeaAndCakeAuditTab';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO, subDays, startOfMonth } from 'date-fns';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  ingredient_categories?: { name: string } | null;
}

interface DailyTxSummary {
  // ingredient_id → { in: number, out: number }
  [key: string]: { in: number; out: number };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const toYearMonth = (dateStr: string) => dateStr.slice(0, 7); // 'YYYY-MM'

// Parse 'YYYY-MM-DD' without timezone shift
const parseDate = (d: string) => parseISO(d);

// ─── Component ─────────────────────────────────────────────────────────────

export default function Audit() {
  const { user, role } = useAuth();
  const isStaff = role === 'staff';
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const isToday = selectedDate === todayStr;
  const canEdit = !isStaff || isToday;
  const yearMonth = toYearMonth(selectedDate);
  const isFirstOfMonth = selectedDate.slice(8, 10) === '01';

  // ── View state ──
  const [viewMode, setViewMode] = useState<'daily' | 'opening' | 'history' | 'teaCake'>('daily');

  // ── Data ──
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [openingStockMap, setOpeningStockMap] = useState<Record<string, number>>({}); // ingredient_id → opening stock for selectedDate
  const [dailyTx, setDailyTx] = useState<DailyTxSummary>({}); // in/out summary for selectedDate

  const [storeStocks, setStoreStocks] = useState<Record<string, string>>({}); // ingredient_id → store input string
  const [counterStocks, setCounterStocks] = useState<Record<string, string>>({}); // ingredient_id → counter input string
  const [storeUnits, setStoreUnits] = useState<Record<string, string>>({}); // ingredient_id → unit_name
  const [counterUnits, setCounterUnits] = useState<Record<string, string>>({}); // ingredient_id → unit_name

  const [auditNotes, setAuditNotes] = useState<Record<string, string>>({}); // ingredient_id → note
  const [existingAuditIds, setExistingAuditIds] = useState<Record<string, string>>({}); // ingredient_id → audit record id
  // Ref để handleSaveAudit luôn đọc được giá trị mới nhất, tránh stale closure
  const existingAuditIdsRef = React.useRef<Record<string, string>>({});

  // ── Monthly opening stock (for "opening" view) ──
  const [monthlyOpeningInputs, setMonthlyOpeningInputs] = useState<Record<string, string>>({});
  const [monthlyOpeningUnits, setMonthlyOpeningUnits] = useState<Record<string, string>>({});
  const [monthlyOpeningNotes, setMonthlyOpeningNotes] = useState<Record<string, string>>({});
  const [existingMonthlyIds, setExistingMonthlyIds] = useState<Record<string, string>>({});
  const [hasMonthlyOpening, setHasMonthlyOpening] = useState(false);
  const [allUnits, setAllUnits] = useState<any[]>([]);

  // ── History ──
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [dayAudits, setDayAudits] = useState<any[]>([]); // Thêm state để lưu bản ghi audit cũ phục vụ so sánh

  // ── UI ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  // ═══════════════════════════════════════════════════════════════════════
  // FETCH: Main data for selected date
  // ═══════════════════════════════════════════════════════════════════════

  const fetchDailyData = async () => {
    setLoading(true);

    // Reset state + ref trước khi fetch ngày mới
    setStoreStocks({});
    setCounterStocks({});
    setStoreUnits({});
    setCounterUnits({});
    setAuditNotes({});
    setExistingAuditIds({});
    existingAuditIdsRef.current = {}; // reset ref ngay lập tức (không chờ React re-render)

    // 1. Fetch all ingredients
    const { data: ingData } = await supabase
      .from('ingredients')
      .select('id, name, unit, ingredient_categories(name)')
      .order('name');
    if (ingData) {
      setIngredients(ingData as Ingredient[]);
      const cats = Array.from(
        new Set(ingData.map((i: any) => i.ingredient_categories?.name).filter(Boolean))
      ) as string[];
      setCategories(cats);
    }

    const { data: unitsData } = await supabase.from('ingredient_units').select('*');
    if (unitsData) setAllUnits(unitsData);

    // 2. Fetch existing audit for selectedDate
    const { data: dayAudits } = await supabase
      .from('stock_audits')
      .select('id, ingredient_id, stock_in_store, stock_in_counter, actual_stock, opening_stock, theoretical_stock, notes')
      .eq('audit_date', selectedDate);

    const storeMap: Record<string, string> = {};
    const counterMap: Record<string, string> = {};
    const sUnitMap: Record<string, string> = {};
    const cUnitMap: Record<string, string> = {};
    const noteMap: Record<string, string> = {};
    const auditIdMap: Record<string, string> = {};

    if (dayAudits) {
      setDayAudits(dayAudits); // Lưu vào state để render dùng so sánh
      dayAudits.forEach((a: any) => {
        if (a.ingredient_id) {
          storeMap[a.ingredient_id] = a.stock_in_store?.toString() ?? '';
          counterMap[a.ingredient_id] = a.stock_in_counter?.toString() ?? '';
          sUnitMap[a.ingredient_id] = 'base';
          cUnitMap[a.ingredient_id] = 'base';
          noteMap[a.ingredient_id] = a.notes ?? '';
          auditIdMap[a.ingredient_id] = a.id;
        }
      });
    } else {
      setDayAudits([]);
    }
    setStoreStocks(storeMap);
    setCounterStocks(counterMap);
    setStoreUnits(sUnitMap);
    setCounterUnits(cUnitMap);
    setAuditNotes(noteMap);
    setExistingAuditIds(auditIdMap);
    existingAuditIdsRef.current = auditIdMap; // sync ref ngay lập tức

    // 3. Compute opening stock for each ingredient for selectedDate
    const startOfThisMonth = format(startOfMonth(parseDate(selectedDate)), 'yyyy-MM-dd');

    const { data: priorAudits } = await supabase
      .from('stock_audits')
      .select('ingredient_id, actual_stock, audit_date')
      .gte('audit_date', startOfThisMonth)
      .lt('audit_date', selectedDate)
      .order('audit_date', { ascending: false });

    const priorActualMap: Record<string, number> = {};
    if (priorAudits) {
      priorAudits.forEach((a: any) => {
        if (a.ingredient_id && priorActualMap[a.ingredient_id] === undefined) {
          priorActualMap[a.ingredient_id] = a.actual_stock ?? 0;
        }
      });
    }

    const { data: monthlyData } = await supabase
      .from('monthly_opening_stock')
      .select('ingredient_id, opening_stock')
      .eq('year_month', yearMonth);

    const monthlyMap: Record<string, number> = {};
    if (monthlyData) {
      monthlyData.forEach((m: any) => {
        monthlyMap[m.ingredient_id] = m.opening_stock ?? 0;
      });
    }
    setHasMonthlyOpening(monthlyData ? monthlyData.length > 0 : false);

    const computedOpening: Record<string, number> = {};
    (ingData || []).forEach((ing: any) => {
      if (!isFirstOfMonth && priorActualMap[ing.id] !== undefined) {
        computedOpening[ing.id] = priorActualMap[ing.id];
      } else {
        computedOpening[ing.id] = monthlyMap[ing.id] ?? 0;
      }
    });
    setOpeningStockMap(computedOpening);

    // 4. Fetch transaction summary for selectedDate
    const { data: txData } = await supabase
      .from('stock_transactions')
      .select('ingredient_id, type, quantity')
      .eq('transaction_date', selectedDate);

    const txSummary: DailyTxSummary = {};
    if (txData) {
      txData.forEach((tx: any) => {
        if (!tx.ingredient_id) return;
        if (!txSummary[tx.ingredient_id]) txSummary[tx.ingredient_id] = { in: 0, out: 0 };
        const qty = Math.abs(Number(tx.quantity));
        if (['IN', 'IN_TRANSFER'].includes(tx.type)) {
          txSummary[tx.ingredient_id].in += qty;
        } else if (['OUT', 'WASTE', 'SALES_USAGE'].includes(tx.type)) {
          txSummary[tx.ingredient_id].out += qty;
        }
      });
    }
    setDailyTx(txSummary);

    setLoading(false);
  };

  const fetchMonthlyOpening = async () => {
    setLoading(true);

    const { data: ingData } = await supabase
      .from('ingredients')
      .select('id, name, unit, ingredient_categories(name)')
      .order('name');
    if (ingData) {
      setIngredients(ingData as Ingredient[]);
      const cats = Array.from(
        new Set(ingData.map((i: any) => i.ingredient_categories?.name).filter(Boolean))
      ) as string[];
      setCategories(cats);
    }

    const { data: monthlyData } = await supabase
      .from('monthly_opening_stock')
      .select('id, ingredient_id, opening_stock, notes')
      .eq('year_month', yearMonth);

    const inputMap: Record<string, string> = {};
    const noteMap: Record<string, string> = {};
    const idMap: Record<string, string> = {};

    if (monthlyData) {
      monthlyData.forEach((m: any) => {
        inputMap[m.ingredient_id] = m.opening_stock?.toString() ?? '';
        noteMap[m.ingredient_id] = m.notes ?? '';
        idMap[m.ingredient_id] = m.id;
      });
    }
    setMonthlyOpeningInputs(inputMap);
    setMonthlyOpeningNotes(noteMap);
    setExistingMonthlyIds(idMap);

    const { data: unitsData } = await supabase.from('ingredient_units').select('*');
    if (unitsData) setAllUnits(unitsData);

    setLoading(false);
  };

  const fetchHistory = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('stock_audits')
      .select('*, ingredients(name, unit), profiles(full_name, email)')
      .order('audit_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setAuditHistory(data);
    setLoading(false);
  };

  useEffect(() => {
    if (viewMode === 'daily') fetchDailyData();
    else if (viewMode === 'opening') fetchMonthlyOpening();
    else if (viewMode === 'history') fetchHistory();
  }, [viewMode, selectedDate]);

  const handleSaveAudit = async () => {
    const filledKeys = Object.keys(storeStocks).concat(Object.keys(counterStocks))
      .filter((v, i, a) => a.indexOf(v) === i)
      .filter(k => storeStocks[k] !== '' || counterStocks[k] !== '');

    if (filledKeys.length === 0) {
      alert('Vui lòng nhập ít nhất 1 số tồn thực tế!');
      return;
    }

    setSaving(true);
    try {
      const toUpdate: any[] = [];
      const toInsert: any[] = [];

      filledKeys.forEach(id => {
        const storeIn = parseFloat(storeStocks[id]) || 0;
        const sUnit = storeUnits[id] || 'base';
        let sFactor = 1;
        if (sUnit !== 'base') {
          const unit = allUnits.find(u => u.ingredient_id === id && u.unit_name === sUnit);
          if (unit) sFactor = unit.conversion_factor;
        }
        const store = storeIn * sFactor;

        const counterIn = parseFloat(counterStocks[id]) || 0;
        const cUnit = counterUnits[id] || 'base';
        let cFactor = 1;
        if (cUnit !== 'base') {
          const unit = allUnits.find(u => u.ingredient_id === id && u.unit_name === cUnit);
          if (unit) cFactor = unit.conversion_factor;
        }
        const counter = counterIn * cFactor;

        const actual = store + counter;
        const opening = openingStockMap[id] ?? 0;
        const tx = dailyTx[id] || { in: 0, out: 0 };
        const theoretical = opening + tx.in - tx.out;

        const base = {
          ingredient_id: id,
          audit_date: selectedDate,
          opening_stock: opening,
          theoretical_stock: theoretical,
          stock_in_store: store,
          stock_in_counter: counter,
          actual_stock: actual,
          notes: auditNotes[id] || '',
          audited_by: user?.id,
        };

        const existingId = existingAuditIdsRef.current[id];
        if (existingId) {
          toUpdate.push({ ...base, id: existingId });
        } else {
          toInsert.push(base);
        }
      });

      if (toUpdate.length > 0) {
        const { error } = await supabase
          .from('stock_audits')
          .upsert(toUpdate, { onConflict: 'id' });
        if (error) throw new Error(`Lỗi UPDATE: ${error.message} (code: ${error.code})`);
      }

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('stock_audits')
          .insert(toInsert);
        if (error) throw new Error(`Lỗi INSERT: ${error.message} (code: ${error.code})`);
      }

      alert('Đã lưu phiếu kiểm kê thành công!');
      fetchDailyData();
    } catch (err: any) {
      console.error('handleSaveAudit error:', err);
      alert('Lỗi khi lưu kiểm kê: ' + (err?.message ?? JSON.stringify(err)));
    }
    setSaving(false);
  };

  const handleSaveMonthlyOpening = async () => {
    const filledKeys = Object.keys(monthlyOpeningInputs).filter(k => monthlyOpeningInputs[k] !== '');
    if (filledKeys.length === 0) {
      alert('Vui lòng nhập ít nhất 1 số tồn đầu!');
      return;
    }

    setSaving(true);
    try {
      const upserts = filledKeys.map(id => {
        const val = parseFloat(monthlyOpeningInputs[id]) || 0;
        const uName = monthlyOpeningUnits[id] || 'base';
        let factor = 1;
        if (uName !== 'base') {
          const unit = allUnits.find(u => u.ingredient_id === id && u.unit_name === uName);
          if (unit) factor = unit.conversion_factor;
        }

        const record: any = {
          ingredient_id: id,
          year_month: yearMonth,
          opening_stock: val * factor,
          notes: monthlyOpeningNotes[id] || '',
          created_by: user?.id,
          updated_at: new Date().toISOString(),
        };
        if (existingMonthlyIds[id]) record.id = existingMonthlyIds[id];
        return record;
      });

      const { error } = await supabase.from('monthly_opening_stock').upsert(upserts);
      if (error) throw error;

      alert(`Đã lưu tồn đầu tháng thành công!`);
      fetchMonthlyOpening();
    } catch (err) {
      console.error(err);
      alert('Lỗi khi lưu tồn đầu tháng!');
    }
    setSaving(false);
  };

  const filtered = ingredients.filter(ing => {
    const matchSearch = ing.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory ? ing.ingredient_categories?.name === selectedCategory : true;
    return matchSearch && matchCat;
  });

  if (viewMode === 'opening') {
    return (
      <div className="container-fluid py-4">
        <div className="row g-3 align-items-center mb-4">
          <div className="col-12 col-md-auto me-auto text-center text-md-start">
            <h1 className="h3 fw-black text-dark mb-1">TỒN ĐẦU THÁNG</h1>
            <p className="text-secondary small mb-0">Thiết lập số dư đầu kỳ cho tháng <span className="fw-black text-primary">{yearMonth.replace('-', '/')}</span></p>
          </div>
          <div className="col-12 col-md-auto text-center">
            <div className="d-flex gap-2 justify-content-center">
              <button onClick={() => setViewMode('daily')} className="btn btn-outline-secondary btn-sm px-3 rounded-pill fw-bold">← Quay lại</button>
              <button onClick={handleSaveMonthlyOpening} disabled={saving} className="btn btn-warning btn-sm px-3 rounded-pill fw-black text-dark shadow-sm d-flex align-items-center gap-2">
                <Save size={16} /> {saving ? '...' : 'Lưu Tồn Đầu'}
              </button>
            </div>
          </div>
        </div>

        <div className="row g-3 mb-4">
          <div className="col-12 col-md-8">
            <div className="input-group shadow-sm rounded-pill overflow-hidden border">
              <span className="input-group-text bg-white border-0 ps-4 text-muted"><Search size={18} /></span>
              <input type="text" placeholder="Tìm tên nguyên liệu..." value={search} onChange={e => setSearch(e.target.value)} className="form-control border-0 py-2 ms-0" style={{ fontSize: '15px' }} />
            </div>
          </div>
          <div className="col-12 col-md-4">
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="form-select rounded-pill border shadow-sm ps-4 py-2" style={{ fontSize: '15px' }}>
              <option value="">Tất cả danh mục</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="card border-0 shadow-sm rounded-4 overflow-hidden border-top border-5 border-warning">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
              <thead className="table-warning border-0 text-dark">
                <tr>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase">Nguyên Liệu</th>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-center" style={{ width: '250px' }}>Số Tồn Đầu Kỳ</th>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase">Ghi Chú</th>
                </tr>
              </thead>
              <tbody className="border-top-0 bg-white">
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-5 text-center text-muted italic">Đang tải dữ liệu...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-5 text-center text-muted italic">Không tìm thấy nguyên liệu nào.</td></tr>
                ) : (
                  filtered.map(ing => (
                    <tr key={ing.id}>
                      <td className="px-4 py-3 fw-bold text-dark">
                        <div className="d-flex flex-column">
                          <span className="text-uppercase small fw-black tracking-tight">{ing.name}</span>
                          <span className="text-secondary opacity-50 fst-italic" style={{ fontSize: '10px' }}>({ing.unit})</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="input-group input-group-sm rounded shadow-sm border overflow-hidden">
                          <input type="number" step="0.000001" min="0" value={monthlyOpeningInputs[ing.id] || ''} onChange={e => setMonthlyOpeningInputs(prev => ({ ...prev, [ing.id]: e.target.value }))} className="form-control text-end fw-bold border-0 bg-white" placeholder="0" />
                          <select value={monthlyOpeningUnits[ing.id] || 'base'} onChange={e => setMonthlyOpeningUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="form-select bg-light border-0 text-muted small px-1" style={{ flex: '0 0 70px', fontSize: '10px' }}>
                            <option value="base">{ing.unit}</option>
                            {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (
                              <option key={u.id} value={u.unit_name}>{u.unit_name}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" placeholder="Thêm ghi chú..." value={monthlyOpeningNotes[ing.id] || ''} onChange={e => setMonthlyOpeningNotes(prev => ({ ...prev, [ing.id]: e.target.value }))} className="form-control form-control-sm border shadow-sm rounded bg-white" style={{ fontSize: '11px' }} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'history') {
    return (
      <div className="container-fluid py-4">
        <div className="row g-3 align-items-center mb-4">
          <div className="col-12 col-md-auto me-auto text-center text-md-start">
            <h1 className="h3 fw-black text-dark mb-1">LỊCH SỬ KIỂM KÊ</h1>
            <p className="text-secondary small mb-0">Xem lại các đợt đối soát kho trước đó.</p>
          </div>
          <div className="col-12 col-md-auto text-center">
            <button onClick={() => setViewMode('daily')} className="btn btn-outline-secondary d-flex align-items-center gap-2 rounded-pill fw-bold btn-sm px-3 shadow-hover-sm mx-auto">
              <ChevronLeft size={16} /> Quay lại
            </button>
          </div>
        </div>

        <div className="card border-0 shadow-sm rounded-4 overflow-hidden border-top border-5 border-info">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
              <thead className="table-light border-0">
                <tr>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Ngày KK</th>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Nguyên Liệu</th>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Tồn đầu</th>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Lý Thuyết</th>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thực Tế</th>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Chênh Lệch</th>
                  <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Ghi Chú</th>
                </tr>
              </thead>
              <tbody className="border-top-0 bg-white">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-5 text-center text-muted italic">Đang tải lịch sử...</td></tr>
                ) : auditHistory.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-5 text-center text-muted italic">Chưa có bản ghi nào.</td></tr>
                ) : (
                  auditHistory.map(a => {
                    const variance = (a.actual_stock ?? 0) - (a.theoretical_stock ?? 0);
                    return (
                      <tr key={a.id}>
                        <td className="px-4 py-3 fw-bold text-info">{a.audit_date ? format(parseISO(a.audit_date), 'dd/MM/yyyy') : '-'}</td>
                        <td className="px-4 py-3 fw-bold text-dark text-uppercase">{a.ingredients?.name}</td>
                        <td className="px-4 py-3 text-end text-muted small">{a.opening_stock ?? 0} <span className="opacity-50">{a.ingredients?.unit}</span></td>
                        <td className="px-4 py-3 text-end text-muted">{a.theoretical_stock} <span className="opacity-50">{a.ingredients?.unit}</span></td>
                        <td className="px-4 py-3 text-end fw-black fs-6">{a.actual_stock} <span className="opacity-50">{a.ingredients?.unit}</span></td>
                        <td className={`px-4 py-3 text-end fw-black ${variance < -0.000001 ? 'text-danger' : variance > 0.000001 ? 'text-primary' : 'text-success'}`}>{variance > 0.000001 ? '+' : ''}{variance}</td>
                        <td className="px-4 py-3 text-secondary small italic text-truncate" style={{ maxWidth: '200px' }}>{a.notes || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'teaCake') {
    return (
      <div className="container-fluid py-4">
        <div className="row g-3 align-items-center mb-4">
          <div className="col-12 col-md-auto me-auto text-center text-md-start">
            <h1 className="h3 fw-black text-dark mb-1">KIỂM KÊ TRÀ & BÁNH</h1>
            <p className="text-secondary small mb-0">Đối chiếu tồn thực tế cho các mặt hàng pha chế và bánh.</p>
          </div>
          <div className="col-12 col-md-auto text-center">
            <button onClick={() => setViewMode('daily')} className="btn btn-outline-secondary d-flex align-items-center gap-2 rounded-pill fw-bold btn-sm px-3 shadow-hover-sm mx-auto">
              <ChevronLeft size={16} /> Quay lại
            </button>
          </div>
        </div>

        <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div className="card-header bg-light p-2 border-0">
            <ul className="nav nav-pills nav-fill bg-light p-0">
              <li className="nav-item">
                <button onClick={() => setViewMode('daily')} className="nav-link rounded-pill fw-bold small transition-all py-2 text-secondary">Nguyên Liệu</button>
              </li>
              <li className="nav-item">
                <button className="nav-link rounded-pill fw-bold small transition-all py-2 active shadow-sm">🍵 Trà & Bánh</button>
              </li>
            </ul>
          </div>
          <div className="card-body p-0">
            <TeaAndCakeAuditTab selectedDate={selectedDate} />
          </div>
        </div>
      </div>
    );
  }

  const filledCount = Object.keys(storeStocks).concat(Object.keys(counterStocks))
    .filter((v, i, a) => a.indexOf(v) === i)
    .filter(k => storeStocks[k] !== '' || counterStocks[k] !== '').length;

  return (
    <div className="container-fluid py-3 py-md-4">
      <div className="row align-items-center mb-4 g-3">
        <div className="col-12 col-xl-auto me-xl-auto text-center text-xl-start">
          <h1 className="h3 fw-black text-dark mb-1">KIỂM KÊ KHO</h1>
          <p className="text-secondary small mb-0">Đối chiếu tồn lý thuyết and thực tế hàng ngày.</p>
        </div>
        
        <div className="col-12 col-xl-auto">
          <div className="d-flex align-items-center justify-content-center gap-2">
            <div className="input-group input-group-sm border rounded-pill overflow-hidden bg-white shadow-sm" style={{ width: 'fit-content' }}>
              <button onClick={() => setSelectedDate(format(subDays(parseDate(selectedDate), 1), 'yyyy-MM-dd'))} className="btn btn-light border-0 px-3 transition-all"><ChevronLeft size={18} /></button>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="form-control border-0 text-center fw-black bg-transparent py-2" style={{ width: '160px', fontSize: '15px' }} />
              <button onClick={() => {
                  const next = format(new Date(new Date(selectedDate).getTime() + 86400000), 'yyyy-MM-dd');
                  if (next <= todayStr) setSelectedDate(next);
                }} disabled={selectedDate >= todayStr} className="btn btn-light border-0 px-3 transition-all"><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-auto">
          <div className="row g-2 text-center justify-content-center">
            <div className="col-auto"><button onClick={() => setViewMode('teaCake')} className="btn btn-outline-success border-2 fw-bold small d-flex align-items-center justify-content-center gap-2 py-2 shadow-sm rounded-pill transition-all"><CupSoda size={16} /> <span className="d-none d-sm-inline">Trà & Bánh</span><span className="d-inline d-sm-none">T & B</span></button></div>
            {!isStaff && (
              <>
                <div className="col-auto"><button onClick={() => setViewMode('opening')} className="btn btn-outline-warning border-2 fw-bold small d-flex align-items-center justify-content-center gap-2 py-2 shadow-sm rounded-pill transition-all text-dark"><PackageOpen size={16} /> Tồn Đầu</button></div>
                <div className="col-auto"><button onClick={() => setViewMode('history')} className="btn btn-outline-secondary border-2 fw-bold small d-flex align-items-center justify-content-center gap-2 py-2 shadow-sm rounded-pill transition-all"><History size={16} /> Lịch Sử</button></div>
              </>
            )}
            <div className="col-auto"><button onClick={handleSaveAudit} disabled={saving || filledCount === 0 || !canEdit} className="btn btn-primary fw-bold d-flex align-items-center justify-content-center gap-2 py-2 shadow-sm rounded-pill transition-all border-2 border-primary px-4"><Save size={16} /> {saving ? '...' : `Lưu (${filledCount})`}</button></div>
          </div>
        </div>
      </div>

      {!canEdit && (
        <div className="alert alert-info border-0 shadow-sm rounded-4 mb-4 d-flex align-items-center gap-3 py-3 border-start border-5 border-info animate__animated animate__fadeIn">
          <AlertCircle size={28} className="text-info flex-shrink-0" />
          <div className="small">
            <h6 className="fw-black text-uppercase tracking-tighter mb-1">Chế độ Xem lại</h6>
            <p className="mb-0 text-secondary">Bạn đang xem dữ liệu của ngày cũ ({format(parseISO(selectedDate), 'dd/MM/yyyy')}). Nhân viên không có quyền chỉnh sửa ngày cũ.</p>
          </div>
        </div>
      )}

      {canEdit && !hasMonthlyOpening && (
        <div className="alert alert-warning border-0 shadow-sm rounded-4 mb-4 d-flex align-items-center gap-3 py-3 border-start border-5 border-warning animate__animated animate__fadeIn">
          <AlertCircle size={28} className="text-warning flex-shrink-0" />
          <div className="small">
            <h6 className="fw-black text-uppercase tracking-tighter mb-1">Chưa có tồn đầu tháng!</h6>
            <p className="mb-0 text-secondary">Hệ thống đang giả định tồn lý thuyết đầu tháng là 0. Điều này sẽ ảnh hưởng đến độ chính xác của chênh lệch.</p>
            <button onClick={() => setViewMode('opening')} className="btn btn-warning btn-sm mt-2 rounded-pill fw-black px-3 shadow-sm">THIẾT LẬP NGAY</button>
          </div>
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-12 col-md-8">
          <div className="input-group shadow-sm rounded-pill overflow-hidden border">
            <span className="input-group-text bg-white border-0 ps-4 text-muted"><Search size={18} /></span>
            <input type="text" placeholder="Tìm tên nguyên liệu..." value={search} onChange={e => setSearch(e.target.value)} className="form-control border-0 py-2 ms-0" style={{ fontSize: '15px' }} />
          </div>
        </div>
        <div className="col-12 col-md-4">
          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="form-select rounded-pill border shadow-sm ps-4 py-2" style={{ fontSize: '15px' }}>
            <option value="">Tất cả danh mục</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden border-top border-5 border-primary">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
            <thead className="table-light border-0">
              <tr>
                <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Tên NL</th>
                <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Tồn Đầu</th>
                <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-success text-end">Nhập</th>
                <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-danger text-end">Xuất</th>
                <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end bg-light bg-opacity-50">Lý Thuyết</th>
                <th className="px-2 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-center" style={{ width: '130px' }}>Tại Kho</th>
                <th className="px-2 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-center" style={{ width: '130px' }}>Tại Quầy</th>
                <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-primary text-end bg-primary-subtle">Thực Tế</th>
                <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Chênh Lệch</th>
                <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Ghi Chú</th>
              </tr>
            </thead>
            <tbody className="border-top-0 bg-white">
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-5 text-center text-muted italic">Đang tải dữ liệu kiểm kê...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-5 text-center text-muted italic">Không tìm thấy nguyên liệu nào khớp với tìm kiếm.</td></tr>
            ) : (
              filtered.map(ing => {
                const opening = openingStockMap[ing.id] ?? 0;
                const tx = dailyTx[ing.id] || { in: 0, out: 0 };
                const theoretical = opening + tx.in - tx.out;
                const savedAudit = existingAuditIds[ing.id] ? dayAudits.find((a: any) => a.id === existingAuditIds[ing.id]) : null;
                const savedTheoretical = savedAudit ? savedAudit.theoretical_stock : theoretical;
                const isOutOfSync = existingAuditIds[ing.id] && Math.abs(theoretical - (savedTheoretical ?? 0)) > 0.001;

                const storeVal = storeStocks[ing.id] || '';
                const counterVal = counterStocks[ing.id] || '';
                const storeIn = parseFloat(storeVal) || 0;
                const sUnit = storeUnits[ing.id] || 'base';
                let sFactor = 1;
                if (sUnit !== 'base') {
                  const unit = allUnits.find(u => u.ingredient_id === ing.id && u.unit_name === sUnit);
                  if (unit) sFactor = unit.conversion_factor;
                }
                const store = storeIn * sFactor;
                const counterIn = parseFloat(counterVal) || 0;
                const cUnit = counterUnits[ing.id] || 'base';
                let cFactor = 1;
                if (cUnit !== 'base') {
                  const unit = allUnits.find(u => u.ingredient_id === ing.id && u.unit_name === cUnit);
                  if (unit) cFactor = unit.conversion_factor;
                }
                const counter = counterIn * cFactor;
                const hasInput = storeVal !== '' || counterVal !== '';
                const actualValue = hasInput ? store + counter : null;
                const varianceValue = actualValue !== null ? actualValue - theoretical : null;

                return (
                  <tr key={ing.id} className={`${isOutOfSync ? 'table-warning' : ''} transition-all`}>
                    <td className="px-4 py-3 fw-bold text-dark">
                      <div className="d-flex flex-column">
                        <span className="text-uppercase small fw-black tracking-tight">{ing.name}</span>
                        <span className="text-secondary opacity-50 fst-italic" style={{ fontSize: '10px' }}>({ing.unit})</span>
                      </div>
                      {isOutOfSync && (
                        <div className="badge bg-warning text-dark border border-warning-emphasis mt-1 d-flex align-items-center gap-1 shadow-sm px-1 py-1" style={{ fontSize: '8px' }} title="Dữ liệu giao dịch đã thay đổi sau khi lưu kiểm kê.">
                          <AlertCircle size={10} /> GD THAY ĐỔI
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end text-muted small">{opening}</td>
                    <td className="px-4 py-3 text-end text-success fw-bold">{tx.in > 0 ? `+${tx.in}` : '-'}</td>
                    <td className="px-4 py-3 text-end text-danger fw-bold">{tx.out > 0 ? `-${tx.out}` : '-'}</td>
                    <td className={`px-4 py-3 text-end fw-black bg-light bg-opacity-50 ${isOutOfSync ? 'text-warning-emphasis' : 'text-dark'}`}>{theoretical}
                      {isOutOfSync && <div className="text-muted text-decoration-line-through small fw-normal opacity-50">{(savedTheoretical ?? 0)}</div>}
                    </td>
                    <td className="px-2 py-3">
                      <div className="input-group input-group-sm rounded shadow-sm border overflow-hidden">
                        <input type="number" step="0.000001" value={storeVal} disabled={!canEdit} onChange={e => setStoreStocks(prev => ({ ...prev, [ing.id]: e.target.value }))} className="form-control text-end fw-bold border-0 bg-white" placeholder="0" />
                        <select value={storeUnits[ing.id] || 'base'} onChange={e => setStoreUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="form-select bg-light border-0 text-muted small px-1" style={{ flex: '0 0 60px', fontSize: '10px' }}>
                          <option value="base">{ing.unit}</option>
                          {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (<option key={u.id} value={u.unit_name}>{u.unit_name}</option>))}
                        </select>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="input-group input-group-sm rounded shadow-sm border overflow-hidden">
                        <input type="number" step="0.000001" value={counterVal} disabled={!canEdit} onChange={e => setCounterStocks(prev => ({ ...prev, [ing.id]: e.target.value }))} className="form-control text-end fw-bold border-0 bg-white" placeholder="0" />
                        <select value={counterUnits[ing.id] || 'base'} onChange={e => setCounterUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="form-select bg-light border-0 text-muted small px-1" style={{ flex: '0 0 60px', fontSize: '10px' }}>
                          <option value="base">{ing.unit}</option>
                          {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (<option key={u.id} value={u.unit_name}>{u.unit_name}</option>))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end fw-black bg-primary-subtle text-primary fs-5">{actualValue !== null ? actualValue : '-'}
                      {(storeUnits[ing.id] && storeUnits[ing.id] !== 'base') || (counterUnits[ing.id] && counterUnits[ing.id] !== 'base') ? (<div className="text-secondary fst-italic fw-normal opacity-50" style={{ fontSize: '9px' }}>(đã quy đổi)</div>) : null}
                    </td>
                    <td className={`px-4 py-3 text-end fw-black ${varianceValue !== null && varianceValue < -0.001 ? 'text-danger' : varianceValue !== null && varianceValue > 0.001 ? 'text-primary' : 'text-success'}`}>{varianceValue !== null ? `${varianceValue > 0 ? '+' : ''}${varianceValue}` : '-'}</td>
                    <td className="px-4 py-3"><input type="text" placeholder="Ghi chú..." value={auditNotes[ing.id] || ''} disabled={!canEdit} onChange={e => setAuditNotes(prev => ({ ...prev, [ing.id]: e.target.value }))} className="form-control form-control-sm border shadow-sm rounded bg-white" style={{ fontSize: '11px' }} /></td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}