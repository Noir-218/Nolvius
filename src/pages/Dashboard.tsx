import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PurchasingItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  needed: number;
}

export default function Dashboard() {
  const { role } = useAuth();
  
  if (role === 'staff') {
    return <Navigate to="/audit" replace />;
  }
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
      <div className="spinner-border text-teal-600 mb-3" role="status"></div>
      <div className="text-gray-500 font-bold italic animate-pulse">Đang phân tích dữ liệu kho...</div>
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
            <div className="bg-teal-600 p-3 rounded-2xl shadow-lg shadow-teal-100 ring-4 ring-teal-50">
              <ShoppingCart className="text-white" size={28} />
            </div>
            <div>
              <h1 className="h3 fw-black text-gray-800 mb-0 tracking-tight">DANH SÁCH MẶT HÀNG SOS</h1>
              <p className="text-gray-400 small mb-0 font-bold uppercase tracking-widest mt-1">Hệ thống phân tích định mức tồn tối thiểu</p>
            </div>
          </div>
        </div>
      </div>

      {/* OVERVIEW CARDS */}
      <div className="row g-4 mb-5">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-4 p-4 h-100 border-start border-5 border-teal-500">
            <p className="text-gray-400 small font-black uppercase tracking-widest mb-1">Tổng mặt hàng</p>
            <div className="d-flex align-items-end gap-2">
              <h2 className="fw-black text-gray-800 mb-0">--</h2>
              <span className="text-teal-600 font-bold pb-1">món</span>
            </div>
            <div className="mt-3 small text-gray-400 font-bold">Ghi nhận trong kho</div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-4 p-4 h-100 border-start border-5 border-warning">
            <p className="text-warning small font-black uppercase tracking-widest mb-1">Sắp hết hàng</p>
            <div className="d-flex align-items-end gap-2">
              <h2 className="fw-black text-warning mb-0">{warningCount}</h2>
              <span className="text-warning font-bold pb-1">món</span>
            </div>
            <div className="mt-3 small text-gray-400 font-bold">Cần nhập bổ sung sớm</div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-4 p-4 h-100 border-start border-5 border-danger">
            <p className="text-danger small font-black uppercase tracking-widest mb-1">Hụt kho âm</p>
            <div className="d-flex align-items-end gap-2">
              <h2 className="fw-black text-danger mb-0">{criticalCount}</h2>
              <span className="text-danger font-bold pb-1">loại</span>
            </div>
            <div className="mt-3 small text-gray-400 font-bold">CẢNH BÁO NGUY CẤP</div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-4 p-4 h-100 border-start border-5 border-info">
            <p className="text-info small font-black uppercase tracking-widest mb-1">Trình trạng</p>
            <div className="d-flex align-items-end gap-2">
              <h2 className="fw-black text-info mb-0">{items.length === 0 ? 'AN TOÀN' : 'CẦN NHẬP'}</h2>
            </div>
            <div className="mt-3 small text-gray-400 font-bold">Dựa trên data kiểm kê gần nhất</div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card border-0 shadow-sm rounded-4 text-center py-5 bg-white">
          <div className="card-body">
            <div className="bg-success bg-opacity-10 text-success rounded-3 d-inline-flex align-items-center justify-content-center mb-4 shadow-sm" style={{ width: '64px', height: '64px' }}>
              <CheckCircle size={32} />
            </div>
            <h4 className="fw-black text-gray-800">Kho hàng an toàn!</h4>
            <p className="text-gray-400 font-bold mb-0">Tất cả nguyên liệu đều đang ở mức an toàn (trên định mức).</p>
          </div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4 bg-white">
          <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
             <h5 className="mb-0 fw-black text-gray-700 small tracking-widest uppercase">Danh sách chi tiết cần nhập</h5>
             <span className="badge bg-teal-600 rounded-pill px-3 py-2 font-black">{items.length} mặt hàng</span>
          </div>
          
          {/* Desktop View */}
          <div className="d-none d-md-block">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr className="bg-gray-50/50">
                    <th className="px-4 py-4 text-gray-400 text-uppercase text-[10px] font-black tracking-[0.2em] border-0">Nguyên Liệu</th>
                    <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-[0.2em] border-0">Tồn Hiện Tại</th>
                    <th className="px-4 py-4 text-center text-gray-400 text-uppercase text-[10px] font-black tracking-[0.2em] border-0">Định Mức (Min)</th>
                    <th className="px-4 py-4 text-end text-teal-600 text-uppercase text-[10px] font-black tracking-[0.2em] border-0">Cần Nhập Thêm</th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  {items.map((item) => (
                    <tr key={item.id} className="group transition-all">
                      <td className="px-4 py-4 border-gray-50">
                        <div className="d-flex align-items-center gap-3">
                          <div className={`p-2.5 rounded-xl shadow-sm transition-all ${item.current_stock < 0 ? 'bg-danger text-white' : 'bg-warning text-dark'}`}>
                            {item.current_stock < 0 ? <AlertTriangle size={18} /> : <TrendingDown size={18} />}
                          </div>
                          <div>
                            <p className="fw-black text-gray-800 mb-0 tracking-tight">{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                               <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${item.current_stock < 0 ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning-emphasis'}`}>
                                  {item.current_stock < 0 ? 'Hụt kho âm' : 'Dưới định mức'}
                               </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center border-gray-50">
                        <span className={`text-sm font-black ${item.current_stock < 0 ? 'text-danger' : 'text-gray-700'}`}>
                          {item.current_stock}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold ms-1 uppercase">{item.unit}</span>
                      </td>
                      <td className="px-4 py-4 text-center text-gray-500 border-gray-50">
                        <span className="text-sm font-bold">{item.min_stock}</span>
                        <span className="text-[10px] text-gray-400 font-bold ms-1 uppercase">{item.unit}</span>
                      </td>
                      <td className="px-4 py-4 text-end border-gray-50">
                        <div className="inline-flex items-center bg-teal-50 text-teal-700 rounded-xl px-4 py-2 border border-teal-100">
                           <span className="text-sm font-black">+{item.needed.toFixed(2)}</span>
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
          <div className="d-md-none space-y-4 p-3 bg-gray-50/20">
            {items.map((item) => (
              <div key={item.id} className="bg-white rounded-4 p-4 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${item.current_stock < 0 ? 'bg-danger text-white' : 'bg-warning text-dark'}`}>
                       {item.current_stock < 0 ? <AlertTriangle size={18} /> : <TrendingDown size={18} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-gray-800 mb-0">{item.name}</h4>
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{item.current_stock < 0 ? 'Hụt kho âm' : 'Dưới định mức'}</span>
                    </div>
                  </div>
                  <div className="bg-teal-600 text-white rounded-lg px-2 py-1 flex flex-col items-center">
                     <span className="text-[8px] font-black opacity-70 uppercase tracking-tighter">Cần nhập</span>
                     <span className="text-xs font-black">+{item.needed.toFixed(2)}</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50/50 p-2 rounded-xl text-center">
                    <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Tồn hiện tại</p>
                    <p className={`text-sm font-black mb-0 ${item.current_stock < 0 ? 'text-danger' : 'text-gray-700'}`}>{item.current_stock}</p>
                  </div>
                  <div className="bg-gray-50/50 p-2 rounded-xl text-center">
                    <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Định mức</p>
                    <p className="text-sm font-bold text-gray-600 mb-0">{item.min_stock}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card-footer bg-gray-50/30 text-center py-4 border-0">
            <p className="small text-gray-400 font-bold uppercase tracking-widest mb-0" style={{ fontSize: '9px' }}>
               Phân tích dựa trên dữ liệu giao dịch & kiểm kê mới nhất
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
