import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tables, TablesInsert, TablesUpdate } from '../../types/database.types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Plus, Trash2, Save,
  CheckCircle2, AlertTriangle, AlertCircle,
  XCircle, FlaskConical, Clock, RefreshCw,
  Camera,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { format, addDays, parseISO, differenceInCalendarDays } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemType = 'tea' | 'cake';

interface AuditLot {
  id?: string;
  ingredient_id: string;
  manufacture_date: string;
  expiry_date: string;
  quantity: number | '';
  notes: string;
}

interface IngredientGroup {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  item_type: ItemType;
  lots: AuditLot[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const detectType = (name: string): ItemType => /bánh|banh/i.test(name) ? 'cake' : 'tea';
const SHELF_LIFE: Record<ItemType, number> = { tea: 5, cake: 2 };

const calcExpiry = (mfgDate: string, type: ItemType): string => {
  if (!mfgDate) return '';
  return format(addDays(parseISO(mfgDate), SHELF_LIFE[type]), 'yyyy-MM-dd');
};

const daysLeft = (expiryDate: string): number | null => {
  if (!expiryDate) return null;
  return differenceInCalendarDays(parseISO(expiryDate), parseISO(todayStr()));
};

// ─── Status ───────────────────────────────────────────────────────────────────

interface StatusCfg {
  label: string;
  Icon: React.ElementType;
  chip: string;   // classes for badge
  cell: string;   // classes for the status cell bg
}

const TEA_STATUS = (d: number | null): StatusCfg => {
  if (d === null) return { label: '—', Icon: Clock, chip: 'text-gray-400', cell: '' };
  if (d > 2) return { label: 'Ok', Icon: CheckCircle2, chip: 'text-emerald-700 font-bold', cell: '' };
  if (d === 2) return { label: 'Test', Icon: FlaskConical, chip: 'text-teal-700 font-bold', cell: 'bg-teal-50' };
  if (d === 1) return { label: 'AM/QC Test', Icon: AlertTriangle, chip: 'text-amber-700 font-bold', cell: 'bg-amber-50' };
  if (d === 0) return { label: 'Hủy - Hết hạn hôm nay', Icon: AlertCircle, chip: 'text-red-600 font-bold', cell: 'bg-red-100' };
  return { label: 'Hủy/Quá hạn', Icon: XCircle, chip: 'text-red-600 font-bold', cell: 'bg-red-100' };
};

const CAKE_STATUS = (d: number | null): StatusCfg => {
  if (d === null) return { label: '—', Icon: Clock, chip: 'text-gray-400', cell: '' };
  if (d > 0) return { label: 'Ok', Icon: CheckCircle2, chip: 'text-emerald-700 font-bold', cell: '' };
  if (d === 0) return { label: 'Hết hạn ngay', Icon: AlertCircle, chip: 'text-red-600 font-bold', cell: 'bg-red-100' };
  return { label: 'Đã hết hạn', Icon: XCircle, chip: 'text-red-600 font-bold', cell: 'bg-red-100' };
};

const getStatus = (lot: AuditLot, type: ItemType): StatusCfg => {
  const d = daysLeft(lot.expiry_date);
  return type === 'tea' ? TEA_STATUS(d) : CAKE_STATUS(d);
};

// ─── Empty lot factory ────────────────────────────────────────────────────────

const newLot = (ingId: string, type: ItemType, date: string): AuditLot => ({
  ingredient_id: ingId,
  manufacture_date: date,
  expiry_date: calcExpiry(date, type),
  quantity: '',
  notes: '',
});

const CATEGORY_NAME = 'Trà & Bánh';

// ─── MAX empty rows per ingredient (để bảng trông đều) ───────────────────────
const MIN_ROWS = 1; // Hiển thị số dòng thực tế, không ép buộc 2 dòng để bảng gọn gàng hơn

interface Props {
  selectedDate: string;
}

export const TeaAndCakeAuditTab: React.FC<Props> = ({ selectedDate }) => {
  const { user } = useAuth();
  const today = todayStr();

  const [groups, setGroups] = useState<IngredientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const teaRef = useRef<HTMLDivElement>(null);
  const cakeRef = useRef<HTMLDivElement>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const { data: ingData } = await supabase
        .from('ingredients')
        .select('id, name, unit, ingredient_categories!inner(name)')
        .eq('ingredient_categories.name', CATEGORY_NAME)
        .order('name');

      if (!ingData || ingData.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const { data: savedData } = await supabase
        .from('tea_cake_audits')
        .select('*')
        .eq('audit_date', date)
        .order('created_at', { ascending: true });

      const ids: string[] = [];

      const builtGroups: IngredientGroup[] = (ingData as unknown as { id: string; name: string; unit: string }[]).map((ing) => {
        const type = detectType(ing.name);
        const savedLots = savedData
          ? (savedData as Tables<'tea_cake_audits'>[]).filter(r => r.ingredient_id === ing.id)
          : [];

        let lots: AuditLot[];
        if (savedLots.length > 0) {
          lots = savedLots.map((r) => {
            if (r.id) ids.push(r.id);
            return {
              id: r.id,
              ingredient_id: ing.id,
              manufacture_date: r.manufacture_date ?? date,
              expiry_date: r.expiry_date ?? calcExpiry(r.manufacture_date ?? date, type),
              quantity: r.quantity ?? '',
              notes: r.notes ?? '',
            } as AuditLot;
          });
        } else {
          lots = [newLot(ing.id, type, date)];
        }

        return { ingredient_id: ing.id, ingredient_name: ing.name, unit: ing.unit, item_type: type, lots };
      });

      setGroups(builtGroups);
      setSavedIds(ids);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(selectedDate); }, [selectedDate, fetchData]);

  // ── Lot operations ────────────────────────────────────────────────────────────

  const addLot = (ingId: string) => {
    setGroups(prev => prev.map(g =>
      g.ingredient_id === ingId
        ? { ...g, lots: [...g.lots, newLot(ingId, g.item_type, selectedDate)] }
        : g
    ));
  };

  const removeLot = (ingId: string, lotIdx: number) => {
    setGroups(prev => prev.map(g => {
      if (g.ingredient_id !== ingId) return g;
      if (g.lots.length === 1) return { ...g, lots: [newLot(ingId, g.item_type, selectedDate)] };
      return { ...g, lots: g.lots.filter((_, i) => i !== lotIdx) };
    }));
  };

  const updateLot = (ingId: string, lotIdx: number, field: keyof AuditLot, value: string | number) => {
    setGroups(prev => prev.map(g => {
      if (g.ingredient_id !== ingId) return g;
      return {
        ...g,
        lots: g.lots.map((lot, i) => {
          if (i !== lotIdx) return lot;
          const updated = { ...lot, [field]: value };
          if (field === 'manufacture_date') updated.expiry_date = calcExpiry(String(value), g.item_type);
          return updated;
        }),
      };
    }));
  };

  // ── Save ──────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    // Chỉ lưu những row có nhập NSX
    const allLotsToSave = groups.flatMap(g =>
      g.lots.filter(l => l.manufacture_date).map(l => ({ ...l, item_type: g.item_type }))
    );
    
    // Yêu cầu nhập ít nhất 1 NSX
    if (allLotsToSave.length === 0) { alert('Vui lòng nhập ít nhất 1 NSX!'); return; }

    setSaving(true);
    try {
      // ── 1. Lưu vào tea_cake_audits ───────────────────────────────────────────
      // Xóa các bản ghi cũ của ngày này cho các ingredient đã chọn
      if (savedIds.length > 0) {
        await supabase.from('tea_cake_audits').delete().in('id', savedIds);
      }
      
      const { error: teaErr } = await supabase.from('tea_cake_audits').insert(
        allLotsToSave.map(l => ({
          audit_date: selectedDate,
          item_type: l.item_type,
          ingredient_id: l.ingredient_id,
          manufacture_date: l.manufacture_date,
          expiry_date: l.expiry_date,
          quantity: l.quantity === '' ? null : Number(l.quantity),
          notes: l.notes || null,
          audited_by: user?.id,
        }))
      );
      if (teaErr) throw teaErr;

      // ── 2. Cập nhật bảng stock_audits ───────────────────────────────────────
      const ingIds = groups.map(g => g.ingredient_id);

      // Fetch dữ liệu tồn cũ và giao dịch để tính toán opening/theoretical nếu cần
      // 2.1 Fetch existing audits
      const { data: existingAudits } = await supabase
        .from('stock_audits')
        .select('*')
        .eq('audit_date', selectedDate)
        .in('ingredient_id', ingIds);

      const existingMap: Record<string, Tables<'stock_audits'>> = {};
      if (existingAudits) existingAudits.forEach((a) => { existingMap[a.ingredient_id!] = a; });

      // 2.2 Fetch prior stock (for opening calculation if not exists)
      const startOfThisMonth = selectedDate.slice(0, 8) + '01';
      const { data: priorAudits } = await supabase
        .from('stock_audits')
        .select('ingredient_id, actual_stock, audit_date')
        .gte('audit_date', startOfThisMonth)
        .lt('audit_date', selectedDate)
        .order('audit_date', { ascending: false });

      const priorActualMap: Record<string, number> = {};
      if (priorAudits) {
        priorAudits.forEach((a) => {
          if (a.ingredient_id && priorActualMap[a.ingredient_id] === undefined) {
            priorActualMap[a.ingredient_id] = a.actual_stock ?? 0;
          }
        });
      }

      // 2.3 Fetch monthly opening
      const { data: monthlyData } = await supabase
        .from('monthly_opening_stock')
        .select('ingredient_id, opening_stock')
        .eq('year_month', selectedDate.slice(0, 7));
      
      const monthlyMap: Record<string, number> = {};
      if (monthlyData) monthlyData.forEach((m) => { monthlyMap[m.ingredient_id] = m.opening_stock ?? 0; });

      // 2.4 Fetch transactions for theoretical (Since last audit up to today)
      const { data: txData } = await supabase
        .from('stock_transactions')
        .select('ingredient_id, type, quantity, transaction_date')
        .gte('transaction_date', startOfThisMonth)
        .lte('transaction_date', selectedDate)
        .in('ingredient_id', ingIds);

      const txSummary: Record<string, { in: number, out: number }> = {};
      if (txData) {
        txData.forEach((tx) => {
          if (!tx.ingredient_id) return;

          const priorAuditForIng = (priorAudits || []).find(a => a.ingredient_id === tx.ingredient_id);
          const lastDate = priorAuditForIng ? priorAuditForIng.audit_date : null;

          const isCurrentDay = tx.transaction_date === selectedDate;
          let shouldAcc = false;

          if (isCurrentDay) {
            shouldAcc = true;
          } else if (lastDate && tx.transaction_date > lastDate) {
            shouldAcc = true;
          } else if (!lastDate && tx.transaction_date < selectedDate) {
            shouldAcc = true;
          }

          if (shouldAcc) {
            if (!txSummary[tx.ingredient_id]) txSummary[tx.ingredient_id] = { in: 0, out: 0 };
            const qty = Math.abs(Number(tx.quantity));
            if (['IN', 'IN_TRANSFER'].includes(tx.type)) txSummary[tx.ingredient_id].in += qty;
            else if (['OUT', 'WASTE', 'SALES_USAGE'].includes(tx.type)) txSummary[tx.ingredient_id].out += qty;
          }
        });
      }

      // 2.5 Build and Save Records
      const recordsToUpsert = groups.map(g => {
        const existing = existingMap[g.ingredient_id];
        
        // Theo yêu cầu: nếu để trống thì cập nhật là trống
        const isAudited = g.lots.some(l => l.quantity !== '');
        const storeQty = isAudited 
          ? g.lots.reduce((sum, l) => sum + (l.quantity === '' ? 0 : Number(l.quantity)), 0)
          : null;

        // Tính opening
        let opening = existing?.opening_stock;
        if (opening === undefined || opening === null) {
          if (selectedDate.slice(8, 10) !== '01' && priorActualMap[g.ingredient_id] !== undefined) {
            opening = priorActualMap[g.ingredient_id];
          } else {
            opening = monthlyMap[g.ingredient_id] ?? 0;
          }
        }

        // Tính theoretical
        const tx = txSummary[g.ingredient_id] || { in: 0, out: 0 };
        const theoretical = opening + tx.in - tx.out;

        const counter = existing?.stock_in_counter ?? 0;
        const actual = storeQty === null ? null : (storeQty + counter);

        const record: TablesUpdate<'stock_audits'> = {
          ingredient_id: g.ingredient_id,
          audit_date: selectedDate,
          stock_in_store: storeQty,
          stock_in_counter: counter,
          actual_stock: (actual ?? theoretical) as number, // Tránh null actual_stock nếu bảng yêu cầu non-null
          opening_stock: opening as number,
          theoretical_stock: theoretical,
          notes: existing?.notes ?? '',
          audited_by: user?.id,
        };
        if (existing?.id) record.id = existing.id;
        return record;
      });

      const { error: upsertErr } = await supabase.from('stock_audits').upsert(recordsToUpsert as TablesInsert<'stock_audits'>[]);
      if (upsertErr) throw upsertErr;

      alert('Đã lưu thành công! Cột Kho trong phiếu kiểm kê đã được cập nhật.');
      fetchData(selectedDate);
    } catch (err) {
      console.error(err);
      alert('Lỗi: ' + ((err as Error)?.message ?? 'Không xác định'));
    }
    setSaving(false);
  };

