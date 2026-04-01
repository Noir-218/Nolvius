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

  if (loading) return <div className="p-8 text-center text-gray-500 italic">Đang tính toán danh sách SOS...</div>;

  return (
    <div className="container-fluid py-3 py-md-4">
      <div className="row align-items-center mb-4 g-3">
        <div className="col-12 col-md-auto me-md-auto">
          <h1 className="h3 fw-black text-dark mb-1 d-flex align-items-center gap-3">
            <ShoppingCart className="text-primary" size={28} />
            DANH SÁCH MẶT HÀNG SOS
          </h1>
          <p className="text-secondary small mb-0 font-medium">Gợi ý các mặt hàng SOS dựa trên định mức tồn kho tối thiểu.</p>
        </div>
        <div className="col-12 col-md-auto">
          <div className="card border-0 shadow-sm rounded-pill bg-primary bg-opacity-10 px-3 py-2 border-start border-4 border-primary">
            <div className="d-flex align-items-center gap-3">
              <span className="small fw-bold text-primary text-uppercase tracking-wider">Cần nhập:</span>
              <div className="d-flex align-items-center gap-2">
                <span className="h4 fw-black text-primary mb-0">{items.length}</span>
                <span className="small text-primary opacity-75">mặt hàng</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card border-0 shadow-sm rounded-4 text-center py-5">
          <div className="card-body">
            <div className="bg-success bg-opacity-10 text-success rounded-circle d-inline-flex align-items-center justify-content-center mb-4 shadow-sm" style={{ width: '64px', height: '64px' }}>
              <CheckCircle size={32} />
            </div>
            <h4 className="fw-bold text-dark">Kho hàng an toàn!</h4>
            <p className="text-secondary mb-0">Tất cả nguyên liệu đều đang ở mức an toàn (trên định mức).</p>
          </div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
          {/* Desktop View */}
          <div className="d-none d-md-block">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
                <thead className="table-light">
                  <tr>
                    <th className="px-4 py-3 text-secondary text-uppercase small fw-black tracking-widest border-0">Tên Nguyên Liệu</th>
                    <th className="px-4 py-3 text-center text-secondary text-uppercase small fw-black tracking-widest border-0">Tồn Hiện Tại</th>
                    <th className="px-4 py-3 text-center text-secondary text-uppercase small fw-black tracking-widest border-0">Định Mức (Min)</th>
                    <th className="px-4 py-3 text-end text-primary text-uppercase small fw-black tracking-widest border-0">Cần Nhập Thêm</th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  {items.map((item) => (
                    <tr key={item.id} className={item.current_stock < 0 ? 'table-danger-subtle' : ''}>
                      <td className="px-4 py-3">
                        <div className="d-flex align-items-center gap-3">
                          <div className={`p-2 rounded-3 shadow-sm ${item.current_stock < 0 ? 'bg-danger text-white' : 'bg-warning text-dark'}`}>
                            {item.current_stock < 0 ? <AlertTriangle size={18} /> : <TrendingDown size={18} />}
                          </div>
                          <div>
                            <p className="fw-bold text-dark mb-0">{item.name}</p>
                            <p className="text-secondary mb-0" style={{ fontSize: '10px' }}>{item.current_stock < 0 ? 'HỤT KHO NGHIÊM TRỌNG' : 'DƯỚI MỨC AN TOÀN'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-monospace fw-bold">
                        <span className={item.current_stock < 0 ? 'text-danger' : 'text-dark'}>
                          {item.current_stock}
                        </span>
                        <small className="text-muted ms-1 fw-normal">{item.unit}</small>
                      </td>
                      <td className="px-4 py-3 text-center text-muted">
                        {item.min_stock} <small>{item.unit}</small>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="btn btn-primary rounded-pill fw-black shadow-sm px-4 py-1" style={{ fontSize: '12px' }}>
                          +{item.needed.toFixed(2)} <small>{item.unit}</small>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile View */}
          <div className="d-md-none list-group list-group-flush">
            {items.map((item) => (
              <div key={item.id} className={`list-group-item p-4 border-bottom ${item.current_stock < 0 ? 'bg-danger-subtle' : ''}`}>
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <div className={`p-2 rounded-3 shadow-sm ${item.current_stock < 0 ? 'bg-danger text-white' : 'bg-warning text-dark'}`}>
                      {item.current_stock < 0 ? <AlertTriangle size={16} /> : <TrendingDown size={16} />}
                    </div>
                    <div>
                      <h6 className="fw-bold text-dark mb-0">{item.name}</h6>
                      <small className="text-muted text-uppercase fw-bold" style={{ fontSize: '9px' }}>{item.current_stock < 0 ? 'Hụt kho' : 'Sắp hết'}</small>
                    </div>
                  </div>
                  <div className="badge rounded-pill bg-primary p-2 px-3 shadow-sm fw-black" style={{ fontSize: '12px' }}>
                    +{item.needed.toFixed(2)} {item.unit}
                  </div>
                </div>
                
                <div className="row g-2">
                  <div className="col-6">
                    <div className="p-2 border rounded-3 bg-white">
                      <p className="small text-muted text-uppercase fw-bold mb-1" style={{ fontSize: '9px' }}>Tồn Hiện Tại</p>
                      <span className={`h6 fw-black mb-0 ${item.current_stock < 0 ? 'text-danger' : 'text-dark'}`}>
                        {item.current_stock}
                      </span>
                      <small className="text-muted ms-1 font-monospace">{item.unit}</small>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="p-2 border rounded-3 bg-white">
                      <p className="small text-muted text-uppercase fw-bold mb-1" style={{ fontSize: '9px' }}>Định Mức</p>
                      <span className="h6 fw-bold text-secondary mb-0">
                        {item.min_stock}
                      </span>
                      <small className="text-muted ms-1 font-monospace">{item.unit}</small>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card-footer bg-light text-center py-3 border-0">
            <p className="small text-muted font-italic mb-0" style={{ fontSize: '11px' }}>* Số liệu được tính toán dựa trên định mức tồn kho tối thiểu.</p>
          </div>
        </div>
      )}
    </div>
  );
}
