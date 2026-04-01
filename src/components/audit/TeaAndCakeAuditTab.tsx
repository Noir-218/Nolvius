import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Plus, Trash2, Save,
  CheckCircle2, AlertTriangle, AlertCircle,
  XCircle, FlaskConical, Clock, RefreshCw,
} from 'lucide-react';
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
  if (d === 2) return { label: 'Test', Icon: FlaskConical, chip: 'text-sky-700 font-bold', cell: 'bg-sky-50' };
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
const MIN_ROWS = 3; // mỗi ingredient luôn hiển thị ít nhất 3 dòng

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

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  const fetchData = async (date: string) => {
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
        .from('tea_cake_audits' as any)
        .select('*')
        .eq('audit_date', date)
        .order('created_at', { ascending: true });

      const ids: string[] = [];

      const builtGroups: IngredientGroup[] = (ingData as any[]).map((ing: any) => {
        const type = detectType(ing.name);
        const savedLots = savedData
          ? (savedData as any[]).filter(r => r.ingredient_id === ing.id)
          : [];

        let lots: AuditLot[];
        if (savedLots.length > 0) {
          lots = savedLots.map((r: any) => {
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
  };

  useEffect(() => { fetchData(selectedDate); }, [selectedDate]);

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

  const updateLot = (ingId: string, lotIdx: number, field: keyof AuditLot, value: any) => {
    setGroups(prev => prev.map(g => {
      if (g.ingredient_id !== ingId) return g;
      return {
        ...g,
        lots: g.lots.map((lot, i) => {
          if (i !== lotIdx) return lot;
          const updated = { ...lot, [field]: value };
          if (field === 'manufacture_date') updated.expiry_date = calcExpiry(value, g.item_type);
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
        await supabase.from('tea_cake_audits' as any).delete().in('id', savedIds);
      }
      
      const { error: teaErr } = await supabase.from('tea_cake_audits' as any).insert(
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

      const existingMap: Record<string, any> = {};
      if (existingAudits) existingAudits.forEach((a: any) => { existingMap[a.ingredient_id] = a; });

      // 2.2 Fetch prior stock (for opening calculation if not exists)
      const startOfThisMonth = selectedDate.slice(0, 8) + '01';
      const { data: priorAudits } = await supabase
        .from('stock_audits')
        .select('ingredient_id, actual_stock')
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

      // 2.3 Fetch monthly opening
      const { data: monthlyData } = await supabase
        .from('monthly_opening_stock')
        .select('ingredient_id, opening_stock')
        .eq('year_month', selectedDate.slice(0, 7));
      
      const monthlyMap: Record<string, number> = {};
      if (monthlyData) monthlyData.forEach((m: any) => { monthlyMap[m.ingredient_id] = m.opening_stock ?? 0; });

      // 2.4 Fetch transactions for theoretical
      const { data: txData } = await supabase
        .from('stock_transactions')
        .select('ingredient_id, type, quantity')
        .eq('transaction_date', selectedDate)
        .in('ingredient_id', ingIds);

      const txSummary: Record<string, { in: number, out: number }> = {};
      if (txData) {
        txData.forEach((tx: any) => {
          if (!tx.ingredient_id) return;
          if (!txSummary[tx.ingredient_id]) txSummary[tx.ingredient_id] = { in: 0, out: 0 };
          const qty = Math.abs(Number(tx.quantity));
          if (['IN', 'IN_TRANSFER'].includes(tx.type)) txSummary[tx.ingredient_id].in += qty;
          else if (['OUT', 'WASTE', 'SALES_USAGE'].includes(tx.type)) txSummary[tx.ingredient_id].out += qty;
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

        const record: any = {
          ingredient_id: g.ingredient_id,
          audit_date: selectedDate,
          stock_in_store: storeQty,
          stock_in_counter: counter,
          actual_stock: actual ?? theoretical, // Tránh null actual_stock nếu bảng yêu cầu non-null
          opening_stock: opening,
          theoretical_stock: theoretical,
          notes: existing?.notes ?? '',
          audited_by: user?.id,
        };
        if (existing?.id) record.id = existing.id;
        return record;
      });

      const { error: upsertErr } = await supabase.from('stock_audits').upsert(recordsToUpsert);
      if (upsertErr) throw upsertErr;

      alert('Đã lưu thành công! Cột Kho trong phiếu kiểm kê đã được cập nhật.');
      fetchData(selectedDate);
    } catch (err: any) {
      alert('Lỗi: ' + (err?.message ?? 'Không xác định'));
    }
    setSaving(false);
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
      <div className={`rounded-xl border shadow-sm mb-5 ${isTea ? 'border-teal-200' : 'border-amber-200'} overflow-hidden`}>
        {/* Section title bar */}
        <div className={`px-5 py-2.5 flex items-center gap-3 ${isTea ? 'bg-teal-50 border-b border-teal-200' : 'bg-amber-50 border-b border-amber-200'}`}>
          <span className={`font-black text-sm ${isTea ? 'text-teal-800' : 'text-amber-800'}`}>
            {isTea ? '🍵 TRÀ' : '🍰 BÁNH'}
          </span>
          <span className="text-xs text-gray-400">· HSD = NSX + {SHELF_LIFE[type]} ngày · {sectionGroups.length} loại</span>
        </div>

        {/* Table container with overflow */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="min-w-full text-sm border-collapse bg-white">
            <thead>
              <tr className="border-b-2 border-gray-300 bg-gray-50">
                <th className="px-4 py-2.5 text-center text-xs font-black text-gray-600 uppercase tracking-wider w-72 border-r border-gray-200">
                  Tên {isTea ? 'Trà' : 'Bánh'}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-black text-gray-600 uppercase tracking-wider w-24 border-r border-gray-200">
                  Số Lượng
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-black text-gray-600 uppercase tracking-wider w-36 border-r border-gray-200">
                  NSX
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-black text-gray-600 uppercase tracking-wider w-28 border-r border-gray-200">
                  HSD
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-black text-gray-600 uppercase tracking-wider w-40">
                  Tình Trạng
                </th>
                <th className="w-8 border-l border-gray-200"></th>
              </tr>
            </thead>
            <tbody>
              {sectionGroups.map((group, gIdx) => {
                // Đảm bảo luôn có ít nhất MIN_ROWS dòng (thêm dòng trống padding)
                const displayLots = [...group.lots];
                while (displayLots.length < MIN_ROWS) {
                  displayLots.push({ ingredient_id: group.ingredient_id, manufacture_date: '', expiry_date: '', quantity: '', notes: '' });
                }
                const rowCount = displayLots.length;
                const isLastGroup = gIdx === sectionGroups.length - 1;

                return displayLots.map((lot, lotIdx) => {
                  const isReal = lotIdx < group.lots.length;
                  const isFirstRow = lotIdx === 0;
                  const isLastRow = lotIdx === rowCount - 1;
                  const status = isReal ? getStatus(lot, type) : null;
                  const StatusIcon = status?.Icon;

                  const rowBorderBottom = isLastRow && !isLastGroup
                    ? 'border-b-2 border-gray-300'
                    : 'border-b border-gray-100';

                  return (
                    <tr key={`${group.ingredient_id}-${lotIdx}`} className={`group/row transition-colors ${rowBorderBottom} ${status?.cell ?? ''}`}>

                      {/* Tên NVL — gộp ô theo ingredient */}
                      {isFirstRow && (
                        <td
                          rowSpan={rowCount}
                          className="px-4 py-3 text-center border-r border-gray-200 align-middle bg-white"
                          style={{ borderBottom: isLastGroup ? undefined : '2px solid #d1d5db' }}
                        >
                          <div className="font-bold text-gray-800 text-sm leading-tight whitespace-nowrap">{group.ingredient_name}</div>
                          {/* Nút thêm lô */}
                          <button
                            onClick={() => addLot(group.ingredient_id)}
                            className="mt-2 flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded-md transition-all mx-auto"
                          >
                            <Plus size={11} /> Thêm lô
                          </button>
                        </td>
                      )}

                      {/* Số lượng */}
                      <td className="px-3 py-2 text-center border-r border-gray-200">
                        {isReal ? (
                          <input
                            type="number"
                            min="0"
                            placeholder=""
                            value={lot.quantity}
                            onChange={e => updateLot(group.ingredient_id, lotIdx, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-16 text-center border border-gray-200 rounded-md px-1.5 py-1 text-sm font-bold focus:outline-none focus:border-blue-400 bg-transparent"
                          />
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>

                      {/* NSX */}
                      <td className="px-3 py-2 text-center border-r border-gray-200">
                        {isReal ? (
                          <input
                            type="date"
                            value={lot.manufacture_date}
                            max={today}
                            onChange={e => updateLot(group.ingredient_id, lotIdx, 'manufacture_date', e.target.value)}
                            className="border border-gray-200 rounded-md px-2 py-1 text-xs font-medium focus:outline-none focus:border-blue-400 bg-transparent w-full"
                          />
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>

                      {/* HSD */}
                      <td className="px-3 py-2 text-center border-r border-gray-200">
                        {isReal && lot.expiry_date ? (
                          <span className="text-sm font-bold text-gray-800">
                            {format(parseISO(lot.expiry_date), 'dd/MM/yyyy')}
                          </span>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>

                      {/* Tình trạng */}
                      <td className={`px-4 py-2 text-center ${status?.cell ?? ''}`}>
                        {isReal && status && StatusIcon ? (
                          <span className={`inline-flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${status.chip}`}>
                            <StatusIcon size={13} />
                            {status.label}
                          </span>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>

                      {/* Xóa */}
                      <td className="px-1 py-2 text-center border-l border-gray-100">
                        {isReal && (
                          <button
                            onClick={() => removeLot(group.ingredient_id, lotIdx)}
                            className="p-1 text-gray-200 hover:text-red-400 hover:bg-red-50 rounded transition-all opacity-0 group-hover/row:opacity-100"
                          >
                            <Trash2 size={13} />
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
            Ngày kiểm: <span className="font-bold text-blue-600">{format(parseISO(selectedDate), 'dd/MM/yyyy')}</span> · 
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
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs shadow-lg hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 whitespace-nowrap"
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
                <li className="flex items-center gap-2"><FlaskConical size={12} className="text-sky-500 shrink-0" />    Còn 2 ngày → <strong className="text-sky-700">Test</strong></li>
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