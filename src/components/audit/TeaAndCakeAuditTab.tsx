import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tables, TablesInsert, TablesUpdate } from '../../types/database.types';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
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
  chip: string;   // text classes
  cell: string;   // full cell background class
}

const TEA_STATUS = (d: number | null): StatusCfg => {
  if (d === null) return { label: '—', Icon: Clock, chip: 'text-slate-400 font-bold', cell: 'bg-[#cfe2f3]' };
  if (d > 2) return { label: 'Ok', Icon: CheckCircle2, chip: 'text-emerald-800 font-extrabold text-[12px]', cell: 'bg-[#cfe2f3]' };
  if (d === 2) return { label: 'Test/Điều chuyển', Icon: FlaskConical, chip: 'text-amber-800 font-extrabold text-[12px]', cell: 'bg-[#ffe599]' };
  if (d === 1) return { label: 'AM/QC Test', Icon: AlertTriangle, chip: 'text-red-800 font-extrabold text-[12px]', cell: 'bg-[#f4c7c3]' };
  if (d === 0) return { label: 'Cút luôn - Hết hạn hôm nay', Icon: AlertCircle, chip: 'text-white font-extrabold text-[12px]', cell: 'bg-[#cc0000]' };
  return { label: 'Cút luôn - Quá hạn', Icon: XCircle, chip: 'text-white font-extrabold text-[12px]', cell: 'bg-[#cc0000]' };
};

