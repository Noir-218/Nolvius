import { useState, useEffect } from 'react';
import { useFacility } from '../contexts/FacilityContext';
import { ShoppingCart, AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

interface PurchasingItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  needed: number;
}

export default function Dashboard() {
  useAuth();
  const { facilityClient: supabase } = useFacility();
  
  const [items, setItems] = useState<PurchasingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPurchasing = async () => {
      setLoading(true);
      const { data: stocks } = await supabase.from('vw_current_stock' as any).select('*');

      if (stocks) {
        const purchasing = (stocks as any[])
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            unit: s.unit,
            current_stock: s.current_stock || 0,
            min_stock: s.min_stock || 0,
            needed: Math.max(0, (s.min_stock || 0) - (s.current_stock || 0))
          }))
          .filter((s: any) => s.current_stock < s.min_stock)
          .sort((a: any, b: any) => b.needed - a.needed);

        setItems(purchasing);
      }
      setLoading(false);
    };

    fetchPurchasing();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20">
      <div className="spinner-border text-forest mb-3" role="status"></div>
      <div className="text-muted font-bold italic animate-pulse">Đang phân tích dữ liệu kho...</div>
    </div>
  );

  const criticalCount = items.filter(i => i.current_stock < 0).length;
  const warningCount = items.length - criticalCount;

  return (
    <div className="container-fluid py-4 animate__animated animate__fadeIn">
      {/* HEADER SECTION */}
      <div className="row align-items-center mb-5 g-3">
        <div className="col-12 col-md-auto me-md-auto">
          <div className="d-flex align-items-center gap-3">
            <div className="bg-forest p-3 rounded-2xl shadow-soft shadow-forest/20 ring-4 ring-forest/10">
              <ShoppingCart className="text-warm-white" size={28} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="h3 font-bold text-coffee mb-0 tracking-tight capitalize">Danh sách mặt hàng SOS</h1>
              <p className="text-muted small mb-0 font-bold uppercase tracking-widest mt-1">Hệ thống phân tích định mức tồn tối thiểu</p>
            </div>
          </div>
        </div>
      </div>

      {/* OVERVIEW CARDS */}
      <div className="row g-4 mb-5">
        <div className="col-12 col-sm-6 col-xl-3">
          <Card className="h-100 border-l-4 border-l-forest border-y-0 border-r-0">
            <p className="text-muted small font-bold uppercase tracking-widest mb-1">Tổng mặt hàng</p>
            <div className="d-flex align-items-end gap-2">
              <h2 className="font-bold text-coffee mb-0">--</h2>
              <span className="text-forest font-bold pb-1">món</span>
            </div>
            <div className="mt-3 small text-muted font-bold">Ghi nhận trong kho</div>
          </Card>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <Card className="h-100 border-l-4 border-l-ochre border-y-0 border-r-0">
            <p className="text-ochre small font-bold uppercase tracking-widest mb-1">Sắp hết hàng</p>
            <div className="d-flex align-items-end gap-2">
              <h2 className="font-bold text-ochre mb-0">{warningCount}</h2>
              <span className="text-ochre font-bold pb-1">món</span>
            </div>
            <div className="mt-3 small text-muted font-bold">Cần nhập bổ sung sớm</div>
          </Card>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <Card className="h-100 border-l-4 border-l-terra border-y-0 border-r-0">
            <p className="text-terra small font-bold uppercase tracking-widest mb-1">Hụt kho âm</p>
            <div className="d-flex align-items-end gap-2">
              <h2 className="font-bold text-terra mb-0">{criticalCount}</h2>
              <span className="text-terra font-bold pb-1">loại</span>
            </div>
            <div className="mt-3 small text-muted font-bold">CẢNH BÁO NGUY CẤP</div>
          </Card>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <Card className="h-100 border-l-4 border-l-muted border-y-0 border-r-0">
            <p className="text-muted small font-bold uppercase tracking-widest mb-1">Trình trạng</p>
            <div className="d-flex align-items-end gap-2">
              <h2 className="font-bold text-muted mb-0">{items.length === 0 ? 'AN TOÀN' : 'CẦN NHẬP'}</h2>
            </div>
            <div className="mt-3 small text-muted font-bold">Dựa trên data kiểm kê gần nhất</div>
          </Card>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="text-center py-5">
          <div className="card-body">
            <div className="bg-sage/20 text-forest-dark rounded-3 d-inline-flex align-items-center justify-content-center mb-4 shadow-soft" style={{ width: '64px', height: '64px' }}>
              <CheckCircle size={32} strokeWidth={1.5} />
            </div>
            <h4 className="font-bold text-coffee capitalize">Kho hàng an toàn!</h4>
            <p className="text-muted font-bold mb-0">Tất cả nguyên liệu đều đang ở mức an toàn (trên định mức).</p>
          </div>
        </Card>
      ) : (
        <Card noPadding className="mb-4">
          <div className="p-5 border-b border-sage/20 flex justify-between items-center bg-cream/30">
             <h5 className="mb-0 font-bold text-coffee small tracking-widest capitalize">Danh sách chi tiết cần nhập</h5>
             <Badge variant="primary">{items.length} mặt hàng</Badge>
          </div>
          
          {/* Desktop View */}
          <div className="d-none d-md-block">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr className="bg-cream/50">
                    <th className="px-4 py-4 text-muted text-uppercase text-[10px] font-bold tracking-[0.2em] border-b border-sage/20">Nguyên Liệu</th>
                    <th className="px-4 py-4 text-center text-muted text-uppercase text-[10px] font-bold tracking-[0.2em] border-b border-sage/20">Tồn Hiện Tại</th>
                    <th className="px-4 py-4 text-center text-muted text-uppercase text-[10px] font-bold tracking-[0.2em] border-b border-sage/20">Định Mức (Min)</th>
                    <th className="px-4 py-4 text-end text-forest text-uppercase text-[10px] font-bold tracking-[0.2em] border-b border-sage/20">Cần Nhập Thêm</th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  {items.map((item) => (
                    <tr key={item.id} className="group transition-colors hover:bg-cream/30 border-b border-sage/10 last:border-0">
                      <td className="px-4 py-4 border-0">
                        <div className="d-flex align-items-center gap-3">
                          <div className={`p-2.5 rounded-xl shadow-soft transition-all ${item.current_stock < 0 ? 'bg-terra text-warm-white' : 'bg-ochre/20 text-coffee'}`}>
                            {item.current_stock < 0 ? <AlertTriangle size={18} strokeWidth={1.5} /> : <TrendingDown size={18} strokeWidth={1.5} />}
                          </div>
                          <div>
                            <p className="font-bold text-coffee mb-0 tracking-tight">{item.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                               <Badge variant={item.current_stock < 0 ? 'danger' : 'warning'}>
                                  {item.current_stock < 0 ? 'Hụt kho âm' : 'Dưới định mức'}
                               </Badge>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border-0">
                        <span className={`text-sm font-bold ${item.current_stock < 0 ? 'text-terra' : 'text-coffee'}`}>
                          {item.current_stock}
                        </span>
                        <span className="text-[10px] text-muted font-bold ms-1 uppercase">{item.unit}</span>
                      </td>
                      <td className="px-4 py-4 text-center text-muted border-0">
                        <span className="text-sm font-bold">{item.min_stock}</span>
                        <span className="text-[10px] text-muted font-bold ms-1 uppercase">{item.unit}</span>
                      </td>
                      <td className="px-4 py-4 text-end border-0">
                        <div className="inline-flex items-center bg-forest/10 text-forest-dark rounded-xl px-4 py-2 border border-forest/20">
                           <span className="text-sm font-bold">+{item.needed.toFixed(2)}</span>
                           <span className="text-[10px] font-bold ms-1 uppercase">{item.unit}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View */}
          <div className="d-md-none space-y-4 p-3 bg-cream/50">
            {items.map((item) => (
              <div key={item.id} className="bg-warm-white rounded-2xl p-4 shadow-soft border border-sage/20">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${item.current_stock < 0 ? 'bg-terra text-warm-white' : 'bg-ochre/20 text-coffee'}`}>
                       {item.current_stock < 0 ? <AlertTriangle size={18} strokeWidth={1.5} /> : <TrendingDown size={18} strokeWidth={1.5} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-coffee mb-0">{item.name}</h4>
                      <Badge variant={item.current_stock < 0 ? 'danger' : 'warning'} className="mt-1">
                         {item.current_stock < 0 ? 'Hụt kho âm' : 'Dưới định mức'}
                      </Badge>
                    </div>
                  </div>
                  <div className="bg-forest text-warm-white rounded-lg px-2 py-1 flex flex-col items-center">
                     <span className="text-[8px] font-bold opacity-80 uppercase tracking-tighter">Cần nhập</span>
                     <span className="text-xs font-bold">+{item.needed.toFixed(2)}</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-cream p-2 rounded-xl text-center border border-sage/10">
                    <p className="text-[8px] font-bold text-muted uppercase mb-1">Tồn hiện tại</p>
                    <p className={`text-sm font-bold mb-0 ${item.current_stock < 0 ? 'text-terra' : 'text-coffee'}`}>{item.current_stock}</p>
                  </div>
                  <div className="bg-cream p-2 rounded-xl text-center border border-sage/10">
                    <p className="text-[8px] font-bold text-muted uppercase mb-1">Định mức</p>
                    <p className="text-sm font-bold text-coffee mb-0">{item.min_stock}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-cream/30 text-center border-t border-sage/20">
            <p className="small text-muted font-bold uppercase tracking-widest mb-0" style={{ fontSize: '9px' }}>
               Phân tích dựa trên dữ liệu giao dịch & kiểm kê mới nhất
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