  // ── Export Image ─────────────────────────────────────────────────────────────

  const handleExportImage = async (type: ItemType) => {
    const targetRef = type === 'tea' ? teaRef : cakeRef;
    if (!targetRef.current) return;

    try {
      const canvas = await html2canvas(targetRef.current, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const fileName = `Kiem-Ke-${type === 'tea' ? 'Tra' : 'Banh'}-${format(parseISO(selectedDate), 'dd-MM-yyyy')}.png`;
      const link = document.createElement('a');
      link.download = fileName;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      console.error('Lỗi khi xuất ảnh:', err);
      alert('Đã có lỗi xảy ra khi tạo ảnh. Vui lòng thử lại.');
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────────

  const allLots = groups.flatMap(g => g.lots);
  const expiredCount = allLots.filter(l => { const d = daysLeft(l.expiry_date); return d !== null && d < 0; }).length;
  const todayCount = allLots.filter(l => daysLeft(l.expiry_date) === 0).length;
  const warnCount = allLots.filter(l => { const d = daysLeft(l.expiry_date); return d !== null && d > 0 && d <= 2; }).length;

  const teaGroups = groups.filter(g => g.item_type === 'tea');
  const cakeGroups = groups.filter(g => g.item_type === 'cake');

  // ── Render section as a single merged-cell table ───────────────────────────────

  const renderTable = (type: ItemType, sectionGroups: IngredientGroup[]) => {
    if (sectionGroups.length === 0) return null;
    const isTea = type === 'tea';

    return (
      <div 
        ref={isTea ? teaRef : cakeRef}
        className={`rounded-lg border shadow-sm mb-8 ${isTea ? 'border-slate-300' : 'border-amber-300'} overflow-hidden bg-white`}
      >
        {/* Section title bar */}
        <div className={`px-4 py-2 flex items-center justify-between ${isTea ? 'bg-slate-50 border-b border-slate-300' : 'bg-amber-50 border-b border-amber-300'}`}>
          <div className="flex items-center gap-2">
            <span className={`font-black text-[13px] tracking-tight ${isTea ? 'text-slate-700' : 'text-amber-800'}`}>
              {isTea ? '📊 BẢNG KIỂM TRÀ' : '📊 BẢNG KIỂM BÁNH'}
            </span>
            <span className="text-[11px] text-slate-400 font-medium italic">
              (HSD = {SHELF_LIFE[type]} ngày)
            </span>
          </div>
          
          <button
            onClick={() => handleExportImage(type)}
            data-html2canvas-ignore="true"
            className={`flex items-center gap-1.5 px-3 py-1 rounded border text-[11px] font-bold uppercase transition-all shadow-sm ${
              isTea 
                ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50' 
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
            }`}
          >
            <Camera size={13} />
            Lưu Ảnh Bảng
          </button>
        </div>

        {/* Table container */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse table-fixed bg-white">
            <thead className="bg-slate-100 border-b border-slate-300">
              <tr>
                <th colSpan={2} className="px-3 py-2 text-left font-bold text-slate-700 border-r border-slate-300 w-80">Thông tin sản phẩm</th>
                <th colSpan={2} className="px-3 py-2 text-center font-bold text-slate-700 border-r border-slate-300">Thông tin kiểm kê</th>
                <th className="px-3 py-2 text-center font-bold text-slate-700 w-32 border-r border-slate-300">HSD</th>
                <th className="px-3 py-2 text-center font-bold text-slate-700 w-40">Tình trạng</th>
                <th className="w-8 border-l border-slate-300" data-html2canvas-ignore="true"></th>
              </tr>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-300">
                <th className="px-3 py-1.5 text-center border-r border-slate-200">Tên Nguyên Liệu</th>
                <th className="px-2 py-1.5 text-center border-r border-slate-300 w-16">ĐVT</th>
                <th className="px-2 py-1.5 text-center border-r border-slate-200 w-24">Số lượng</th>
                <th className="px-2 py-1.5 text-center border-r border-slate-300 w-40">Ngày sản xuất</th>
                <th className="border-r border-slate-200"></th>
                <th className=""></th>
                <th className="border-l border-slate-300" data-html2canvas-ignore="true"></th>
              </tr>
            </thead>
            <tbody>
              {sectionGroups.map((group) => {
                const displayLots = [...group.lots];
                while (displayLots.length < MIN_ROWS) {
                  displayLots.push({ ingredient_id: group.ingredient_id, manufacture_date: '', expiry_date: '', quantity: '', notes: '' });
                }
                const rowCount = displayLots.length;

                return displayLots.map((lot, lotIdx) => {
                  const isReal = lotIdx < group.lots.length;
                  const isFirstRow = lotIdx === 0;
                  const isLastRowInGroup = lotIdx === rowCount - 1;
                  const status = isReal ? getStatus(lot, type) : null;
                  const StatusIcon = status?.Icon;
                  const borderClass = isLastRowInGroup ? 'border-b-2 border-slate-300' : 'border-b border-slate-100';

                  return (
                    <tr 
                      key={`${group.ingredient_id}-${lotIdx}`} 
                      className="group/row transition-colors hover:bg-teal-50/40"
                    >
                      {/* Tên NVL */}
                      {isFirstRow && (
                        <>
                          <td
                            rowSpan={rowCount}
                            className={`px-3 py-2 border-r border-slate-200 bg-white align-middle text-center ${borderClass}`}
                          >
                            <div className="flex flex-col items-center justify-center min-h-[2.5rem]">
                              <div className="font-bold text-slate-800 text-[12px] leading-tight">{group.ingredient_name}</div>
                              <button
                                onClick={() => addLot(group.ingredient_id)}
                                className="mt-1 flex items-center gap-1 text-[10px] font-bold text-teal-600 hover:text-teal-800 hover:underline transition-all opacity-40 hover:opacity-100"
                              >
                                <Plus size={10} /> Thêm lô
                              </button>
                            </div>
                          </td>
                          <td rowSpan={rowCount} className={`px-2 py-2 text-center text-slate-500 font-medium border-r border-slate-300 bg-white align-middle w-16 ${borderClass}`}>
                            {group.unit}
                          </td>
                        </>
                      )}

                      {/* Số lượng */}
                      <td className={`px-1 py-1 text-center border-r border-slate-200 ${!isReal ? 'bg-slate-50/20' : ''} ${borderClass}`}>
                        {isReal ? (
                          <input
                            type="number"
                            min="0"
                            value={lot.quantity}
                            onChange={e => updateLot(group.ingredient_id, lotIdx, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full h-8 text-center bg-transparent border-0 focus:ring-1 focus:ring-teal-400 focus:bg-white rounded py-0 font-bold text-slate-800 text-sm outline-none leading-8"
                            placeholder="0"
                          />
                        ) : null}
                      </td>

                      {/* NSX */}
                      <td className={`px-1 py-1 text-center border-r border-slate-300 ${!isReal ? 'bg-slate-50/20' : ''} ${borderClass}`}>
                        {isReal ? (
                          <input
                            type="date"
                            value={lot.manufacture_date}
                            max={today}
                            onChange={e => updateLot(group.ingredient_id, lotIdx, 'manufacture_date', e.target.value)}
                            className="w-full h-8 bg-transparent border-0 focus:ring-1 focus:ring-teal-400 focus:bg-white rounded py-0 text-[11px] text-slate-600 font-medium outline-none text-center leading-8"
                          />
                        ) : null}
                      </td>

                      {/* HSD */}
                      <td className={`px-2 py-1 text-center border-r border-slate-200 ${!isReal ? 'bg-slate-50/20' : ''} ${borderClass}`}>
                        {isReal && lot.expiry_date ? (
                          <div className="h-8 flex items-center justify-center">
                            <span className="text-slate-800 font-bold leading-none">
                              {format(parseISO(lot.expiry_date), 'dd/MM/yy')}
                            </span>
                          </div>
                        ) : null}
                      </td>

                      {/* Tình trạng */}
                      <td className={`px-3 py-1 text-center ${status?.cell ?? ''} ${!isReal ? 'bg-slate-50/20' : ''} ${borderClass}`}>
                        {isReal && status && StatusIcon ? (
                          <div className={`flex items-center justify-center gap-1.5 h-8 text-[11px] font-bold ${status.chip}`}>
                            <StatusIcon size={12} className="shrink-0" />
                            <span className="leading-none">{status.label}</span>
                          </div>
                        ) : null}
                      </td>

                      {/* Xóa */}
                      <td className={`px-1 py-1 text-center border-l border-slate-100 ${borderClass}`}>
                        {isReal && (
                          <button
                            onClick={() => removeLot(group.ingredient_id, lotIdx)}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-40 hover:opacity-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Kiểm Trà & Bánh</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Ngày kiểm: <span className="font-bold text-teal-600">{format(parseISO(selectedDate), 'dd/MM/yyyy')}</span> · 
            Tự động load từ <span className="font-bold text-gray-600">"{CATEGORY_NAME}"</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={() => fetchData(selectedDate)}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 bg-white shadow-sm transition-all whitespace-nowrap"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Tải lại
          </button>

          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl font-black text-xs shadow-lg hover:bg-teal-700 disabled:opacity-50 transition-all active:scale-95 whitespace-nowrap"
          >
            <Save size={16} />
            {saving ? 'Đang lưu...' : 'Lưu Kiểm'}
          </button>
        </div>
      </div>

      {/* Warning badges */}
      {(expiredCount > 0 || todayCount > 0 || warnCount > 0) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
              <XCircle size={15} className="text-red-500" />
              <span className="text-sm font-bold text-red-700">{expiredCount} lô đã hết hạn</span>
            </div>
          )}
          {todayCount > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2">
              <AlertCircle size={15} className="text-orange-500" />
              <span className="text-sm font-bold text-orange-700">{todayCount} lô hết hạn hôm nay</span>
            </div>
          )}
          {warnCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
              <AlertTriangle size={15} className="text-amber-500" />
              <span className="text-sm font-bold text-amber-700">{warnCount} lô sắp hết hạn (≤ 2 ngày)</span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-gray-300" />
          Đang tải danh sách...
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <p className="font-bold text-gray-500 mb-1">Không tìm thấy nguyên liệu nào</p>
          <p className="text-sm text-gray-400">Kiểm tra danh mục <strong>"{CATEGORY_NAME}"</strong> trong phần Quản lý Nguyên Liệu.</p>
        </div>
      ) : (
        <>
          {renderTable('tea', teaGroups)}
          {renderTable('cake', cakeGroups)}
        </>
      )}

      {/* Legend */}
      {!loading && groups.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5">Chú giải tình trạng</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-gray-500">
            <div>
              <p className="font-bold text-gray-600 mb-1.5">🍵 Trà — NSX + 5 ngày</p>
              <ul className="space-y-1">
                <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> Còn &gt; 2 ngày → <strong className="text-emerald-700">Ok</strong></li>
                <li className="flex items-center gap-2"><FlaskConical size={12} className="text-teal-500 shrink-0" />    Còn 2 ngày → <strong className="text-teal-700">Test</strong></li>
                <li className="flex items-center gap-2"><AlertTriangle size={12} className="text-amber-500 shrink-0" />  Còn 1 ngày → <strong className="text-amber-700">AM/QC Test</strong></li>
                <li className="flex items-center gap-2"><AlertCircle size={12} className="text-red-500 shrink-0" />     Còn 0 ngày → <strong className="text-red-600">Hủy - Hết hạn hôm nay</strong></li>
                <li className="flex items-center gap-2"><XCircle size={12} className="text-red-500 shrink-0" />     Quá hạn → <strong className="text-red-600">Đã hết hạn/Hủy</strong></li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-gray-600 mb-1.5">🍰 Bánh — NSX + 2 ngày</p>
              <ul className="space-y-1">
                <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> Còn &gt; 0 ngày → <strong className="text-emerald-700">Ok</strong></li>
                <li className="flex items-center gap-2"><AlertCircle size={12} className="text-red-500 shrink-0" />     Còn 0 ngày → <strong className="text-red-600">Hủy - Hết hạn hôm nay</strong></li>
                <li className="flex items-center gap-2"><XCircle size={12} className="text-red-500 shrink-0" />     Quá hạn → <strong className="text-red-600">Đã hết hạn/Hủy</strong></li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};