const CAKE_STATUS = (d: number | null): StatusCfg => {
  if (d === null) return { label: '—', Icon: Clock, chip: 'text-slate-400 font-bold', cell: 'bg-[#cfe2f3]' };
  if (d > 0) return { label: 'Ok', Icon: CheckCircle2, chip: 'text-emerald-800 font-extrabold text-[12px]', cell: 'bg-[#cfe2f3]' };
  if (d === 0) return { label: 'Hết hạn ngay', Icon: AlertCircle, chip: 'text-white font-extrabold text-[12px]', cell: 'bg-[#cc0000]' };
  return { label: 'Đã hết hạn', Icon: XCircle, chip: 'text-white font-extrabold text-[12px]', cell: 'bg-[#cc0000]' };
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

interface Props {
  selectedDate: string;
}

export const TeaAndCakeAuditTab: React.FC<Props> = ({ selectedDate }) => {
  const { user } = useAuth();
  const today = todayStr();

  const [editingMfg, setEditingMfg] = useState<{ ingId: string, lotIdx: number } | null>(null);
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

  // Sync real-time for tea_cake_audits
  useEffect(() => {
    const channel = supabase
      .channel('tea-cake-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tea_cake_audits',
          filter: `audit_date=eq.${selectedDate}`
        },
        () => {
          // Khi có bất kỳ thay đổi nào từ người khác, ta tải lại dữ liệu nhẹ nhàng
          // để đồng bộ danh sách lô (tránh việc lưu đè mất lô của nhau)
          fetchData(selectedDate);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, fetchData]);

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
    if (allLotsToSave.length === 0) { toast.error('Vui lòng nhập ít nhất 1 NSX!'); return; }

    setSaving(true);
    try {
      const currentIds = allLotsToSave.map(l => l.id).filter(Boolean) as string[];
      // Chỉ xóa những lô vốn dĩ thuộc về tab này (savedIds) nhưng không còn trong allLotsToSave
      // ĐỪNG xóa những lô mới mà người khác vừa thêm (có trong latestTeaIds nhưng không có trong savedIds)
      const idsToDelete = savedIds.filter(id => !currentIds.includes(id));
      
      if (idsToDelete.length > 0) {
        const { error: delErr } = await supabase.from('tea_cake_audits').delete().in('id', idsToDelete);
        if (delErr) console.warn('Cảnh báo: Không thể dọn dẹp một số bản ghi cũ:', delErr);
      }
      
      const { error: teaErr } = await supabase.from('tea_cake_audits').upsert(
        allLotsToSave.map(l => ({
          id: l.id || crypto.randomUUID(),
          audit_date: selectedDate,
          item_type: l.item_type,
          ingredient_id: l.ingredient_id,
          manufacture_date: l.manufacture_date,
          expiry_date: l.expiry_date,
          quantity: l.quantity === '' ? null : (Number(l.quantity) || 0),
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
            priorActualMap[a.ingredient_id] = Number(a.actual_stock) || 0;
          }
        });
      }

      // 2.3 Fetch monthly opening
      const { data: monthlyData } = await supabase
        .from('monthly_opening_stock')
        .select('ingredient_id, opening_stock')
        .eq('year_month', selectedDate.slice(0, 7));
      
      const monthlyMap: Record<string, number> = {};
      if (monthlyData) monthlyData.forEach((m) => { monthlyMap[m.ingredient_id] = Number(m.opening_stock) || 0; });

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
            const qty = Math.abs(Number(tx.quantity)) || 0;
            if (['IN', 'IN_TRANSFER'].includes(tx.type)) txSummary[tx.ingredient_id].in += qty;
            else if (['OUT', 'WASTE', 'SALES_USAGE'].includes(tx.type)) txSummary[tx.ingredient_id].out += qty;
          }
        });
      }

      // 2.5 Build and Save Records
      const recordsToUpsert = groups.map(g => {
        // TẢI LẠI existing ngay tại đây để có con số Counter mới nhất (trường hợp có người vừa nhập bên Tab Daily)
        const existing = existingMap[g.ingredient_id];
        
        // Theo yêu cầu: nếu để trống thì cập nhật là trống
        const isAudited = g.lots.some(l => l.quantity !== '');
        const storeQty = isAudited 
          ? g.lots.reduce((sum, l) => sum + (l.quantity === '' ? 0 : Number(l.quantity)), 0)
          : null;

        // Tính opening
        let opening = Number(existing?.opening_stock);
        if (existing?.opening_stock === undefined || existing?.opening_stock === null) {
          if (selectedDate.slice(8, 10) !== '01' && priorActualMap[g.ingredient_id] !== undefined) {
            opening = priorActualMap[g.ingredient_id];
          } else {
            opening = monthlyMap[g.ingredient_id] ?? 0;
          }
        }
        opening = Number(opening) || 0;

        // Tính theoretical
        const tx = txSummary[g.ingredient_id] || { in: 0, out: 0 };
        const theoretical = Number(opening + (Number(tx.in) || 0) - (Number(tx.out) || 0)) || 0;

        // Lấy con số Counter mới nhất từ DB
        const counter = Number(existing?.stock_in_counter) || 0;
        const actual = storeQty === null ? null : Number(storeQty + counter);

        const record: TablesUpdate<'stock_audits'> = {
          ingredient_id: g.ingredient_id,
          audit_date: selectedDate,
          stock_in_store: storeQty,
          stock_in_counter: counter,
          actual_stock: Number(actual ?? theoretical) || 0,
          opening_stock: opening,
          theoretical_stock: theoretical,
          notes: existing?.notes ?? '',
          audited_by: user?.id,
        };
        return record;
      });

      // Để cực kỳ an toàn, ta dùng upsert nhưng chỉ định rõ không đè lên các trường khác nếu cần?
      // Supabase upsert mặc định đè toàn bộ row. 
      // Nhưng vì ta đã fetch existingMap ngay trước đó (dòng 247), nó khá an toàn.
      const { error: upsertErr } = await supabase.from('stock_audits').upsert(recordsToUpsert as TablesInsert<'stock_audits'>[], { onConflict: 'ingredient_id,audit_date' });
      if (upsertErr) throw upsertErr;

      toast.success('Đã lưu thành công! Cột Kho trong phiếu kiểm kê đã được cập nhật.');
      fetchData(selectedDate);
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi: ' + (err?.message || err?.details || JSON.stringify(err)));
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
      toast.error('Đã có lỗi xảy ra khi tạo ảnh. Vui lòng thử lại.');
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
        className="rounded-none border border-slate-400 mb-8 overflow-hidden bg-white p-3 shadow-md"
        style={{ width: '100%', maxWidth: '890px', margin: '0 auto' }}
      >
        {/* Visual Export Button & Caption */}
        <div className="flex justify-between items-center mb-2 px-1" data-html2canvas-ignore="true">
          <span className="text-[12px] font-bold text-slate-500 tracking-tight uppercase">
            {isTea ? '📊 Bảng tính kiểm trà (HSD = 5 ngày)' : '🍰 Bảng tính kiểm bánh (HSD = 2 ngày)'}
          </span>
          <button
            onClick={() => handleExportImage(type)}
            className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-[11px] font-bold uppercase transition-all shadow-sm text-slate-600 active:scale-95"
          >
            <Camera size={13} />
            Lưu Ảnh Bảng
          </button>
        </div>

        {/* Google Sheets Layout Container */}
        <div className="overflow-x-auto">
          <table className="google-sheets-table">
            <colgroup>
              <col style={{ width: '48px' }} />  {/* Column T: STT */}
              <col style={{ width: '220px' }} /> {/* Column U: Tên trà - NVL */}
              <col style={{ width: '100px' }} /> {/* Column V: Số lượng */}
              <col style={{ width: '130px' }} /> {/* Column W: NSX */}
              <col style={{ width: '140px' }} /> {/* Column X: HSD */}
              <col style={{ width: '200px' }} /> {/* Column Y: Tình trạng */}
              <col style={{ width: '36px' }} data-html2canvas-ignore="true" />  {/* Xóa */}
            </colgroup>
            
            <thead>

              {/* Centered Main Title Row inside Grid */}
              <tr className="h-[40px] bg-white">
                <td colSpan={6} className="text-center font-bold text-black text-[15px] border border-[#bbb] tracking-wide uppercase align-middle bg-white">
                  {isTea ? 'KIỂM KÊ DATE TRÀ - BÁNH TỒN CUỐI NGÀY' : 'KIỂM KÊ DATE BÁNH TỒN CUỐI NGÀY'}
                </td>
                <td className="border border-[#bbb] bg-white" data-html2canvas-ignore="true"></td>
              </tr>

              {/* Metadata Subheader row in Grid */}
              <tr className="h-[32px] bg-white text-[12px] align-middle">
                <td colSpan={2} className="px-3 border border-[#bbb] font-bold text-black text-left bg-white">
                  NGÀY: <span className="text-[#cc0000] ml-1">{format(parseISO(selectedDate), 'dd/MM/yyyy')}</span>
                </td>
                <td colSpan={4} className="px-3 border border-[#bbb] font-bold text-black text-left bg-white">
                  NGƯỜI KIỂM: <span className="text-[#666] font-normal">{user?.email || '........................................................................'}</span>
                </td>
                <td className="border border-[#bbb] bg-white" data-html2canvas-ignore="true"></td>
              </tr>

              {/* Main Headers row */}
              <tr className="bg-white text-[12px] font-bold text-black text-center h-[32px] align-middle">
                <td className="border border-[#bbb] uppercase bg-white">STT</td>
                <td className="border border-[#bbb] uppercase bg-white">TÊN TRÀ - NVL</td>
                <td className="border border-[#bbb] uppercase bg-white">SỐ LƯỢNG</td>
                <td className="border border-[#bbb] uppercase bg-white">NSX</td>
                <td className="border border-[#bbb] uppercase bg-white">HSD</td>
                <td className="border border-[#bbb] uppercase bg-white">TÌNH TRẠNG</td>
                <td className="border border-[#bbb] bg-white" data-html2canvas-ignore="true"></td>
              </tr>
            </thead>

            <tbody>
              {sectionGroups.map((group, groupIdx) => {
                return group.lots.map((lot, lotIdx) => {
                  const isFirstRow = lotIdx === 0;
                  const status = getStatus(lot, type);
                  const StatusIcon = status?.Icon;

                  return (
                    <tr 
                      key={`${group.ingredient_id}-${lotIdx}`} 
                      className="hover:bg-slate-50 transition-colors h-[32px] bg-white"
                    >
                      {/* STT (T) */}
                      <td className="border border-[#bbb] bg-white align-middle text-center font-bold text-slate-800 text-[13px] text-cell">
                        {isFirstRow ? groupIdx + 1 : ''}
                      </td>

                      {/* TÊN TRÀ - NVL (U) */}
                      <td className="border border-[#bbb] bg-white align-middle text-center text-cell">
                        {isFirstRow ? (
                          <div className="flex flex-col items-center justify-center min-h-[3rem] py-1">
                            <div className="font-bold text-slate-900 text-[13px] leading-tight mb-1">{group.ingredient_name} ({group.unit})</div>
                            <button
                              onClick={() => addLot(group.ingredient_id)}
                              className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-800 hover:underline transition-all py-0.5 px-1.5 bg-emerald-50 rounded border border-emerald-100 hover:bg-emerald-100"
                              data-html2canvas-ignore="true"
                            >
                              <Plus size={11} /> Thêm lô
                            </button>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-[11px] font-bold italic py-2">
                            Lô {lotIdx + 1}
                          </div>
                        )}
                      </td>

                      {/* SỐ LƯỢNG (V) */}
                      <td className="border border-[#bbb] bg-white p-0 text-center h-[32px]">
                        <input
                          type="number"
                          min="0"
                          value={lot.quantity}
                          onChange={e => updateLot(group.ingredient_id, lotIdx, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); }}
                          className="sheets-input font-bold text-[13px] text-center"
                          placeholder="0"
                        />
                      </td>

                      {/* NSX (W) */}
                      <td 
                        className="border border-[#bbb] bg-white p-0 text-center h-[32px] cursor-pointer align-middle"
                        onClick={() => {
                          if (!editingMfg || editingMfg.ingId !== group.ingredient_id || editingMfg.lotIdx !== lotIdx) {
                            setEditingMfg({ ingId: group.ingredient_id, lotIdx });
                          }
                        }}
                      >
                        {editingMfg && editingMfg.ingId === group.ingredient_id && editingMfg.lotIdx === lotIdx ? (
                          <input
                            type="date"
                            value={lot.manufacture_date}
                            max={today}
                            autoFocus
                            onBlur={() => setEditingMfg(null)}
                            onChange={e => updateLot(group.ingredient_id, lotIdx, 'manufacture_date', e.target.value)}
                            className="sheets-input text-[12px] text-center font-bold text-slate-700 h-full w-full"
                          />
                        ) : (
                          <div className="font-bold text-[13px] text-slate-800 h-full w-full flex items-center justify-center">
                            {lot.manufacture_date ? format(parseISO(lot.manufacture_date), 'dd/MM/yyyy') : ''}
                          </div>
                        )}
                      </td>

                      {/* HSD (X) - Light blue background as in spreadsheet */}
                      <td className="border border-[#bbb] bg-[#c9daf8] text-center font-bold text-[13px] text-slate-900 h-[32px]">
                        {lot.expiry_date ? (
                          <span>{format(parseISO(lot.expiry_date), 'dd/MM/yyyy')}</span>
                        ) : null}
                      </td>

                      {/* TÌNH TRẠNG (Y) - Filled background with highlighted badge */}
                      <td 
                        className={`border border-[#bbb] text-center font-bold text-[12px] h-[32px] align-middle ${status ? status.cell : 'bg-[#c9daf8]'}`}
                      >
                        {status && StatusIcon ? (
                          <div className={`flex items-center justify-center gap-1.5 h-full w-full py-1 ${status.chip}`}>
                            <StatusIcon size={14} className="shrink-0" />
                            <span className="leading-none">{status.label}</span>
                          </div>
                        ) : null}
                      </td>

                      {/* XÓA LÔ (HTML2Canvas ignored) */}
                      <td className="border border-[#bbb] bg-white text-center p-0 align-middle h-[32px]" data-html2canvas-ignore="true">
                        <button
                          onClick={() => removeLot(group.ingredient_id, lotIdx)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all active:scale-95"
                        >
                          <Trash2 size={13} />
                        </button>
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
        <div className="flex flex-wrap gap-3 mb-5" data-html2canvas-ignore="true">
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
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-2" data-html2canvas-ignore="true">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5">Chú giải tình trạng</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-gray-500">
            <div>
              <p className="font-bold text-gray-600 mb-1.5">🍵 Trà — NSX + 5 ngày</p>
              <ul className="space-y-1">
                <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-[#3c763d] shrink-0" /> Còn &gt; 2 ngày → <strong className="text-emerald-800">Ok</strong> (Nền xanh nhạt)</li>
                <li className="flex items-center gap-2"><FlaskConical size={12} className="text-[#8a6d3b] shrink-0" />    Còn 2 ngày → <strong className="text-amber-800">Test/Điều chuyển</strong> (Nền vàng)</li>
                <li className="flex items-center gap-2"><AlertTriangle size={12} className="text-[#a94442] shrink-0" />  Còn 1 ngày → <strong className="text-red-800">AM/QC Test</strong> (Nền đỏ nhạt)</li>
                <li className="flex items-center gap-2"><AlertCircle size={12} className="text-white shrink-0" />     Còn 0 ngày → <strong className="text-red-600">Cút luôn - Hết hạn hôm nay</strong> (Nền đỏ đậm)</li>
                <li className="flex items-center gap-2"><XCircle size={12} className="text-white shrink-0" />     Quá hạn → <strong className="text-red-600">Cút luôn - Quá hạn</strong> (Nền đỏ đậm)</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-gray-600 mb-1.5">🍰 Bánh — NSX + 2 ngày</p>
              <ul className="space-y-1">
                <li className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500 shrink-0" /> Còn &gt; 0 ngày → <strong className="text-emerald-800">Ok</strong> (Nền xanh nhạt)</li>
                <li className="flex items-center gap-2"><AlertCircle size={12} className="text-white shrink-0" />     Còn 0 ngày → <strong className="text-red-600">Hết hạn ngay</strong> (Nền đỏ đậm)</li>
                <li className="flex items-center gap-2"><XCircle size={12} className="text-white shrink-0" />     Quá hạn → <strong className="text-red-600">Đã hết hạn</strong> (Nền đỏ đậm)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Spreadsheet CSS Styling */}
      <style>{`
        .google-sheets-table {
          border-collapse: collapse !important;
          font-family: 'Arial', sans-serif !important;
          width: 100%;
          table-layout: fixed;
          background-color: white;
        }
        .google-sheets-table th, 
        .google-sheets-table td {
          border: 1px solid #7f7f7f !important;
          height: 32px;
          vertical-align: middle;
          box-sizing: border-box;
        }
        .google-sheets-table .text-cell {
          padding: 4px 8px !important;
        }
        .sheets-input {
          width: 100%;
          height: 100%;
          border: 0 !important;
          background-color: transparent !important;
          outline: none !important;
          box-sizing: border-box;
          padding: 0 4px !important;
          margin: 0 !important;
          border-radius: 0 !important;
        }
        .sheets-input:focus {
          outline: 2px solid #1a73e8 !important;
          outline-offset: -2px !important;
          background-color: white !important;
          z-index: 10;
          position: relative;
        }
        /* Custom date picker input padding adjustment */
        input[type="date"].sheets-input {
          padding-left: 12px !important;
        }
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
      `}</style>
    </div>
  );
};