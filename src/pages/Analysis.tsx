import { useState, useEffect } from 'react';
import { useFacility } from '../contexts/FacilityContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { format, subDays } from 'date-fns';
import { RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConsumptionSource = 'sales' | 'audit_diff';

interface AnalysisRow {
  name: string;
  unit: string;
  qty: number;
  source: ConsumptionSource;
}

// ─── Periods ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7 ngày', days: 7 },
  { label: '14 ngày', days: 14 },
  { label: '30 ngày', days: 30 },
  { label: '60 ngày', days: 60 },
];

const SOURCE_COLOR: Record<ConsumptionSource, string> = {
  sales: '#8b5cf6',  // purple
  audit_diff: '#557A61',  // forest
};

const SOURCE_LABEL: Record<ConsumptionSource, string> = {
  sales: 'Bán hàng (SALES_USAGE + WASTE)',
  audit_diff: 'Chênh lệch kiểm kê hàng ngày',
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as AnalysisRow;
  return (
    <div className="bg-gray-800 text-white p-3 rounded-lg shadow-xl text-sm min-w-[200px]">
      <p className="font-bold mb-1.5 border-b border-gray-600 pb-1.5">{d.name}</p>
      <p className="text-gray-200">
        Tiêu hao: <span className="font-bold text-white">{d.qty.toFixed(2)} {d.unit}</span>
      </p>
      <p className="text-gray-400 text-xs mt-1">
        Nguồn: <span className="text-gray-300">{SOURCE_LABEL[d.source]}</span>
      </p>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Analysis() {
  const { facilityClient: supabase } = useFacility();
  const [periodDays, setPeriodDays] = useState(30);
  const [data, setData] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnalysis = async (days: number) => {
    setLoading(true);
    try {
      const fromStr = format(subDays(new Date(), days), 'yyyy-MM-dd');
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      // ── 1. SALES_USAGE + WASTE, lọc theo transaction_date ────────────────────
      // Note: Supabase enforces a 1000-row server cap; .limit(10000) pushes to max allowed
      const { data: txData } = await supabase
        .from('stock_transactions')
        .select('ingredient_id, quantity, ingredients(name, unit)')
        .in('type', ['SALES_USAGE', 'WASTE', 'WASTE_SYSTEM'])
        .gte('transaction_date', fromStr)
        .lte('transaction_date', todayStr)
        .order('transaction_date', { ascending: true })
        .limit(10000);

      // ── 2. Stock audits trong kỳ để tính chênh lệch ──────────────────────────
      const { data: auditData } = await supabase
        .from('stock_audits')
        .select('ingredient_id, actual_stock, audit_date, ingredients(name, unit)')
        .gte('audit_date', fromStr)
        .lte('audit_date', todayStr)
        .order('audit_date', { ascending: true })
        .limit(10000);

      // ── Tổng SALES_USAGE + WASTE theo ingredient ──────────────────────────────
      const salesMap: Record<string, { name: string; unit: string; qty: number }> = {};
      (txData ?? []).forEach((tx: any) => {
        if (!tx.ingredient_id || !tx.ingredients) return;
        if (!salesMap[tx.ingredient_id]) {
          salesMap[tx.ingredient_id] = {
            name: tx.ingredients.name,
            unit: tx.ingredients.unit,
            qty: 0,
          };
        }
        salesMap[tx.ingredient_id].qty += Math.abs(tx.quantity);
      });

      // ── Chênh lệch kiểm kê theo ingredient (chỉ cho NVL không có SALES_USAGE) ─
      const auditDiffMap: Record<string, { name: string; unit: string; qty: number }> = {};
      if (auditData) {
        // Group theo ingredient
        const byIng: Record<string, { name: string; unit: string; entries: { date: string; stock: number }[] }> = {};
        auditData.forEach((a: any) => {
          if (!a.ingredient_id || a.actual_stock === null || !a.ingredients) return;
          if (!byIng[a.ingredient_id]) {
            byIng[a.ingredient_id] = {
              name: a.ingredients.name,
              unit: a.ingredients.unit,
              entries: [],
            };
          }
          byIng[a.ingredient_id].entries.push({ date: a.audit_date, stock: a.actual_stock });
        });

        Object.entries(byIng).forEach(([ingId, ing]) => {
          // Bỏ qua nếu đã có SALES_USAGE
          if (salesMap[ingId]) return;

          let totalDrop = 0;
          for (let i = 1; i < ing.entries.length; i++) {
            const diff = ing.entries[i - 1].stock - ing.entries[i].stock;
            if (diff > 0) totalDrop += diff;
          }

          if (totalDrop > 0) {
            auditDiffMap[ingId] = { name: ing.name, unit: ing.unit, qty: totalDrop };
          }
        });
      }

      // ── Merge và sort ─────────────────────────────────────────────────────────
      const merged: AnalysisRow[] = [
        ...Object.values(salesMap).map(v => ({ ...v, source: 'sales' as ConsumptionSource })),
        ...Object.values(auditDiffMap).map(v => ({ ...v, source: 'audit_diff' as ConsumptionSource })),
      ]
        .filter(r => r.qty > 0)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 20); // top 20

      setData(merged);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAnalysis(periodDays); }, [periodDays]);

  return (
    <div className="container-fluid py-3 py-md-4">
      {/* Header */}
      <div className="row align-items-center mb-4 g-3">
        <div className="col-12 col-md-auto me-auto">
          <h1 className="h3 fw-black text-dark mb-1">PHÂN TÍCH TIÊU HAO</h1>
          <p className="text-secondary small mb-0">Top 20 nguyên liệu tiêu hao nhiều nhất.</p>
        </div>
        <div className="col-12 col-md-auto">
          <button
            onClick={() => fetchAnalysis(periodDays)}
            disabled={loading}
            className="btn btn-outline-secondary btn-sm px-4 rounded-pill d-flex align-items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Tải lại
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="rounded-3 mb-4 p-3" style={{ background: '#F0EDE4', border: '1px solid #DDD9CE' }}>
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-auto">
            <span className="small fw-semibold text-secondary text-uppercase tracking-wider">Khoảng thời gian:</span>
          </div>
          <div className="col-12 col-md-auto">
            <div className="btn-group btn-group-sm">
              {PERIODS.map(p => (
                <button
                  key={p.days}
                  onClick={() => setPeriodDays(p.days)}
                  className={`btn px-3 fw-bold ${periodDays === p.days
                    ? 'btn-primary'
                    : 'btn-outline-secondary bg-white'
                    }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="col-12 col-md-auto">
            <span className="small text-secondary fw-medium">
              ({format(subDays(new Date(), periodDays), 'dd/MM')} – {format(new Date(), 'dd/MM/yyyy')})
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="row g-2 mb-4">
        {(Object.entries(SOURCE_LABEL) as [ConsumptionSource, string][]).map(([key, label]) => (
          <div key={key} className="col-12 col-md-auto">
            <div className="d-flex align-items-center gap-2 p-2 bg-white border rounded shadow-sm">
              <span className="rounded-circle shadow-sm" style={{ width: '12px', height: '12px', backgroundColor: SOURCE_COLOR[key], display: 'inline-block' }} />
              <span className="text-muted" style={{ fontSize: '11px' }}>{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
        <div className="card-header bg-white border-0 pt-4 px-4 pb-0">
          <h5 className="fw-bold text-dark mb-1">
            Top {data.length} Tiêu Hao
            <span className="ms-2 small fw-normal text-muted">({periodDays} ngày)</span>
          </h5>
          <hr className="bg-light" />
        </div>
        <div className="card-body p-2 p-md-4">
          {loading ? (
            <div className="py-5 text-center text-muted">
              <RefreshCw size={40} className="animate-spin text-secondary opacity-50 mb-3" />
              <p>Đang phân tích dữ liệu...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="py-5 text-center text-muted">
              <p className="mb-0">Chưa có đủ dữ liệu giao dịch để phân tích.</p>
            </div>
          ) : (
            <div style={{ height: Math.max(400, data.length * 45), minWidth: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={150}
                    tick={{ fontSize: 11, fontWeight: 'bold' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="qty" name="Tiêu hao" radius={[0, 50, 50, 0]} barSize={25}>
                    {data.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={SOURCE_COLOR[entry.source]}
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        {!loading && data.length > 0 && (
          <div className="card-footer bg-light border-0 py-3 px-4">
            <p className="small text-muted mb-0 lh-base" style={{ fontSize: '10px' }}>
              <span className="me-3"><strong className="text-dark">Bán hàng:</strong> SALES_USAGE + WASTE</span>
              <span className="me-3"><strong className="text-dark">Chênh lệch:</strong> Σ(tồn giảm) cho các NVL không có SALES_USAGE</span>
              <span className="text-danger fw-bold">· OUT không tính vào tiêu hao</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}