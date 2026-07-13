import React, { useState, useEffect } from 'react';
import { useFacility } from '../contexts/FacilityContext';
import { X, Calendar, ClipboardList, TrendingDown, AlertCircle, Info } from 'lucide-react';
import { format, parseISO, endOfMonth } from 'date-fns';

interface IngredientLossAnalyzerProps {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  selectedMonth: string;
  selectedClosingDate?: string; // optional closing date
  onClose: () => void;
}

interface AuditLog {
  id: string;
  audit_date: string;
  actual_stock: number;
  theoretical_stock: number;
  variance: number | null;
  notes: string | null;
}

interface TransactionLog {
  id: string;
  type: string;
  quantity: number;
  transaction_date: string;
  notes: string | null;
}

export const IngredientLossAnalyzer: React.FC<IngredientLossAnalyzerProps> = ({
  ingredientId,
  ingredientName,
  unit,
  selectedMonth,
  selectedClosingDate,
  onClose,
}) => {
  const { facilityClient: supabase } = useFacility();
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const parsedDate = parseISO(`${selectedMonth}-01`);
        const monthStart = format(parsedDate, 'yyyy-MM-dd');
        const monthEnd = format(endOfMonth(parsedDate), 'yyyy-MM-dd');
        const effectiveEndDate = selectedClosingDate || monthEnd;

        // 1. Fetch audits for this ingredient up to effectiveEndDate
        const { data: auditData, error: auditErr } = await supabase
          .from('stock_audits')
          .select('id, audit_date, actual_stock, theoretical_stock, variance, notes')
          .eq('ingredient_id', ingredientId)
          .gte('audit_date', monthStart)
          .lte('audit_date', effectiveEndDate)
          .order('audit_date', { ascending: false });

        if (auditErr) throw auditErr;

        // 2. Fetch transactions for this ingredient up to effectiveEndDate
        const { data: txData, error: txErr } = await supabase
          .from('stock_transactions')
          .select('id, type, quantity, transaction_date, notes')
          .eq('ingredient_id', ingredientId)
          .gte('transaction_date', monthStart)
          .lte('transaction_date', effectiveEndDate)
          .order('transaction_date', { ascending: false });

        if (txErr) throw txErr;

        setAudits(auditData || []);
        setTransactions(txData || []);
      } catch (err: any) {
        console.error('Error fetching analysis data:', err);
        setError(err.message || 'Không thể tải dữ liệu phân tích.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ingredientId, selectedMonth, selectedClosingDate]);

  // Statistics
  const negativeAudits = audits.filter(a => {
    const v = (a.variance !== null) ? a.variance : (a.actual_stock - a.theoretical_stock);
    return v < -0.001;
  });

  const totalVariance = audits.reduce((sum, a) => {
    const v = (a.variance !== null) ? a.variance : (a.actual_stock - a.theoretical_stock);
    return sum + v;
  }, 0);

  const totalWaste = transactions
    .filter(t => t.type === 'WASTE' || t.type === 'WASTE_SYSTEM')
    .reduce((sum, t) => sum + Math.abs(t.quantity), 0);

  const getTxBadge = (type: string) => {
    switch (type) {
      case 'IN':
        return { label: 'Nhập kho', color: 'bg-green-50 text-green-700 border-green-100' };
      case 'OUT':
        return { label: 'Xuất kho', color: 'bg-amber-50 text-amber-700 border-amber-100' };
      case 'IN_TRANSFER':
        return { label: 'Nhận chuyển kho', color: 'bg-teal-50 text-teal-700 border-teal-100' };
      case 'OUT_TRANSFER':
        return { label: 'Chuyển kho đi', color: 'bg-orange-50 text-orange-700 border-orange-100' };
      case 'WASTE':
        return { label: 'Hủy hàng', color: 'bg-red-50 text-red-700 border-red-100 font-extrabold' };
      case 'WASTE_SYSTEM':
        return { label: 'Hủy hệ quầy', color: 'bg-red-50 text-red-700 border-red-100 font-extrabold' };
      case 'SALES_USAGE':
        return { label: 'Bao tiêu bán hàng', color: 'bg-sky-50 text-sky-700 border-sky-100' };
      default:
        return { label: type, color: 'bg-gray-50 text-gray-700 border-gray-100' };
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate__animated animate__fadeIn p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh] premium-shadow animate__animated animate__zoomIn animate__faster">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-5 text-white flex justify-between items-center shadow-md shrink-0">
          <div>
            <h5 className="font-extrabold text-base tracking-wide uppercase mb-0 flex items-center gap-2">
              <ClipboardList size={20} /> Đối Soát Hao Hụt & Kiểm Kho Chi Tiết
            </h5>
            <p className="text-xs text-teal-100 font-bold tracking-widest mt-1 mb-0 uppercase">
              {ingredientName} ({unit}) • Tháng {selectedMonth}
              {selectedClosingDate && (
                <span className="ms-2 bg-amber-400/30 text-amber-100 px-2 py-0.5 rounded-lg text-[10px] font-black">
                  ⚡ Chốt đến {format(parseISO(selectedClosingDate), 'dd/MM/yyyy')}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl text-teal-100 hover:text-white transition-all"
            title="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="spinner-border text-teal-500 mb-4" role="status"></div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Đang kết xuất dữ liệu đối soát...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3 text-red-600 text-sm">
              <AlertCircle className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Lỗi tải dữ liệu:</span> {error}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* SUMMARY CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Discrepancy Card */}
                <div className={`p-4 bg-white rounded-2xl border-l-4 shadow-sm ${totalVariance < -0.001 ? 'border-red-500' : 'border-teal-500'}`}>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Chênh lệch lũy kế</p>
                  <div className="flex items-baseline gap-1">
                    <h3 className={`font-black text-2xl mb-0 ${totalVariance < -0.001 ? 'text-red-600' : 'text-teal-600'}`}>
                      {totalVariance > 0.001 ? '+' : ''}{totalVariance.toLocaleString()}
                    </h3>
                    <span className="text-xs font-black text-gray-400 uppercase">{unit}</span>
                  </div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">
                    {totalVariance < -0.001 ? 'Phát sinh hao hụt trong tháng' : 'Cân đối kho ổn định'}
                  </p>
                </div>

                {/* Number of Negative Audits Card */}
                <div className="p-4 bg-white rounded-2xl border-l-4 border-amber-500 shadow-sm">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Số lần lệch âm (Hao hụt)</p>
                  <div className="flex items-baseline gap-1">
                    <h3 className="font-black text-2xl text-amber-600 mb-0">
                      {negativeAudits.length}
                    </h3>
                    <span className="text-xs font-black text-gray-400 uppercase">Lần</span>
                  </div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">
                    Số đợt kiểm kho phát hiện thiếu hụt
                  </p>
                </div>

                {/* Total Waste Transactions Card */}
                <div className="p-4 bg-white rounded-2xl border-l-4 border-red-400 shadow-sm">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Lượng hủy hàng (Waste)</p>
                  <div className="flex items-baseline gap-1">
                    <h3 className="font-black text-2xl text-red-600 mb-0">
                      {totalWaste.toLocaleString()}
                    </h3>
                    <span className="text-xs font-black text-gray-400 uppercase">{unit}</span>
                  </div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">
                    Hủy hàng do hỏng, hết hạn, sự cố
                  </p>
                </div>
              </div>

              {/* DETAILED TABLES */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AUDIT LOGS TIMELINE */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="bg-gray-50/70 px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <TrendingDown className="text-teal-600" size={16} />
                    <h6 className="font-black text-xs uppercase tracking-wider text-gray-700 mb-0">
                      Lịch sử chênh lệch kiểm kê
                    </h6>
                  </div>

                  <div className="p-4 overflow-y-auto max-h-[380px] space-y-4">
                    {audits.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs font-bold uppercase">
                        Không có dữ liệu kiểm kho trong tháng
                      </div>
                    ) : (
                      audits.map((a) => {
                        const varianceVal = a.variance !== null ? a.variance : (a.actual_stock - a.theoretical_stock);
                        const isNegative = varianceVal < -0.001;

                        return (
                          <div
                            key={a.id}
                            className={`p-3 rounded-xl border transition-all ${
                              isNegative ? 'bg-red-50/30 border-red-100' : 'bg-gray-50/50 border-gray-100'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-black text-gray-700 flex items-center gap-1.5">
                                <Calendar size={13} className="text-gray-400" />
                                {format(parseISO(a.audit_date), 'dd/MM/yyyy')}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                                  isNegative
                                    ? 'bg-red-50 text-red-600 border-red-100'
                                    : 'bg-green-50 text-green-600 border-green-100'
                                }`}
                              >
                                {isNegative ? '⚠️ Hao hụt' : '✅ Đủ'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center bg-white p-2 rounded-lg border border-gray-100/50">
                              <div>
                                <span className="text-[9px] text-gray-400 font-bold uppercase block">Sổ sách</span>
                                <span className="text-xs font-bold text-gray-600">{a.theoretical_stock.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-gray-400 font-bold uppercase block">Thực tế</span>
                                <span className="text-xs font-black text-gray-800">{a.actual_stock.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-gray-400 font-bold uppercase block">Chênh lệch</span>
                                <span className={`text-xs font-black ${isNegative ? 'text-red-600' : 'text-teal-600'}`}>
                                  {varianceVal > 0.001 ? '+' : ''}
                                  {varianceVal.toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {a.notes && (
                              <div className="mt-2 text-[10px] text-gray-500 bg-white/70 p-1.5 rounded border border-gray-100 flex items-start gap-1">
                                <Info size={11} className="shrink-0 mt-0.5 text-gray-400" />
                                <span>Ghi chú: {a.notes}</span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* RELATED TRANSACTIONS */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="bg-gray-50/70 px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                    <Calendar className="text-teal-600" size={16} />
                    <h6 className="font-black text-xs uppercase tracking-wider text-gray-700 mb-0">
                      Nhật ký giao dịch chi tiết
                    </h6>
                  </div>

                  <div className="p-4 overflow-y-auto max-h-[380px] space-y-3">
                    {transactions.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs font-bold uppercase">
                        Không có giao dịch nào trong tháng
                      </div>
                    ) : (
                      transactions.map((t) => {
                        const badge = getTxBadge(t.type);
                        const isMinus = ['OUT', 'OUT_TRANSFER', 'WASTE', 'WASTE_SYSTEM', 'SALES_USAGE'].includes(t.type);
                        const qtyText = `${isMinus ? '-' : '+'}${Math.abs(t.quantity).toLocaleString()}`;

                        return (
                          <div
                            key={t.id}
                            className="p-2.5 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-between gap-3"
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                {format(parseISO(t.transaction_date), 'dd/MM/yyyy')}
                              </span>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase ${badge.color}`}>
                                  {badge.label}
                                </span>
                                {t.notes && (
                                  <span className="text-[10px] text-gray-400 truncate max-w-[150px]" title={t.notes}>
                                    {t.notes}
                                  </span>
                                )}
                              </div>
                            </div>

                            <span className={`text-xs font-black shrink-0 ${isMinus ? 'text-amber-600' : 'text-teal-600'}`}>
                              {qtyText} <small className="text-[9px] text-gray-400 font-normal uppercase">{unit}</small>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="bg-gray-50 p-4 border-t border-gray-100 text-center shrink-0">
          <p className="text-[10px] text-gray-400 font-bold uppercase mb-0">
            💡 Gợi ý: Hãy đối chiếu ngày phát sinh <strong className="text-red-500">hao hụt âm</strong> ở bảng trái với lịch sử <strong className="text-red-500">hủy hàng</strong> hoặc nhập/xuất tương ứng ở bảng phải.
          </p>
        </div>
      </div>
    </div>
  );
};
