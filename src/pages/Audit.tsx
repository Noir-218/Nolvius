import React, { useState, useEffect, useCallback } from 'react';
import { Tables, TablesInsert, TablesUpdate } from '../types/database.types';
import { useFacility } from '../contexts/FacilityContext';
import { Search, Save, History, PackageOpen, ChevronLeft, ChevronRight, AlertCircle, CupSoda, Upload, Download, ClipboardCheck, FileDown, Calculator, X, Eye, EyeOff, AlertTriangle, TrendingDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { TeaAndCakeAuditTab } from '../components/audit/TeaAndCakeAuditTab';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { format, parseISO, subDays, startOfMonth } from 'date-fns';
import toast from 'react-hot-toast';
import { fetchAllSupabase } from '../lib/supabaseUtils';

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

const unsignedString = (str: string) => {
  return str
    .normalize('NFC')
    .toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[\u0300\u0301\u0309\u0303\u0327\u0309\u0323]/g, '');
};

export default function Audit() {
  const { user, role } = useAuth();
  const { canEdit: permCanEdit } = usePermissions('audit');
  const { facilityClient: supabase, currentFacility } = useFacility();
  const isStaff = role === 'staff';
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const isToday = selectedDate === todayStr;
  // canEdit: staff can only edit today; non-staff need action_permissions to allow edit
  const canEdit = (!isStaff || isToday) && permCanEdit;
  const yearMonth = toYearMonth(selectedDate);
  const isFirstOfMonth = selectedDate.slice(8, 10) === '01';

  const [viewMode, setViewMode] = useState<'daily' | 'opening' | 'history' | 'teaCake'>('daily');

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [openingStockMap, setOpeningStockMap] = useState<Record<string, number>>({});
  const [dailyTx, setDailyTx] = useState<DailyTxSummary>({});

  const [storeStocks, setStoreStocks] = useState<Record<string, string>>({});
  const [counterStocks, setCounterStocks] = useState<Record<string, string>>({});
  const [storeUnits, setStoreUnits] = useState<Record<string, string>>({});
  const [counterUnits, setCounterUnits] = useState<Record<string, string>>({});

  const [existingAuditIds, setExistingAuditIds] = useState<Record<string, string>>({});
  const existingAuditIdsRef = React.useRef<Record<string, string>>({});

  const [monthlyOpeningInputs, setMonthlyOpeningInputs] = useState<Record<string, string>>({});
  const [monthlyOpeningUnits, setMonthlyOpeningUnits] = useState<Record<string, string>>({});
  const [monthlyOpeningNotes, setMonthlyOpeningNotes] = useState<Record<string, string>>({});

  const [hasMonthlyOpening, setHasMonthlyOpening] = useState(false);
  const broadcastChannelRef = React.useRef<any>(null);
  const initialDataRef = React.useRef<{
    storeStocks: Record<string, string>;
    counterStocks: Record<string, string>;
    calcBreakdowns: Record<string, Record<string, string>>;
  }>({ storeStocks: {}, counterStocks: {}, calcBreakdowns: {} });
  type FilterType = 'all' | 'missing' | 'variance' | 'negative';
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [allUnits, setAllUnits] = useState<Tables<'ingredient_units'>[]>([]);

  const [calcModal, setCalcModal] = useState<{
    isOpen: boolean;
    ingId: string;
    location: 'store' | 'counter' | 'monthly';
    ingName: string;
    baseUnit: string;
  } | null>(null);
  const [calcValues, setCalcValues] = useState<Record<string, string>>({});
  const [calcBreakdowns, setCalcBreakdowns] = useState<Record<string, Record<string, string>>>({});

  const openCalc = (ing: Ingredient, location: 'store' | 'counter' | 'monthly') => {
    setCalcModal({
      isOpen: true,
      ingId: ing.id,
      location,
      ingName: ing.name,
      baseUnit: ing.unit
    });
    setCalcValues(calcBreakdowns[`${location}-${ing.id}`] || {});
  };

  const closeCalc = () => setCalcModal(null);

  const applyCalc = () => {
    if (!calcModal) return;
    const { ingId, location } = calcModal;
    let total = parseFloat(calcValues['base']) || 0;
    const unitsForIng = allUnits.filter(u => u.ingredient_id === ingId);
    unitsForIng.forEach(u => {
      total += (parseFloat(calcValues[u.id]) || 0) * u.conversion_factor;
    });

    // Save breakdown
    setCalcBreakdowns(prev => ({
      ...prev,
      [`${location}-${ingId}`]: { ...calcValues }
    }));

    if (location === 'store') {
      setStoreStocks(prev => ({ ...prev, [ingId]: total.toString() }));
      setStoreUnits(prev => ({ ...prev, [ingId]: 'base' }));
    } else if (location === 'counter') {
      setCounterStocks(prev => ({ ...prev, [ingId]: total.toString() }));
      setCounterUnits(prev => ({ ...prev, [ingId]: 'base' }));
    } else if (location === 'monthly') {
      setMonthlyOpeningInputs(prev => ({ ...prev, [ingId]: total.toString() }));
      setMonthlyOpeningUnits(prev => ({ ...prev, [ingId]: 'base' }));
    }
    closeCalc();
  };

  const [auditHistory, setAuditHistory] = useState<Tables<'stock_audits'>[]>([]);
  const [historyDate, setHistoryDate] = useState<string>(selectedDate);
  const [historySearch, setHistorySearch] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const fetchDailyData = useCallback(async () => {
    setLoading(true);
    setStoreStocks({});
    setCounterStocks({});
    setStoreUnits({});
    setCounterUnits({});
    setExistingAuditIds({});
    existingAuditIdsRef.current = {};

    const { data: ingData } = await supabase
      .from('ingredients')
      .select('id, name, unit, ingredient_categories(name)')
      .order('name');
    if (ingData) {
      setIngredients(ingData as unknown as Ingredient[]);
      const cats = Array.from(
        new Set(ingData.map((i) => (i.ingredient_categories as { name: string } | null)?.name).filter(Boolean))
      ) as string[];
      setCategories(cats);
    }

    const { data: unitsData } = await supabase.from('ingredient_units').select('*');
    if (unitsData) setAllUnits(unitsData);

    const { data: dayAuditsData } = await supabase
      .from('stock_audits')
      .select('id, ingredient_id, stock_in_store, stock_in_counter, actual_stock, opening_stock, theoretical_stock, notes, store_calc_breakdown, counter_calc_breakdown')
      .eq('audit_date', selectedDate);

    const storeMap: Record<string, string> = {};
    const counterMap: Record<string, string> = {};
    const sUnitMap: Record<string, string> = {};
    const cUnitMap: Record<string, string> = {};
    const auditIdMap: Record<string, string> = {};
    const calcBreakdownMap: Record<string, Record<string, string>> = {};

    if (dayAuditsData) {
      dayAuditsData.forEach((a: any) => {
        if (a.ingredient_id) {
          storeMap[a.ingredient_id] = a.stock_in_store?.toString() ?? '';
          counterMap[a.ingredient_id] = a.stock_in_counter?.toString() ?? '';
          sUnitMap[a.ingredient_id] = 'base';
          cUnitMap[a.ingredient_id] = 'base';
          auditIdMap[a.ingredient_id] = a.id;
          if (a.store_calc_breakdown) calcBreakdownMap[`store-${a.ingredient_id}`] = a.store_calc_breakdown;
          if (a.counter_calc_breakdown) calcBreakdownMap[`counter-${a.ingredient_id}`] = a.counter_calc_breakdown;
        }
      });
    }
    setStoreStocks(storeMap);
    setCounterStocks(counterMap);
    setStoreUnits(sUnitMap);
    setCounterUnits(cUnitMap);
    setExistingAuditIds(auditIdMap);
    existingAuditIdsRef.current = auditIdMap;
    setCalcBreakdowns(calcBreakdownMap);
    initialDataRef.current = {
      storeStocks: { ...storeMap },
      counterStocks: { ...counterMap },
      calcBreakdowns: { ...calcBreakdownMap }
    };

    const startOfThisMonth = format(startOfMonth(parseDate(selectedDate)), 'yyyy-MM-dd');
    const priorAuditsQuery = supabase
      .from('stock_audits')
      .select('ingredient_id, actual_stock, audit_date')
      .gte('audit_date', startOfThisMonth)
      .lt('audit_date', selectedDate)
      .order('audit_date', { ascending: false });
    const priorAudits = await fetchAllSupabase(priorAuditsQuery);

    const priorActualMap: Record<string, number> = {};
    const priorDateMap: Record<string, string> = {};
    if (priorAudits) {
      priorAudits.forEach((a) => {
        if (a.ingredient_id && priorActualMap[a.ingredient_id] === undefined) {
          priorActualMap[a.ingredient_id] = a.actual_stock ?? 0;
          priorDateMap[a.ingredient_id] = a.audit_date;
        }
      });
    }

    const { data: monthlyData } = await supabase
      .from('monthly_opening_stock')
      .select('ingredient_id, opening_stock')
      .eq('year_month', yearMonth);

    const monthlyMap: Record<string, number> = {};
    if (monthlyData) {
      monthlyData.forEach((m) => {
        monthlyMap[m.ingredient_id] = m.opening_stock ?? 0;
      });
    }
    setHasMonthlyOpening(monthlyData ? monthlyData.length > 0 : false);

    // Split transactions fetching to avoid 1000-row limit issues
    const [todayTxData, monthlyTxData] = await Promise.all([
      // 1. Fetch today's transactions (high priority for Xuất/Nhập columns)
      fetchAllSupabase(
        supabase
          .from('stock_transactions')
          .select('ingredient_id, type, quantity, transaction_date')
          .eq('transaction_date', selectedDate)
      ),
      // 2. Fetch historical transactions for Opening Stock calculation
      fetchAllSupabase(
        supabase
          .from('stock_transactions')
          .select('ingredient_id, type, quantity, transaction_date')
          .gte('transaction_date', startOfThisMonth)
          .lt('transaction_date', selectedDate)
          .order('transaction_date', { ascending: false })
          .order('created_at', { ascending: false })
      )
    ]);

    const txData = [
      ...(todayTxData || []),
      ...(monthlyTxData || [])
    ];

    const daySummary: DailyTxSummary = {};
    const gapSummary: DailyTxSummary = {};
    if (txData) {
      txData.forEach((tx) => {
        if (!tx.ingredient_id) return;
        const qty = Math.abs(Number(tx.quantity));
        const isCurrentDay = tx.transaction_date === selectedDate;

        if (isCurrentDay) {
          if (!daySummary[tx.ingredient_id]) daySummary[tx.ingredient_id] = { in: 0, out: 0 };
          if (['IN', 'IN_TRANSFER'].includes(tx.type)) daySummary[tx.ingredient_id].in += qty;
          else if (['OUT', 'WASTE', 'WASTE_SYSTEM', 'SALES_USAGE'].includes(tx.type)) daySummary[tx.ingredient_id].out += qty;
        } else {
          // Transaction is before current day but after/on start of month
          const lastDate = priorDateMap[tx.ingredient_id] || (startOfThisMonth.slice(0, 8) + '00');
          if (tx.transaction_date > lastDate) { // LT selectedDate is already handled by query
            if (!gapSummary[tx.ingredient_id]) gapSummary[tx.ingredient_id] = { in: 0, out: 0 };
            if (['IN', 'IN_TRANSFER'].includes(tx.type)) gapSummary[tx.ingredient_id].in += qty;
            else if (['OUT', 'WASTE', 'WASTE_SYSTEM', 'SALES_USAGE'].includes(tx.type)) gapSummary[tx.ingredient_id].out += qty;
          }
        }
      });
    }
    setDailyTx(daySummary);

    const computedOpening: Record<string, number> = {};
    (ingData || []).forEach((ing) => {
      let baseOpening = 0;
      if (!isFirstOfMonth && priorActualMap[ing.id] !== undefined) {
        baseOpening = priorActualMap[ing.id];
      } else {
        baseOpening = monthlyMap[ing.id] ?? 0;
      }
      const gapTx = gapSummary[ing.id] || { in: 0, out: 0 };
      computedOpening[ing.id] = baseOpening + gapTx.in - gapTx.out;
    });
    setOpeningStockMap(computedOpening);

    setLoading(false);
  }, [selectedDate, yearMonth, isFirstOfMonth]);

  const fetchMonthlyOpening = useCallback(async () => {
    setLoading(true);
    const { data: ingData } = await supabase
      .from('ingredients')
      .select('id, name, unit, ingredient_categories(name)')
      .order('name');
    if (ingData) {
      setIngredients(ingData as unknown as Ingredient[]);
      const cats = Array.from(new Set(ingData.map((i) => (i.ingredient_categories as { name: string } | null)?.name).filter(Boolean))) as string[];
      setCategories(cats);
    }
    const { data: monthlyData } = await supabase
      .from('monthly_opening_stock')
      .select('id, ingredient_id, opening_stock, notes, calc_breakdown')
      .eq('year_month', yearMonth);
    const inputMap: Record<string, string> = {};
    const noteMap: Record<string, string> = {};
    const monthlyCalcMap: Record<string, Record<string, string>> = {};
    if (monthlyData) {
      monthlyData.forEach((m: any) => {
        inputMap[m.ingredient_id] = m.opening_stock?.toString() ?? '';
        noteMap[m.ingredient_id] = m.notes ?? '';
        if (m.calc_breakdown) monthlyCalcMap[`monthly-${m.ingredient_id}`] = m.calc_breakdown;
      });
    }
    setMonthlyOpeningInputs(inputMap);
    setMonthlyOpeningNotes(noteMap);
    setCalcBreakdowns(monthlyCalcMap);
    const { data: unitsData } = await supabase.from('ingredient_units').select('*');
    if (unitsData) setAllUnits(unitsData);
    setLoading(false);
  }, [yearMonth]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('stock_audits')
      .select('*, ingredients(name, unit), profiles(full_name, email)')
      .eq('audit_date', historyDate)
      .order('created_at', { ascending: false });
    if (data) setAuditHistory(data as any);
    setLoading(false);
  }, [historyDate]);

  useEffect(() => {
    if (viewMode !== 'daily') return;

    const channel = supabase
      .channel('audit-changes', { config: { broadcast: { self: false } } })
      .on(
        'broadcast',
        { event: 'INPUT_CHANGE' },
        (payload) => {
          const { ingId, field, value } = payload.payload;
          if (field === 'store') {
            setStoreStocks(prev => ({ ...prev, [ingId]: value }));
          } else if (field === 'counter') {
            setCounterStocks(prev => ({ ...prev, [ingId]: value }));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_audits',
          filter: `audit_date=eq.${selectedDate}`
        },
        (payload) => {
          const { eventType, new: newRecord } = payload;
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const audit = newRecord as any;
            if (!audit.ingredient_id) return;
            
            // Only update if the user is NOT actively editing this specific ingredient
            // to avoid jumping values while typing
            if (activeId !== audit.ingredient_id && calcModal?.ingId !== audit.ingredient_id) {
              setStoreStocks(prev => ({ ...prev, [audit.ingredient_id]: audit.stock_in_store?.toString() ?? '' }));
              setCounterStocks(prev => ({ ...prev, [audit.ingredient_id]: audit.stock_in_counter?.toString() ?? '' }));
              setExistingAuditIds(prev => ({ ...prev, [audit.ingredient_id]: audit.id }));
              existingAuditIdsRef.current = { ...existingAuditIdsRef.current, [audit.ingredient_id]: audit.id };
              
              setCalcBreakdowns(prev => {
                const next = { ...prev };
                if (audit.store_calc_breakdown) next[`store-${audit.ingredient_id}`] = audit.store_calc_breakdown;
                if (audit.counter_calc_breakdown) next[`counter-${audit.ingredient_id}`] = audit.counter_calc_breakdown;
                return next;
              });
            }
          }
        }
      )
      .subscribe();

    broadcastChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      broadcastChannelRef.current = null;
    };
  }, [viewMode, selectedDate, activeId, calcModal]);

  useEffect(() => {
    if (viewMode === 'daily') fetchDailyData();
    else if (viewMode === 'opening') fetchMonthlyOpening();
    else if (viewMode === 'history') fetchHistory();
  }, [viewMode, selectedDate, historyDate, fetchDailyData, fetchHistory, fetchMonthlyOpening]);

  // calcBreakdowns is now loaded from DB in fetchDailyData / fetchMonthlyOpening

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
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, string | number>[];
        const newStoreStocks = { ...storeStocks };
        const newCounterStocks = { ...counterStocks };
        let matchCount = 0;
        data.forEach((row) => {
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
        toast.success(`Đã nhập dữ liệu cho ${matchCount} nguyên liệu!`);
      } catch (err) { 
        console.error(err);
        alert('Lỗi Excel!'); 
      }
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

  const exportDailyAudit = () => {
    const dataToExport = filtered
      .map(ing => {
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
        
        const total = store + counter;
        const hasInput = storeVal !== '' || counterVal !== '';

        if (!hasInput && !existingAuditIds[ing.id]) return null;

        return {
          'Mã hàng': ing.id,
          'Tên hàng': ing.name,
          'Đơn vị': ing.unit,
          'Số lượng (tổng kho + quầy)': total
        };
      })
      .filter(Boolean);

    if (dataToExport.length === 0) {
      toast.error('Không có dữ liệu kiểm kê để xuất!');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu kiểm kê");
    XLSX.writeFile(wb, `Kiem_Ke_${selectedDate}.xlsx`);
  };

  const syncToGoogleSheet = async (records: any[]) => {
    const GOOGLE_SCRIPT_URL = currentFacility?.google_script_url || import.meta.env.VITE_GOOGLE_SCRIPT_URL;
    if (!GOOGLE_SCRIPT_URL) {
      toast.error('Chưa cấu hình URL Google Script cho cơ sở này! Đã lưu cục bộ nhưng bỏ qua đồng bộ Sheets.');
      return;
    }

    const formattedDate = format(parseISO(selectedDate), 'dd/MM/yyyy');

    const inventoryList = records.map(record => ({
      code: record.ingredient_id,
      name: ingredients.find(i => i.id === record.ingredient_id)?.name || '',
      thucTe: record.actual_stock
    }));

    const toastId = toast.loading('Đang đồng bộ sang Google Sheets...');

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: JSON.stringify({ selectedDate: formattedDate, inventoryList }),
      });

      const result = await response.json();
      if (result.status === "success") {
        toast.success(`Đồng bộ Sheets thành công! Đã cập nhật ${result.updatedItems || result.updatedRows || 0} mục.`, { id: toastId });
      } else {
        toast.error("Lỗi đồng bộ Sheets: " + (result.message || 'Không rõ nguyên nhân'), { id: toastId });
      }
    } catch (error) {
      console.error("Lỗi kết nối API Google Sheets:", error);
      toast.error("Không thể kết nối với Google Sheets.", { id: toastId });
    }
  };

  const handleSaveAudit = useCallback(async () => {
    const filledKeys = Object.keys(storeStocks).concat(Object.keys(counterStocks))
      .filter((v, i, a) => a.indexOf(v) === i)
      .filter(k => storeStocks[k] !== '' || counterStocks[k] !== '');
    if (filledKeys.length === 0) { 
      toast.error('Vui lòng nhập tồn!'); 
      return; 
    }
    setSaving(true);
    try {
      // 1. Tải dữ liệu mới nhất từ DB cho các mặt hàng sắp lưu để gộp (Merge)
      const { data: latestDbData } = await supabase
          .from('stock_audits')
          .select('ingredient_id, stock_in_store, stock_in_counter, store_calc_breakdown, counter_calc_breakdown')
          .eq('audit_date', selectedDate)
          .in('ingredient_id', filledKeys);

      const latestDbMap: Record<string, any> = {};
      if (latestDbData) {
        latestDbData.forEach((d: any) => {
          latestDbMap[d.ingredient_id] = d;
        });
      }

      const hugeVariances: string[] = [];
      const recordsToUpsert: TablesUpdate<'stock_audits'>[] = [];

      filledKeys.forEach(id => {
        const initial = initialDataRef.current;
        const latestDb = latestDbMap[id] || {};

        // Merge Logic:
        // Nếu giá trị hiện tại TRÊN MÀN HÌNH giống hệt giá trị lúc vừa tải trang (Initial),
        // và TRÊN DATABASE đã có giá trị mới (LatestDb), thì ta lấy giá trị mới từ DB để tránh ghi đè.
        
        // --- Xử lý Kho (Store) ---
        let finalStore = parseFloat(storeStocks[id]) || 0;
        let finalStoreBreakdown = calcBreakdowns[`store-${id}`] || null;

        if (storeStocks[id] === initial.storeStocks[id] && latestDb.stock_in_store !== undefined) {
          finalStore = latestDb.stock_in_store;
          finalStoreBreakdown = latestDb.store_calc_breakdown;
        }

        // --- Xử lý Quầy (Counter) ---
        let finalCounter = parseFloat(counterStocks[id]) || 0;
        let finalCounterBreakdown = calcBreakdowns[`counter-${id}`] || null;

        if (counterStocks[id] === initial.counterStocks[id] && latestDb.stock_in_counter !== undefined) {
          finalCounter = latestDb.stock_in_counter;
          finalCounterBreakdown = latestDb.counter_calc_breakdown;
        }

        const actual = Number(finalStore + finalCounter) || 0;
        const opening = Number(openingStockMap[id]) || 0;
        const daily = dailyTx[id] || { in: 0, out: 0 };
        const theoretical = Number(opening + (Number(daily.in) || 0) - (Number(daily.out) || 0)) || 0;

        if (theoretical > 0 && Math.abs(actual - theoretical) > (theoretical * 0.2)) {
          hugeVariances.push(ingredients.find(i => i.id === id)?.name || id);
        }

        const record: any = {
          ingredient_id: id,
          audit_date: selectedDate,
          opening_stock: opening,
          theoretical_stock: theoretical,
          stock_in_store: finalStore,
          stock_in_counter: finalCounter,
          actual_stock: actual,
          notes: '',
          audited_by: user?.id,
          created_at: new Date().toISOString(),
          store_calc_breakdown: finalStoreBreakdown,
          counter_calc_breakdown: finalCounterBreakdown,
        };

        recordsToUpsert.push(record);
      });

      if (hugeVariances.length > 0) {
        if (!window.confirm(`Phát hiện ${hugeVariances.length} chênh lệch > 20%. Tiếp tục?`)) { setSaving(false); return; }
      }
      
      if (recordsToUpsert.length > 0) {
        const { error } = await supabase
          .from('stock_audits')
          .upsert(recordsToUpsert as TablesInsert<'stock_audits'>[], { onConflict: 'ingredient_id,audit_date' });
        if (error) throw error;
      }
      
      toast.success('Đã lưu cục bộ thành công!');
      fetchDailyData();

      // Đồng bộ sang Google Sheets sau khi lưu thành công lên Supabase
      if (recordsToUpsert.length > 0) {
        await syncToGoogleSheet(recordsToUpsert);
      }
    } catch (err: any) { 
      console.error(err);
      toast.error('Lỗi khi lưu: ' + (err?.message || err?.details || JSON.stringify(err))); 
    }
    setSaving(false);
  }, [storeStocks, counterStocks, storeUnits, counterUnits, allUnits, openingStockMap, dailyTx, selectedDate, user, ingredients, calcBreakdowns, fetchDailyData]);


  const handleSaveMonthlyOpening = useCallback(async () => {
    const filledKeys = Object.keys(monthlyOpeningInputs).filter(k => monthlyOpeningInputs[k] !== '');
    if (filledKeys.length === 0) {
      toast.error('Vui lòng nhập tồn!');
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
          opening_stock: Number(val * factor) || 0,
          notes: monthlyOpeningNotes[id] || '',
          created_by: user?.id,
          updated_at: new Date().toISOString(),
          calc_breakdown: calcBreakdowns[`monthly-${id}`] || null,
        };
        return record;
      });
      const { error } = await supabase
        .from('monthly_opening_stock')
        .upsert(upserts as TablesInsert<'monthly_opening_stock'>[], { onConflict: 'ingredient_id,year_month' });
      
      if (error) throw error;

      toast.success(`Đã lưu tồn đầu!`);
      fetchMonthlyOpening();
    } catch (err: any) { 
      console.error(err);
      toast.error('Lỗi: ' + (err?.message || err?.details || JSON.stringify(err))); 
    }
    setSaving(false);
  }, [monthlyOpeningInputs, monthlyOpeningUnits, monthlyOpeningNotes, yearMonth, user, calcBreakdowns, allUnits, fetchMonthlyOpening]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (viewMode === 'daily') {
          handleSaveAudit();
        } else if (viewMode === 'opening') {
          handleSaveMonthlyOpening();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, handleSaveAudit, handleSaveMonthlyOpening]);

  const handleMonthlyExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, string | number>[];
        const newInputs = { ...monthlyOpeningInputs };
        const newNotes = { ...monthlyOpeningNotes };
        let matchCount = 0;
        data.forEach((row) => {
          const id = row['Mã nguyên liệu'] || row['Ma nguyen lieu'] || row['ID'];
          const val = row['Số tồn đầu'] || row['So ton dau'] || row['Opening Stock'];
          const note = row['Ghi chú'] || row['Ghi chu'] || row['Note'];
          
          if (id) {
            const ingId = id.toString().trim();
            if (ingredients.some(ing => ing.id === ingId)) {
              if (val !== undefined) newInputs[ingId] = val.toString();
              if (note !== undefined) newNotes[ingId] = note.toString();
              matchCount++;
            }
          }
        });
        setMonthlyOpeningInputs(newInputs);
        setMonthlyOpeningNotes(newNotes);
        toast.success(`Đã nhập dữ liệu tồn đầu cho ${matchCount} nguyên liệu!`);
      } catch (err) { 
        console.error(err);
        toast.error('Lỗi file Excel!'); 
      }
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const downloadMonthlyTemplate = () => {
    const templateData = ingredients.map(ing => ({
      'Mã nguyên liệu': ing.id,
      'Tên nguyên liệu': ing.name,
      'Đơn vị': ing.unit,
      'Số tồn đầu': '',
      'Ghi chú': ''
    }));
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ton_Dau");
    XLSX.writeFile(wb, `Mau_Nhap_Ton_Dau_${yearMonth}.xlsx`);
  };

  const filtered = ingredients.filter(ing => {
    const matchSearch = unsignedString(ing.name).includes(unsignedString(search));
    const matchCat = selectedCategory ? ing.ingredient_categories?.name === selectedCategory : true;
    
    if (filterType === 'all') return matchSearch && matchCat;

    const opening = openingStockMap[ing.id] ?? 0;
    const daily = dailyTx[ing.id] || { in: 0, out: 0 };
    const theoretical = opening + daily.in - daily.out;
    
    const storeVal = storeStocks[ing.id] || '';
    const counterVal = counterStocks[ing.id] || '';
    const monthlyVal = monthlyOpeningInputs[ing.id] || '';
    
    const hasInput = viewMode === 'opening' 
      ? monthlyVal !== '' 
      : (storeVal !== '' || counterVal !== '');

    if (filterType === 'missing') {
      // Keep item visible if it's currently being edited or has the calculator open
      if (ing.id === activeId || calcModal?.ingId === ing.id) return true;
      return matchSearch && matchCat && !hasInput;
    }

    // Need actual for variance and negative
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
    const actual = store + counter;

    if (filterType === 'negative') {
      if (ing.id === activeId || calcModal?.ingId === ing.id) return true;
      return matchSearch && matchCat && hasInput && actual < (theoretical - 0.001);
    }

    if (filterType === 'variance') {
      if (ing.id === activeId || calcModal?.ingId === ing.id) return true;
      const isHigh = theoretical > 0 && Math.abs(actual - theoretical) > (theoretical * 0.2);

      return matchSearch && matchCat && hasInput && (isHigh || (theoretical === 0 && actual > 0));
    }

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
              <div className="flex items-center gap-2 me-2">
                <button onClick={downloadMonthlyTemplate} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-100 text-gray-400 rounded-xl hover:text-teal-600 hover:border-teal-200 transition-all premium-shadow" title="Mẫu Excel Tồn Đầu"><Download size={18} /></button>
                <label className="w-10 h-10 flex items-center justify-center bg-white border border-gray-100 text-gray-400 rounded-xl hover:text-teal-600 hover:border-teal-200 transition-all premium-shadow cursor-pointer mb-0">
                  <Upload size={18} />
                  <input type="file" accept=".xlsx, .xls" onChange={handleMonthlyExcelImport} className="d-none" />
                </label>
              </div>
              <button onClick={() => setViewMode('daily')} className="btn btn-teal-ghost rounded-xl transition-all">← Quay lại</button>
              <button onClick={handleSaveMonthlyOpening} disabled={saving} className="btn bg-teal-600 text-white rounded-xl font-black px-4 shadow-lg shadow-teal-100 border-0 flex items-center gap-2">
                <Save size={16} /> {saving ? '...' : 'LƯU TỒN ĐẦU'}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3 mb-4 p-3" style={{ background: '#F0EDE4', border: '1px solid #DDD9CE' }}>
           <div className="row g-2 align-items-center">
              <div className="col-md-8">
                <div className="input-group">
                  <span className="input-group-text"><Search size={16} /></span>
                  <input id="main-search-input" type="text" placeholder="Tìm nguyên liệu..." value={search} onChange={e => setSearch(e.target.value)} className="form-control" />
                </div>
              </div>
              <div className="col-md-4">
                 <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="form-select">
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
                      <div className="flex items-center justify-center gap-1 mx-auto" style={{maxWidth: '240px'}}>
                        <div className="flex items-center flex-1 gap-1 bg-white border border-gray-100 rounded-xl px-2">
                          <input type="number" value={monthlyOpeningInputs[ing.id] || ''} onFocus={() => setActiveId(ing.id)} onBlur={() => setActiveId(null)} onChange={e => setMonthlyOpeningInputs(prev => ({ ...prev, [ing.id]: e.target.value }))} onWheel={e => (e.target as HTMLInputElement).blur()} onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); if (e.key === 'Enter') handleSaveMonthlyOpening(); }} className="w-full text-end border-0 font-black text-sm bg-transparent h-9 outline-none" placeholder="0" />
                          <select value={monthlyOpeningUnits[ing.id] || 'base'} onChange={e => setMonthlyOpeningUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="border-0 bg-transparent text-[9px] font-black text-gray-400 uppercase w-12 outline-none">
                             <option value="base">{ing.unit}</option>
                             {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (<option key={u.id} value={u.unit_name}>{u.unit_name}</option>))}
                          </select>
                        </div>
                        {allUnits.some(u => u.ingredient_id === ing.id) && (
                          <button onClick={() => openCalc(ing, 'monthly')} className="p-2 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-600 hover:text-white transition-all shadow-sm premium-shadow" title="Nhập nhiều quy cách">
                            <Calculator size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 border-gray-50">
                      <input type="text" placeholder="..." value={monthlyOpeningNotes[ing.id] || ''} onChange={e => setMonthlyOpeningNotes(prev => ({ ...prev, [ing.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') handleSaveMonthlyOpening(); }} className="w-full border-b border-gray-100 bg-transparent text-[11px] font-bold py-1 outline-none" />
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
    const filteredHistory = auditHistory.filter(a => {
      const item = a as any;
      const name = item.ingredients?.name || '';
      return unsignedString(name).includes(unsignedString(historySearch));
    });

    return (
      <div className="container-fluid py-4 pb-10">
        {/* HEADER & DATE PICKER */}
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
          <div className="col-12 col-md-auto flex items-center gap-3">
             <div className="flex items-center bg-white rounded-2xl shadow-sm border border-teal-600/20 p-1 border-s-4">
                <button onClick={() => setHistoryDate(format(subDays(parseDate(historyDate), 1), 'yyyy-MM-dd'))} className="p-2 text-teal-600 hover:bg-teal-50 rounded-xl transition-all"><ChevronLeft size={20} /></button>
                <input type="date" value={historyDate} onChange={e => setHistoryDate(e.target.value)} className="border-0 bg-transparent text-center font-black text-gray-800 outline-none px-2 text-sm" />
                <button onClick={() => {
                    const next = format(new Date(new Date(historyDate).getTime() + 86400000), 'yyyy-MM-dd');
                    if (next <= todayStr) setHistoryDate(next);
                  }} disabled={historyDate >= todayStr} className="p-2 text-teal-600 hover:bg-teal-50 rounded-xl disabled:opacity-30 transition-all"><ChevronRight size={20} /></button>
             </div>
             <button onClick={() => setViewMode('daily')} className="btn btn-teal-ghost rounded-xl transition-all">← Quay lại</button>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="rounded-3 mb-4 p-3" style={{ background: '#F0EDE4', border: '1px solid #DDD9CE' }}>
          <div className="input-group">
            <span className="input-group-text"><Search size={16} /></span>
            <input type="text" placeholder="Tìm tên nguyên liệu..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="form-control" />
          </div>
        </div>

        {/* DETAILED TABLE */}
        <div className="bg-white rounded-4 shadow-sm border border-gray-100 overflow-hidden premium-shadow">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Người Kiểm</th>
                  <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Giờ Kiểm</th>
                  <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Tên Nguyên Liệu</th>
                  <th className="px-4 py-4 text-end text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Tồn Lý Thuyết</th>
                  <th className="px-4 py-4 text-end text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Tồn Thực Tế</th>
                  <th className="px-4 py-4 text-end text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Chênh Lệch</th>
                </tr>
              </thead>
              <tbody className="border-0">
                {loading ? (
                  <tr><td colSpan={6} className="py-20 text-center font-bold text-gray-400">Đang tải...</td></tr>
                ) : filteredHistory.length === 0 ? (
                  <tr><td colSpan={6} className="py-20 text-center font-bold text-gray-400">Không có dữ liệu kiểm kê</td></tr>
                ) : (
                  filteredHistory.map(a => {
                    const item = a as any;
                    const variance = (item.actual_stock ?? 0) - (item.theoretical_stock ?? 0);
                    const auditorName = item.profiles?.full_name || item.profiles?.email || 'Hệ thống';
                    const auditTime = item.created_at ? format(parseISO(item.created_at), 'HH:mm:ss') : '-';
                    return (
                      <tr key={item.id}>
                        <td className="px-6 py-4 border-gray-50 text-gray-800 font-bold text-sm">
                           {auditorName}
                        </td>
                        <td className="px-6 py-4 border-gray-50 text-gray-800 font-bold text-sm">
                           {auditTime}
                        </td>
                        <td className="px-6 py-4 border-gray-50">
                           <span className="fw-black text-gray-800 text-uppercase small">{item.ingredients?.name}</span>
                        </td>
                        <td className="px-4 py-4 text-end border-gray-50 text-gray-400 font-bold">{item.theoretical_stock?.toLocaleString()}</td>
                        <td className="px-4 py-4 text-end border-gray-50 text-gray-800 font-black">{item.actual_stock?.toLocaleString()}</td>
                        <td className={`px-4 py-4 text-end border-gray-50 font-black ${Math.abs(variance) < 0.001 ? 'text-teal-500' : variance < 0 ? 'text-red-500' : 'text-teal-500'}`}>
                           {variance > 0.001 ? '+' : ''}{variance.toLocaleString()}
                        </td>
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
                <button onClick={exportDailyAudit} className="w-10 h-10 flex items-center justify-center bg-teal-50 border border-teal-100 text-teal-600 rounded-xl hover:bg-teal-600 hover:text-white transition-all premium-shadow" title="Xuất dữ liệu Excel"><FileDown size={18} /></button>
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

             <div className="flex items-center gap-1 bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
                <button onClick={() => setFilterType('all')} className={`p-2 rounded-xl transition-all ${filterType === 'all' ? 'bg-teal-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`} title="Tất cả"><Eye size={18} /></button>
                <button onClick={() => setFilterType('missing')} className={`p-2 rounded-xl transition-all ${filterType === 'missing' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`} title="Chưa kiểm"><EyeOff size={18} /></button>
                <button onClick={() => setFilterType('variance')} className={`p-2 rounded-xl transition-all ${filterType === 'variance' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`} title="Sai lệch cao"><AlertTriangle size={18} /></button>
                <button onClick={() => setFilterType('negative')} className={`p-2 rounded-xl transition-all ${filterType === 'negative' ? 'bg-purple-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'}`} title="Chênh lệch âm (Hao hụt)"><TrendingDown size={18} /></button>
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

      <div className="rounded-3 mb-4 p-3" style={{ background: '#F0EDE4', border: '1px solid #DDD9CE' }}>
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-8">
            <div className="input-group">
              <span className="input-group-text"><Search size={16} /></span>
              <input id="main-search-input" type="text" placeholder="Tìm tên nguyên liệu..." value={search} onChange={(e) => setSearch(e.target.value)} className="form-control" />
            </div>
          </div>
          <div className="col-12 col-md-4">
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="form-select">
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
                <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Đầu Ngày</th>
                <th className="px-4 py-4 text-center text-teal-600 text-uppercase text-[10px] font-black tracking-widest border-0 font-bold">Nhập</th>
                <th className="px-4 py-4 text-center text-orange-600 text-uppercase text-[10px] font-black tracking-widest border-0 font-bold">Xuất</th>
                <th className="px-2 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Kho</th>
                <th className="px-2 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Quầy</th>
                <th className="px-4 py-4 text-center text-teal-600 text-uppercase text-[10px] font-black tracking-widest border-0">Thực Tế</th>
                <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Lý Thuyết</th>
                <th className="px-6 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-widest border-0">Chênh Lệch</th>
              </tr>
            </thead>
            <tbody className="border-0">
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-20 text-center font-bold text-gray-400">Đang tải...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-20 text-center text-gray-400 font-bold">Không có dữ liệu</td></tr>
              ) : (
                filtered.map((ing) => {
                  const opening = openingStockMap[ing.id] ?? 0;
                  const daily = dailyTx[ing.id] || { in: 0, out: 0 };
                  const theoretical = opening + daily.in - daily.out;
                  
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
                  const totalActual = hasInput ? store + counter : null;
                  const varianceValue = totalActual !== null ? totalActual - theoretical : null;
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
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50 bg-gray-50/20">
                         <span className="text-sm font-black text-gray-400">{opening.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50 bg-teal-50/10">
                         <span className="text-sm font-black text-teal-600">{(dailyTx[ing.id]?.in || 0).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50 bg-orange-50/10">
                         <span className="text-sm font-black text-orange-600">{(dailyTx[ing.id]?.out || 0).toLocaleString()}</span>
                      </td>
                      <td className="px-2 py-4 border-gray-50 min-w-[120px]">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 flex items-center gap-1 bg-white border border-gray-100 rounded-xl px-2">
                             <input type="number" step="0.000001" value={storeVal} disabled={!canEdit} onFocus={() => setActiveId(ing.id)} onBlur={() => setActiveId(null)} 
                                onChange={e => {
                                  const val = e.target.value;
                                  setStoreStocks(prev => ({ ...prev, [ing.id]: val }));
                                  broadcastChannelRef.current?.send({
                                    type: 'broadcast',
                                    event: 'INPUT_CHANGE',
                                    payload: { ingId: ing.id, field: 'store', value: val }
                                  });
                                }} 
                                onWheel={e => (e.target as HTMLInputElement).blur()} onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); if (e.key === 'Enter') handleSaveAudit(); }} className="w-full text-end border-0 font-black text-sm bg-transparent h-9 outline-none min-w-[40px]" placeholder="0" />
                             <select value={storeUnits[ing.id] || 'base'} disabled={!canEdit} onChange={e => setStoreUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="border-0 bg-transparent text-[9px] font-black text-gray-400 uppercase w-12 outline-none">
                               <option value="base">{ing.unit}</option>
                               {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (<option key={u.id} value={u.unit_name}>{u.unit_name}</option>))}
                             </select>
                          </div>
                          {canEdit && allUnits.some(u => u.ingredient_id === ing.id) && (
                            <button onClick={() => openCalc(ing, 'store')} className="p-1.5 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-600 hover:text-white transition-all shadow-sm premium-shadow" title="Nhập nhiều quy cách">
                              <Calculator size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-4 border-gray-50 min-w-[120px]">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 flex items-center gap-1 bg-teal-50/50 border border-teal-100 rounded-xl px-2">
                             <input type="number" step="0.000001" value={counterVal} disabled={!canEdit} onFocus={() => setActiveId(ing.id)} onBlur={() => setActiveId(null)} 
                                onChange={e => {
                                  const val = e.target.value;
                                  setCounterStocks(prev => ({ ...prev, [ing.id]: val }));
                                  broadcastChannelRef.current?.send({
                                    type: 'broadcast',
                                    event: 'INPUT_CHANGE',
                                    payload: { ingId: ing.id, field: 'counter', value: val }
                                  });
                                }} 
                                onWheel={e => (e.target as HTMLInputElement).blur()} onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); if (e.key === 'Enter') handleSaveAudit(); }} className="w-full text-end border-0 font-black text-sm bg-transparent h-9 outline-none min-w-[40px]" placeholder="0" />
                             <select value={counterUnits[ing.id] || 'base'} disabled={!canEdit} onChange={e => setCounterUnits(prev => ({ ...prev, [ing.id]: e.target.value }))} className="border-0 bg-transparent text-[9px] font-black text-gray-400 uppercase w-12 outline-none">
                               <option value="base">{ing.unit}</option>
                               {allUnits.filter(u => u.ingredient_id === ing.id).map(u => (<option key={u.id} value={u.unit_name}>{u.unit_name}</option>))}
                             </select>
                          </div>
                          {canEdit && allUnits.some(u => u.ingredient_id === ing.id) && (
                            <button onClick={() => openCalc(ing, 'counter')} className="p-1.5 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-600 hover:text-white transition-all shadow-sm premium-shadow" title="Nhập nhiều quy cách">
                              <Calculator size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50 bg-teal-50/30">
                         <span className={`text-base font-black ${totalActual !== null ? 'text-teal-600' : 'text-gray-200'}`}>{totalActual !== null ? totalActual.toLocaleString() : '--'}</span>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50 bg-gray-50/30">
                         <span className="text-sm font-black text-gray-500">{theoretical.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-end border-gray-50">
                        {totalActual !== null ? (
                           <span className={`text-sm font-black ${Math.abs(varianceValue ?? 0) < 0.001 ? 'text-teal-500' : (varianceValue ?? 0) < 0 ? 'text-red-500' : 'text-teal-500'}`}>
                              {varianceValue && varianceValue > 0.001 ? '+' : ''}{varianceValue?.toLocaleString()}
                           </span>
                        ) : '--'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {calcModal && calcModal.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm animate__animated animate__fadeIn animate__faster">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-sm overflow-hidden transform transition-all m-4">
            <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-teal-100 p-2 rounded-xl">
                  <Calculator size={18} className="text-teal-600" />
                </div>
                <div>
                  <h3 className="font-black text-gray-800 tracking-tight text-sm uppercase mb-0">Máy Tính Quy Đổi</h3>
                  <p className="text-[11px] font-bold text-teal-600 mb-0">{calcModal.ingName} ({calcModal.location === 'store' ? 'Kho' : calcModal.location === 'counter' ? 'Quầy' : 'Tồn Đầu'})</p>
                </div>
              </div>
              <button onClick={closeCalc} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              <div className="space-y-3">
                {allUnits.filter(u => u.ingredient_id === calcModal.ingId).map(u => (
                  <div key={u.id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-[11px] font-black text-gray-800 uppercase">{u.unit_name}</div>
                      <div className="text-[9px] font-bold text-gray-400">1 {u.unit_name} = {u.conversion_factor} {calcModal.baseUnit}</div>
                    </div>
                    <div className="w-32">
                      <input 
                        type="number" 
                        min="0"
                        step="0.000001"
                        value={calcValues[u.id] || ''}
                        onChange={e => setCalcValues(prev => ({ ...prev, [u.id]: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); if (e.key === 'Enter') applyCalc(); }}
                        placeholder="0"
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-end font-black text-sm text-teal-700 outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                      />
                    </div>
                  </div>
                ))}
                
                <div className="h-px bg-gray-100 my-4" />
                
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-[11px] font-black text-gray-800 uppercase">{calcModal.baseUnit} <span className="text-gray-400 font-bold">(Lẻ)</span></div>
                  </div>
                  <div className="w-32">
                    <input 
                      type="number" 
                      min="0"
                      step="0.000001"
                      value={calcValues['base'] || ''}
                      onChange={e => setCalcValues(prev => ({ ...prev, 'base': e.target.value }))}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); if (e.key === 'Enter') applyCalc(); }}
                      placeholder="0"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-end font-black text-sm text-teal-700 outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
              <div className="text-xs font-bold text-gray-500">
                Tổng cộng:<br/>
                <span className="text-lg font-black text-teal-600">
                  {(() => {
                    let t = parseFloat(calcValues['base']) || 0;
                    allUnits.filter(u => u.ingredient_id === calcModal.ingId).forEach(u => {
                      t += (parseFloat(calcValues[u.id]) || 0) * u.conversion_factor;
                    });
                    return t.toLocaleString();
                  })()} <span className="text-xs">{calcModal.baseUnit}</span>
                </span>
              </div>
              <button onClick={applyCalc} className="btn bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl px-5 py-2 shadow-lg shadow-teal-100 border-0 transition-all text-sm flex items-center gap-2">
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .btn-teal-ghost { color: #64748b; font-size: 13px; font-weight: 700; border: none; padding: 8px 16px; }
        .btn-teal-ghost:hover { background-color: #F7F3E8; color: #557A61; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}