import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Save, History, PackageOpen, ChevronLeft, ChevronRight, AlertCircle, CupSoda, Upload, Download, ClipboardCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
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
  [key: string]: { in: number; out: number };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const toYearMonth = (dateStr: string) => dateStr.slice(0, 7);
const parseDate = (d: string) => parseISO(d);

export default function Audit() {
  const { user, role } = useAuth();
  const isStaff = role === 'staff';
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const isToday = selectedDate === todayStr;
  const canEdit = !isStaff || isToday;
  const yearMonth = toYearMonth(selectedDate);
  const isFirstOfMonth = selectedDate.slice(8, 10) === '01';

  const [viewMode, setViewMode] = useState<'daily' | 'opening' | 'history' | 'teaCake'>('daily');

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [openingStockMap, setOpeningStockMap] = useState<Record<string, number>>({});
  const [dailyTx, setDailyTx] = useState<DailyTxSummary>({});
  const [accumulatedTx, setAccumulatedTx] = useState<DailyTxSummary>({});

  const [storeStocks, setStoreStocks] = useState<Record<string, string>>({});
  const [counterStocks, setCounterStocks] = useState<Record<string, string>>({});
  const [storeUnits, setStoreUnits] = useState<Record<string, string>>({});
  const [counterUnits, setCounterUnits] = useState<Record<string, string>>({});

  const [auditNotes, setAuditNotes] = useState<Record<string, string>>({});
  const [existingAuditIds, setExistingAuditIds] = useState<Record<string, string>>({});
  const existingAuditIdsRef = React.useRef<Record<string, string>>({});

  const [monthlyOpeningInputs, setMonthlyOpeningInputs] = useState<Record<string, string>>({});
  const [monthlyOpeningUnits, setMonthlyOpeningUnits] = useState<Record<string, string>>({});
  const [monthlyOpeningNotes, setMonthlyOpeningNotes] = useState<Record<string, string>>({});
  const [existingMonthlyIds, setExistingMonthlyIds] = useState<Record<string, string>>({});
  const [hasMonthlyOpening, setHasMonthlyOpening] = useState(false);
  const [allUnits, setAllUnits] = useState<any[]>([]);

  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [dayAudits, setDayAudits] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const fetchDailyData = async () => {
    setLoading(true);
    setStoreStocks({});
    setCounterStocks({});
    setStoreUnits({});
    setCounterUnits({});
    setAuditNotes({});
    setExistingAuditIds({});
    existingAuditIdsRef.current = {};

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

    const { data: dayAuditsData } = await supabase
      .from('stock_audits')
      .select('id, ingredient_id, stock_in_store, stock_in_counter, actual_stock, opening_stock, theoretical_stock, notes')
      .eq('audit_date', selectedDate);

    const storeMap: Record<string, string> = {};
    const counterMap: Record<string, string> = {};
    const sUnitMap: Record<string, string> = {};
    const cUnitMap: Record<string, string> = {};
    const noteMap: Record<string, string> = {};
    const auditIdMap: Record<string, string> = {};

    if (dayAuditsData) {
      setDayAudits(dayAuditsData);
      dayAuditsData.forEach((a: any) => {
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
    existingAuditIdsRef.current = auditIdMap;

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

    const { data: txData } = await supabase
      .from('stock_transactions')
      .select('ingredient_id, type, quantity, transaction_date')
      .gte('transaction_date', startOfThisMonth)
      .lte('transaction_date', selectedDate);

    const daySummary: DailyTxSummary = {};
    const accSummary: DailyTxSummary = {};
    if (txData) {
      txData.forEach((tx: any) => {
        if (!tx.ingredient_id) return;
        const priorAuditForIng = (priorAudits || []).find(a => a.ingredient_id === tx.ingredient_id);
        const lastDate = priorAuditForIng ? priorAuditForIng.audit_date : null;
        const qty = Math.abs(Number(tx.quantity));
        const isCurrentDay = tx.transaction_date === selectedDate;

        if (isCurrentDay) {
          if (!daySummary[tx.ingredient_id]) daySummary[tx.ingredient_id] = { in: 0, out: 0 };
          if (['IN', 'IN_TRANSFER'].includes(tx.type)) daySummary[tx.ingredient_id].in += qty;
          else if (['OUT', 'WASTE', 'SALES_USAGE'].includes(tx.type)) daySummary[tx.ingredient_id].out += qty;
        }

        let shouldAcc = false;
        if (isCurrentDay) shouldAcc = true;
        else if (lastDate && tx.transaction_date > lastDate) shouldAcc = true;
        else if (!lastDate && tx.transaction_date < selectedDate) shouldAcc = true;

        if (shouldAcc) {
          if (!accSummary[tx.ingredient_id]) accSummary[tx.ingredient_id] = { in: 0, out: 0 };
          if (['IN', 'IN_TRANSFER'].includes(tx.type)) accSummary[tx.ingredient_id].in += qty;
          else if (['OUT', 'WASTE', 'SALES_USAGE'].includes(tx.type)) accSummary[tx.ingredient_id].out += qty;
        }
      });
    }
    setDailyTx(daySummary);
    setAccumulatedTx(accSummary);

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
      const cats = Array.from(new Set(ingData.map((i: any) => i.ingredient_categories?.name).filter(Boolean))) as string[];
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

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        const newStoreStocks = { ...storeStocks };
        const newCounterStocks = { ...counterStocks };
        let matchCount = 0;
        data.forEach((row: any) => {
          const id = row['Mã nguyên liệu'] || row['Ma nguyen lieu'] || row['ID'];
          const storeVal = row['Kho(số tồn kho)'] || row['Kho'] || row['Store'];
          const counterVal = row['Cửa hàng(số tồn bên ngoài quầy)'] || row['Cửa hàng'] || row['Counter'];
          if (id) {
            const ingId = id.toString().trim();
            if (ingredients.some(ing => ing.id === ingId)) {
              if (storeVal !== undefined) newStoreStocks[ingId] = storeVal.toString();
              if (counterVal !== undefined) newCounterStocks[ingId] = counterVal.toString();
              matchCount++;
            }
          }
        });
        setStoreStocks(newStoreStocks);
        setCounterStocks(newCounterStocks);
        alert(`Đã nhập dữ liệu cho ${matchCount} nguyên liệu!`);
      } catch (err) { alert('Lỗi Excel!'); }
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const templateData = ingredients.map(ing => ({
      'Mã nguyên liệu': ing.id,
      'Tên nguyên liệu': ing.name,
      'Kho(số tồn kho)': '',
      'Cửa hàng(số tồn bên ngoài quầy)': ''
    }));
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kiểm kê");
    XLSX.writeFile(wb, `Template_Kiem_Ke.xlsx`);
  };

  const handleSaveAudit = async () => {
    const filledKeys = Object.keys(storeStocks).concat(Object.keys(counterStocks))
      .filter((v, i, a) => a.indexOf(v) === i)
      .filter(k => storeStocks[k] !== '' || counterStocks[k] !== '');
    if (filledKeys.length === 0) { alert('Vui lòng nhập tồn!'); return; }
    setSaving(true);
    try {
      const hugeVariances: string[] = [];
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
        const acc = accumulatedTx[id] || { in: 0, out: 0 };
        const theoretical = opening + acc.in - acc.out;
        if (theoretical > 0 && Math.abs(actual - theoretical) > (theoretical * 0.2)) {
          hugeVariances.push(ingredients.find(i => i.id === id)?.name || id);
        }
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
        if (existingId) toUpdate.push({ ...base, id: existingId });
        else toInsert.push(base);
      });
      if (hugeVariances.length > 0) {
        if (!window.confirm(`Phát hiện ${hugeVariances.length} chênh lệch > 20%. Tiếp tục?`)) { setSaving(false); return; }
      }
      if (toUpdate.length > 0) await supabase.from('stock_audits').upsert(toUpdate);
      if (toInsert.length > 0) await supabase.from('stock_audits').insert(toInsert);
      alert('Đã lưu!');
      fetchDailyData();
    } catch (err) { alert('Lỗi khi lưu!'); }
    setSaving(false);
  };

  const handleSaveMonthlyOpening = async () => {
    const filledKeys = Object.keys(monthlyOpeningInputs).filter(k => monthlyOpeningInputs[k] !== '');
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
      await supabase.from('monthly_opening_stock').upsert(upserts);
      alert(`Đã lưu tồn đầu!`);
      fetchMonthlyOpening();
    } catch (err) { alert('Lỗi!'); }
    setSaving(false);
  };

  const filtered = ingredients.filter(ing => {
    const matchSearch = ing.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory ? ing.ingredient_categories?.name === selectedCategory : true;
    return matchSearch && matchCat;
  });

  if (viewMode === 'opening') {
    return (
      <div className="container-fluid py-4 pb-10">
        <div className="row g-3 align-items-center mb-6">
          <div className="col-12 col-md-auto me-auto">
             <div className="flex items-center gap-4">
                <div className="bg-teal-600 p-3 rounded-2xl shadow-lg shadow-teal-100 ring-4 ring-teal-50">
                  <PackageOpen className="text-white" size={28} />
                </div>
                <div>
                  <h1 className="h3 fw-black text-gray-800 mb-0 tracking-tight text-uppercase">TỒN ĐẦU THÁNG</h1>
                  <p className="text-gray-400 small mb-0 font-bold uppercase tracking-widest mt-1">Thiết lập số dư đầu kỳ: <span className="text-teal-600">{yearMonth}</span></p>
                </div>
             </div>
          </div>
          <div className="col-12 col-md-auto">
            <div className="flex gap-2">
              <button onClick={() => setViewMode('daily')} className="btn btn-teal-ghost rounded-xl transition-all">← Quay lại</button>
              <button onClick={handleSaveMonthlyOpening} disabled={saving} className="btn bg-teal-600 text-white rounded-xl font-black px-4 shadow-lg shadow-teal-100 border-0 flex items-center gap-2">
                <Save size={16} /> {saving ? '...' : 'LƯU TỒN ĐẦU'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-4 p-4 mb-6 shadow-sm border border-gray-100">
           <div className="row g-3">
              <div className="col-md-8">
                 <div className="relative">
                    <input type="text" placeholder="Tìm nguyên liệu..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-gray-50 border-0 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20" />
                    <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
                 </div>
              </div>
              <div className="col-md-4">
                 <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="form-select border-0 bg-gray-50 h-[46px] rounded-2xl text-sm font-bold px-4 outline-none focus:ring-2 focus:ring-teal-500/20">
                    <option value="">Tất cả danh mục</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
              </div>
           </div>
        </div>

        <div className="bg-white rounded-4 shadow-sm border border-gray-100 overflow-hidden premium-shadow">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Nguyên Liệu</th>
                  <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Số Tồn Đầu Kỳ</th>
                  <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Ghi Chú</th>
                </tr>
              </thead>
              <tbody className="border-0">
                {loading ? (<tr><td colSpan={3} className="py-20 text-center font-bold text-gray-400">Đang tải...</td></tr>) : 
                 filtered.map(ing => (
                  <tr key={ing.id}>
                    <td className="px-6 py-4 border-gray-50">
                       <span className="fw-black text-gray-800 tracking-tight text-uppercase small">{ing.name}</span>
                       <div className="text-[10px] text-gray-400 font-bold uppercase">{ing.unit}</div>
                    </td>
                    <td className="px-4 py-3 border-gray-50">
                      <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl px-2 mx-auto" style={{maxWidth: '220px'}}>
                        <input type="number" value={monthlyOpeningInputs[ing.id] || ''} onChange={e => setMonthlyOpeningInputs(prev => ({ ...prev, [ing.id]: e.target.value }))} className="w-full text-end border-0 font-black text-sm bg-transparent h-9 outline-none" placeholder="0" />
                        <select value={monthlyOpeningUnits[ing.id] || 'base'} onChange={e => setMonthlyOpeningUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="border-0 bg-transparent text-[9px] font-black text-gray-400 uppercase w-12 outline-none">
                           <option value="base">{ing.unit}</option>
                           {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (<option key={u.id} value={u.unit_name}>{u.unit_name}</option>))}
                        </select>
                      </div>
                    </td>
                    <td className="px-6 py-4 border-gray-50">
                      <input type="text" placeholder="..." value={monthlyOpeningNotes[ing.id] || ''} onChange={e => setMonthlyOpeningNotes(prev => ({ ...prev, [ing.id]: e.target.value }))} className="w-full border-b border-gray-100 bg-transparent text-[11px] font-bold py-1 outline-none" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'history') {
    return (
      <div className="container-fluid py-4 pb-10">
        <div className="row g-3 align-items-center mb-6">
          <div className="col-12 col-md-auto me-auto text-center text-md-start">
             <div className="flex items-center gap-4">
                <div className="bg-teal-600 p-3 rounded-2xl shadow-lg shadow-teal-100 ring-4 ring-teal-50">
                  <History className="text-white" size={28} />
                </div>
                <div>
                  <h1 className="h3 fw-black text-gray-800 mb-0 tracking-tight text-uppercase">LỊCH SỬ KIỂM KÊ</h1>
                  <p className="text-gray-400 small mb-0 font-bold uppercase tracking-widest mt-1">Xem lại dữ liệu đã lưu</p>
                </div>
             </div>
          </div>
          <div className="col-12 col-md-auto">
            <button onClick={() => setViewMode('daily')} className="btn btn-teal-ghost rounded-xl transition-all">← Quay lại</button>
          </div>
        </div>

        <div className="bg-white rounded-4 shadow-sm border border-gray-100 overflow-hidden premium-shadow">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Ngày KK</th>
                  <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Nguyên Liệu</th>
                  <th className="px-4 py-4 text-end text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Lý Thuyết</th>
                  <th className="px-4 py-4 text-end text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Thực Tế</th>
                  <th className="px-4 py-4 text-end text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Chênh Lệch</th>
                  <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Ghi Chú</th>
                </tr>
              </thead>
              <tbody className="border-0">
                {loading ? (<tr><td colSpan={6} className="py-20 text-center font-bold text-gray-400">Đang tải...</td></tr>) : 
                 auditHistory.map(a => {
                    const variance = (a.actual_stock ?? 0) - (a.theoretical_stock ?? 0);
                    return (
                      <tr key={a.id}>
                        <td className="px-6 py-4 border-gray-50">
                           <span className="text-sm font-black text-teal-600">{a.audit_date ? format(parseISO(a.audit_date), 'dd/MM/yyyy') : '-'}</span>
                        </td>
                        <td className="px-6 py-4 border-gray-50">
                           <span className="fw-black text-gray-800 text-uppercase small">{a.ingredients?.name}</span>
                        </td>
                        <td className="px-4 py-4 text-end border-gray-50 text-gray-400 font-bold">{a.theoretical_stock?.toLocaleString()}</td>
                        <td className="px-4 py-4 text-end border-gray-50 text-gray-800 font-black">{a.actual_stock?.toLocaleString()}</td>
                        <td className={`px-4 py-4 text-end border-gray-50 font-black ${Math.abs(variance) < 0.001 ? 'text-teal-500' : variance < 0 ? 'text-red-500' : 'text-teal-500'}`}>
                           {variance > 0.001 ? '+' : ''}{variance.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 border-gray-50 text-gray-400 small italic">{a.notes || '-'}</td>
                      </tr>
                    );
                 })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'teaCake') {
    return (
      <div className="container-fluid py-4 pb-10">
        <div className="row g-3 align-items-center mb-6">
          <div className="col-12 col-md-auto me-auto">
             <div className="flex items-center gap-4">
                <div className="bg-teal-600 p-3 rounded-2xl shadow-lg shadow-teal-100 ring-4 ring-teal-50">
                  <CupSoda className="text-white" size={28} />
                </div>
                <div>
                  <h1 className="h3 fw-black text-gray-800 mb-0 tracking-tight text-uppercase">KIỂM KÊ TRÀ & BÁNH</h1>
                  <p className="text-gray-400 small mb-0 font-bold uppercase tracking-widest mt-1">Đối soát mặt hàng pha chế & bánh</p>
                </div>
             </div>
          </div>
          <div className="col-12 col-md-auto">
            <button onClick={() => setViewMode('daily')} className="btn btn-teal-ghost rounded-xl transition-all flex items-center gap-2">
              <ChevronLeft size={18} /> <span className="font-bold">Quay lại Kiểm Kho</span>
            </button>
          </div>
        </div>
        <div className="bg-white rounded-4 shadow-sm border border-gray-100 overflow-hidden premium-shadow">
          <TeaAndCakeAuditTab selectedDate={selectedDate} />
        </div>
      </div>
    );
  }

  const filledCount = Object.keys(storeStocks).concat(Object.keys(counterStocks))
    .filter((v, i, a) => a.indexOf(v) === i)
    .filter(k => storeStocks[k] !== '' || counterStocks[k] !== '').length;

  return (
    <div className="container-fluid py-4 pb-10 animate__animated animate__fadeIn">
      {/* HEADER & DATE SELECTOR */}
      <div className="row align-items-center mb-6 g-4">
        <div className="col-12 col-xl-auto me-xl-auto">
          <div className="flex items-center gap-4">
            <div className="bg-teal-600 p-3 rounded-2xl shadow-lg shadow-teal-100 ring-4 ring-teal-50">
              <ClipboardCheck className="text-white" size={28} />
            </div>
            <div>
              <h1 className="h3 fw-black text-gray-800 mb-0 tracking-tight text-uppercase">KIỂM KÊ KHO</h1>
              <p className="text-gray-400 small mb-0 font-bold uppercase tracking-widest mt-1">
                Đối soát tồn <span className="text-teal-600">Lý thuyết vs Thực tế</span> hàng ngày
              </p>
            </div>
          </div>
        </div>
        
        <div className="col-12 col-xl-auto">
          <div className="flex flex-wrap items-center justify-center gap-3">
             <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
               <button onClick={() => setViewMode('teaCake')} className="btn btn-teal-ghost rounded-xl transition-all"><CupSoda size={18} className="text-teal-600" /> <span className="d-none d-sm-inline ms-1 font-bold">Trà & Bánh</span></button>
               {!isStaff && (
                 <>
                   <button onClick={() => setViewMode('opening')} className="btn btn-teal-ghost rounded-xl"><PackageOpen size={18} className="text-orange-500" /> <span className="d-none d-sm-inline ms-1 font-bold">Tồn Đầu</span></button>
                   <button onClick={() => setViewMode('history')} className="btn btn-teal-ghost rounded-xl"><History size={18} className="text-gray-500" /> <span className="d-none d-sm-inline ms-1 font-bold">Lịch Sử</span></button>
                 </>
               )}
             </div>

             <div className="flex items-center gap-2">
                <button onClick={downloadTemplate} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-100 text-gray-400 rounded-xl hover:text-teal-600 hover:border-teal-200 transition-all premium-shadow" title="Mẫu Excel"><Download size={18} /></button>
                <label className="w-10 h-10 flex items-center justify-center bg-white border border-gray-100 text-gray-400 rounded-xl hover:text-teal-600 hover:border-teal-200 transition-all premium-shadow cursor-pointer mb-0">
                  <Upload size={18} />
                  <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} className="d-none" />
                </label>
             </div>

             <div className="flex items-center bg-white rounded-2xl shadow-sm border border-teal-600/20 p-1 border-s-4">
                <button onClick={() => setSelectedDate(format(subDays(parseDate(selectedDate), 1), 'yyyy-MM-dd'))} className="p-2 text-teal-600 hover:bg-teal-50 rounded-xl transition-all"><ChevronLeft size={20} /></button>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border-0 bg-transparent text-center font-black text-gray-800 outline-none px-2 text-sm" />
                <button onClick={() => {
                    const next = format(new Date(new Date(selectedDate).getTime() + 86400000), 'yyyy-MM-dd');
                    if (next <= todayStr) setSelectedDate(next);
                  }} disabled={selectedDate >= todayStr} className="p-2 text-teal-600 hover:bg-teal-50 rounded-xl disabled:opacity-30 transition-all"><ChevronRight size={20} /></button>
             </div>

             <button onClick={handleSaveAudit} disabled={saving || filledCount === 0 || !canEdit} className="btn bg-teal-600 text-white hover:bg-teal-700 px-6 py-3 rounded-2xl font-black shadow-lg shadow-teal-100 border-0 flex items-center gap-2 disabled:bg-gray-200 disabled:shadow-none">
                <Save size={18} /> {saving ? '...' : `Lưu (${filledCount})`}
             </button>
          </div>
        </div>
      </div>

      {!canEdit && (
        <div className="bg-teal-50/50 border border-teal-100 rounded-2xl p-4 mb-6 flex items-center gap-4">
          <div className="bg-teal-600 text-white p-2 rounded-xl"><AlertCircle size={24} /></div>
          <div>
            <h6 className="font-black text-teal-900 uppercase tracking-tighter mb-0">CHẾ ĐỘ XEM LẠI</h6>
            <p className="mb-0 text-teal-700/70 text-[11px] font-bold">Bạn đang xem lịch sử ngày {format(parseISO(selectedDate), 'dd/MM/yyyy')}. Nhân viên không thể sửa ngày cũ.</p>
          </div>
        </div>
      )}

      {canEdit && !hasMonthlyOpening && (
        <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-amber-500 text-white p-2 rounded-xl"><AlertCircle size={24} /></div>
            <div>
              <h6 className="font-black text-amber-900 uppercase tracking-tighter mb-0">CHƯA CÓ TỒN ĐẦU THÁNG!</h6>
              <p className="mb-0 text-amber-700/70 text-[11px] font-bold">Tồn lý thuyết đang giả định bằng 0.</p>
            </div>
          </div>
          <button onClick={() => setViewMode('opening')} className="px-4 py-2 bg-amber-500 text-white rounded-xl font-black text-[10px] tracking-widest uppercase">Thiết lập ngay</button>
        </div>
      )}

      <div className="bg-white rounded-4 p-4 mb-6 shadow-sm border border-gray-100">
        <div className="row g-3 align-items-center">
          <div className="col-12 col-md-8">
             <div className="relative">
                <input type="text" placeholder="Tìm tên nguyên liệu..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-gray-50 border-0 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-teal-500/20 focus:bg-white transition-all outline-none" />
                <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
             </div>
          </div>
          <div className="col-12 col-md-4">
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="form-select border-0 bg-gray-50 h-[46px] rounded-2xl text-sm font-bold px-4 focus:ring-2 focus:ring-teal-500/20">
              <option value="">Phân loại nguyên liệu</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-4 shadow-sm border border-gray-100 overflow-hidden premium-shadow">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Nguyên Liệu</th>
                <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Số Sách</th>
                <th className="px-4 py-4 text-center text-teal-600 text-uppercase text-[10px] font-black tracking-widest border-0">T. Nhập</th>
                <th className="px-4 py-4 text-center text-orange-600 text-uppercase text-[10px] font-black tracking-widest border-0">T. Xuất</th>
                <th className="px-2 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Tại Kho</th>
                <th className="px-2 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Tại Quầy</th>
                <th className="px-4 py-4 text-center text-teal-600 text-uppercase text-[10px] font-black tracking-widest border-0">Thực Tế</th>
                <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Chênh Lệch</th>
                <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Ghi Chú</th>
              </tr>
            </thead>
            <tbody className="border-0">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-20 text-center font-bold text-gray-400">Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-20 text-center text-gray-400 font-bold">Không có dữ liệu</td></tr>
              ) : (
                filtered.map((ing) => {
                  const opening = openingStockMap[ing.id] ?? 0;
                  const acc = accumulatedTx[ing.id] || { in: 0, out: 0 };
                  const theoretical = opening + acc.in - acc.out;
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
                  const isHugeVariance = hasInput && theoretical > 0 && Math.abs(varianceValue ?? 0) > (theoretical * 0.2);

                  return (
                    <tr key={ing.id} className={`${hasInput ? 'bg-teal-50/20' : ''} ${isHugeVariance ? 'bg-red-50/50' : ''}`}>
                      <td className="px-6 py-4 border-gray-50">
                        <div className="flex flex-col">
                           <div className="flex items-center gap-2">
                             <span className="fw-black text-gray-800 tracking-tight">{ing.name}</span>
                             {isHugeVariance && <span className="text-[9px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-lg">SAI LỆCH CAO</span>}
                           </div>
                           <span className="text-[10px] text-gray-400 font-bold uppercase">{ing.unit}</span>
                           {isOutOfSync && <span className="text-[8px] font-black text-amber-600 uppercase mt-1">⚠️ GD THAY ĐỔI</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50">
                        <span className={`text-sm font-black ${isOutOfSync ? 'text-amber-500' : 'text-gray-400'}`}>{theoretical.toLocaleString()}</span>
                        {isOutOfSync && <div className="text-[9px] text-gray-300 text-decoration-line-through">{(savedTheoretical ?? 0).toLocaleString()}</div>}
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50 bg-teal-50/10">
                         <span className="text-sm font-black text-teal-600">{(dailyTx[ing.id]?.in || 0).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50 bg-orange-50/10">
                         <span className="text-sm font-black text-orange-600">{(dailyTx[ing.id]?.out || 0).toLocaleString()}</span>
                      </td>
                      <td className="px-2 py-4 border-gray-50">
                        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl px-2">
                           <input type="number" step="0.000001" value={storeVal} disabled={!canEdit} onChange={e => setStoreStocks(prev => ({ ...prev, [ing.id]: e.target.value }))} className="w-full text-end border-0 font-black text-sm bg-transparent h-9 outline-none" placeholder="0" />
                           <select value={storeUnits[ing.id] || 'base'} onChange={e => setStoreUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="border-0 bg-transparent text-[9px] font-black text-gray-400 uppercase w-12 outline-none">
                             <option value="base">{ing.unit}</option>
                             {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (<option key={u.id} value={u.unit_name}>{u.unit_name}</option>))}
                           </select>
                        </div>
                      </td>
                      <td className="px-2 py-4 border-gray-50">
                        <div className="flex items-center gap-1 bg-teal-50/50 border border-teal-100 rounded-xl px-2">
                           <input type="number" step="0.000001" value={counterVal} disabled={!canEdit} onChange={e => setCounterStocks(prev => ({ ...prev, [ing.id]: e.target.value }))} className="w-full text-end border-0 font-black text-sm bg-transparent h-9 outline-none" placeholder="0" />
                           <select value={counterUnits[ing.id] || 'base'} onChange={e => setCounterUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="border-0 bg-transparent text-[9px] font-black text-gray-400 uppercase w-12 outline-none">
                             <option value="base">{ing.unit}</option>
                             {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (<option key={u.id} value={u.unit_name}>{u.unit_name}</option>))}
                           </select>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50 bg-teal-50/30">
                         <span className={`text-base font-black ${actualValue !== null ? 'text-teal-600' : 'text-gray-200'}`}>{actualValue !== null ? actualValue.toLocaleString() : '--'}</span>
                      </td>
                      <td className="px-4 py-4 text-end border-gray-50">
                        {actualValue !== null ? (
                           <span className={`text-sm font-black ${Math.abs(varianceValue ?? 0) < 0.001 ? 'text-teal-500' : (varianceValue ?? 0) < 0 ? 'text-red-500' : 'text-teal-500'}`}>
                              {varianceValue && varianceValue > 0.001 ? '+' : ''}{varianceValue?.toLocaleString()}
                           </span>
                        ) : '--'}
                      </td>
                      <td className="px-6 py-4 border-gray-50">
                         <input type="text" placeholder="..." value={auditNotes[ing.id] || ''} disabled={!canEdit} onChange={e => setAuditNotes(prev => ({ ...prev, [ing.id]: e.target.value }))} className="w-full border-b border-gray-100 bg-transparent text-[11px] font-bold py-1 outline-none focus:border-teal-500" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <style>{`
        .btn-teal-ghost { color: #64748b; font-size: 13px; font-weight: 700; border: none; padding: 8px 16px; }
        .btn-teal-ghost:hover { background-color: #f0fdfa; color: #0d9488; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}