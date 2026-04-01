import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Shield, UserX, Search, Mail, Edit3, Check, X, Database, Trash2, Calendar, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
}

export default function Users() {
  const { role: currentUserRole } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'maintenance'>('users');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  
  // Maintenance State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deleteOptions, setDeleteOptions] = useState({
    audits: true,
    transactions: true,
    teaCake: true
  });
  const [isDeleting, setIsDeleting] = useState(false);
  
  if (currentUserRole !== 'master') {
    return <Navigate to="/" replace />;
  }

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setProfiles(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleUpdateRole = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    
    if (error) {
      alert('Lỗi cập nhật role: ' + error.message);
    } else {
      fetchProfiles();
    }
  };

  const handleUpdateName = async (userId: string) => {
    if (!tempName.trim()) return setEditingUserId(null);
    
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: tempName })
      .eq('id', userId);
    
    if (error) {
      alert('Lỗi cập nhật tên: ' + error.message);
    } else {
      setEditingUserId(null);
      fetchProfiles();
    }
  };

  const handleDeleteData = async () => {
    if (!startDate || !endDate) {
      alert('Vui lòng chọn khoảng thời gian!');
      return;
    }

    const selectedTypes = [];
    if (deleteOptions.audits) selectedTypes.push('Kiểm kê NVL');
    if (deleteOptions.transactions) selectedTypes.push('Giao dịch kho');
    if (deleteOptions.teaCake) selectedTypes.push('Kiểm kê Trà & Bánh');

    if (selectedTypes.length === 0) {
      alert('Vui lòng chọn ít nhất một loại dữ liệu để xóa!');
      return;
    }

    const confirmMsg = `CẢNH BÁO NGUY HIỂM!\n\nBạn đang yêu cầu XÓA VĨNH VIỄN dữ liệu:\n- Loại: ${selectedTypes.join(', ')}\n- Từ ngày: ${startDate}\n- Đến ngày: ${endDate}\n\nHành động này KHÔNG THỂ HOÀN TÁC. Bạn có chắc chắn muốn tiếp tục?`;
    
    if (!window.confirm(confirmMsg)) return;
    
    // Final double check
    if (!window.confirm('XÁC NHẬN LẦN CUỐI: Bạn thực sự muốn xóa toàn bộ dữ liệu đã chọn trong khoảng thời gian này?')) return;

    setIsDeleting(true);
    try {
      let successCount = 0;
      let errorMsgs = [];

      if (deleteOptions.audits) {
        const { error } = await supabase
          .from('stock_audits')
          .delete()
          .gte('audit_date', startDate)
          .lte('audit_date', endDate);
        if (error) errorMsgs.push('Lỗi xóa Kiểm kê: ' + error.message);
        else successCount++;
      }

      if (deleteOptions.transactions) {
        const { error } = await supabase
          .from('stock_transactions')
          .delete()
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate);
        if (error) errorMsgs.push('Lỗi xóa Giao dịch: ' + error.message);
        else successCount++;
      }

      if (deleteOptions.teaCake) {
        const { error } = await supabase
          .from('tea_cake_audits')
          .delete()
          .gte('audit_date', startDate)
          .lte('audit_date', endDate);
        if (error) errorMsgs.push('Lỗi xóa Kiểm kê Trà & Bánh: ' + error.message);
        else successCount++;
      }

      if (errorMsgs.length > 0) {
        alert('Có lỗi xảy ra:\n' + errorMsgs.join('\n'));
      } else if (successCount > 0) {
        alert('Đã xóa dữ liệu thành công!');
        setStartDate('');
        setEndDate('');
      }
    } catch (err: any) {
      alert('Lỗi hệ thống: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProfiles = profiles.filter(p => 
    p.email?.toLowerCase().includes(search.toLowerCase()) || 
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container-fluid py-4">
      <div className="row g-3 align-items-center mb-4">
        <div className="col-12 col-md-auto me-auto">
          <h1 className="h3 fw-black text-dark mb-1">QUẢN TRỊ HỆ THỐNG</h1>
          <p className="text-secondary small mb-0">Quản lý người dùng và bảo trì dữ liệu hệ thống.</p>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
        <div className="card-header bg-light p-2 border-0">
          <ul className="nav nav-pills nav-fill bg-light p-0">
            <li className="nav-item">
              <button
                onClick={() => setActiveTab('users')}
                className={`nav-link rounded-pill fw-bold small transition-all py-2 ${activeTab === 'users' ? 'active shadow-sm' : 'text-secondary hover-bg-light'}`}
              >
                Người dùng
              </button>
            </li>
            <li className="nav-item">
              <button
                onClick={() => setActiveTab('maintenance')}
                className={`nav-link rounded-pill fw-bold small transition-all py-2 ${activeTab === 'maintenance' ? 'active shadow-sm' : 'text-secondary hover-bg-light'}`}
              >
                Bảo trì dữ liệu
              </button>
            </li>
          </ul>
        </div>

        <div className="card-body p-4">
          {activeTab === 'users' ? (
            <>
              <div className="row g-3 mb-4">
                <div className="col-12">
                  <div className="input-group shadow-sm rounded-pill overflow-hidden border">
                    <span className="input-group-text bg-white border-0 ps-4 text-muted"><Search size={18} /></span>
                    <input 
                      type="text" 
                      placeholder="Tìm theo email hoặc tên..." 
                      value={search} 
                      onChange={e => setSearch(e.target.value)} 
                      className="form-control border-0 py-2 ms-0" 
                      style={{ fontSize: '15px' }} 
                    />
                  </div>
                </div>
              </div>

              <div className="table-responsive rounded-4 border">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
                  <thead className="table-light">
                    <tr>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Người dùng</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Email</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Quyền hạn</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {loading ? (
                      <tr><td colSpan={4} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
                    ) : filteredProfiles.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-5 text-center text-muted italic">Không có người dùng nào.</td></tr>
                    ) : (
                      filteredProfiles.map(p => (
                        <tr key={p.id}>
                          <td className="px-4 py-3">
                            <div className="d-flex align-items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-light text-primary d-flex align-items-center justify-content-center fw-bold border">
                                {(p.full_name || p.email || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                {editingUserId === p.id ? (
                                  <div className="d-flex align-items-center gap-1">
                                    <input 
                                      type="text" 
                                      value={tempName} 
                                      onChange={e => setTempName(e.target.value)}
                                      className="form-control form-control-sm border-primary fw-bold"
                                      autoFocus
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleUpdateName(p.id);
                                        if (e.key === 'Escape') setEditingUserId(null);
                                      }}
                                    />
                                    <button onClick={() => handleUpdateName(p.id)} className="btn btn-sm btn-success p-1 rounded-circle shadow-sm"><Check size={14} /></button>
                                    <button onClick={() => setEditingUserId(null)} className="btn btn-sm btn-light p-1 rounded-circle shadow-sm"><X size={14} /></button>
                                  </div>
                                ) : (
                                  <div className="d-flex align-items-center gap-2">
                                    <div className="fw-bold text-dark">{p.full_name || 'Chưa đặt tên'}</div>
                                    <button 
                                      onClick={() => { setEditingUserId(p.id); setTempName(p.full_name || ''); }}
                                      className="btn btn-link p-0 text-muted hover-text-blue"
                                    >
                                      <Edit3 size={14} />
                                    </button>
                                  </div>
                                )}
                                <div className="text-muted small" style={{fontSize: '11px'}}>{p.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-secondary">
                            <div className="d-flex align-items-center gap-2">
                              <Mail size={14} className="opacity-50" />
                              {p.email}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="d-flex align-items-center gap-2">
                              <select 
                                value={p.role || 'staff'} 
                                onChange={e => handleUpdateRole(p.id, e.target.value)}
                                className={`form-select form-select-sm fw-bold rounded-pill px-3 py-1 ${
                                  p.role === 'master' ? 'bg-danger-subtle text-danger border-danger' :
                                  p.role === 'SM' ? 'bg-warning-subtle text-warning-emphasis border-warning' :
                                  p.role === 'SS' ? 'bg-info-subtle text-info-emphasis border-info' :
                                  p.role === 'MB' ? 'bg-success-subtle text-success border-success' :
                                  'bg-light text-secondary border-secondary'
                                }`}
                                style={{ width: 'fit-content' }}
                              >
                                <option value="master">Master</option>
                                <option value="SM">SM</option>
                                <option value="SS">SS</option>
                                <option value="MB">MB</option>
                                <option value="staff">Staff</option>
                              </select>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-end">
                            <button 
                              className="btn btn-outline-danger btn-sm rounded-circle p-2 border-0 hover-bg-danger-subtle"
                              title="Vô hiệu hóa tài khoản"
                              onClick={() => alert('Chức năng xóa người dùng yêu cầu thao tác trong Supabase Auth.')}
                            >
                              <UserX size={18} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-4 p-3 bg-light rounded-4 border-start border-4 border-info">
                <h6 className="fw-bold text-info flex align-items-center gap-2">
                  <Shield size={18} /> Lưu ý cho Master
                </h6>
                <p className="small text-secondary mb-0">
                  Việc tạo tài khoản mới (Sign Up) nên được thực hiện qua trang Đăng ký hoặc Supabase Dashboard. 
                  Sau khi người dùng đăng ký, bạn có thể phân quyền (Role) cho họ tại bảng này.
                </p>
              </div>
            </>
          ) : (
            <div className="py-2">
              <div className="row g-4">
                <div className="col-12 col-lg-5">
                  <div className="card border-0 bg-light rounded-4 p-4">
                    <h5 className="fw-black text-dark text-uppercase mb-3 d-flex align-items-center gap-2">
                      <Trash2 size={24} className="text-danger" /> Dọn dẹp dữ liệu
                    </h5>
                    <p className="text-secondary small mb-4">
                      Sử dụng công cụ này để xóa các dữ liệu cũ không còn cần thiết. 
                      Hành động này giúp giảm tải hệ thống nhưng cần hết sức cẩn trọng.
                    </p>

                    <div className="mb-4">
                      <label className="form-label small fw-black text-secondary text-uppercase tracking-wider">Khoảng thời gian</label>
                      <div className="row g-2">
                        <div className="col-6">
                          <div className="input-group">
                            <span className="input-group-text bg-white border-end-0 text-muted"><Calendar size={14} /></span>
                            <input 
                              type="date" 
                              className="form-control border-start-0 ps-0" 
                              value={startDate} 
                              onChange={e => setStartDate(e.target.value)} 
                            />
                          </div>
                          <div className="small text-muted mt-1" style={{fontSize: '10px'}}>Từ ngày</div>
                        </div>
                        <div className="col-6">
                          <div className="input-group">
                            <span className="input-group-text bg-white border-end-0 text-muted"><Calendar size={14} /></span>
                            <input 
                              type="date" 
                              className="form-control border-start-0 ps-0" 
                              value={endDate} 
                              onChange={e => setEndDate(e.target.value)} 
                            />
                          </div>
                          <div className="small text-muted mt-1" style={{fontSize: '10px'}}>Đến ngày</div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="form-label small fw-black text-secondary text-uppercase tracking-wider mb-2">Loại dữ liệu cần xóa</label>
                      <div className="d-flex flex-column gap-2">
                        <div className="form-check p-3 bg-white rounded-3 border">
                          <input 
                            className="form-check-input ms-0 me-3" 
                            type="checkbox" 
                            id="optAudits" 
                            checked={deleteOptions.audits} 
                            onChange={e => setDeleteOptions(prev => ({...prev, audits: e.target.checked}))} 
                          />
                          <label className="form-check-label fw-bold small text-dark mt-1" htmlFor="optAudits">
                            Dữ liệu Kiểm kê Nguyên Vật Liệu
                          </label>
                          <div className="text-muted italic" style={{fontSize: '10px', marginLeft: '32px'}}>Bảng: stock_audits</div>
                        </div>
                        <div className="form-check p-3 bg-white rounded-3 border">
                          <input 
                            className="form-check-input ms-0 me-3" 
                            type="checkbox" 
                            id="optTransactions" 
                            checked={deleteOptions.transactions} 
                            onChange={e => setDeleteOptions(prev => ({...prev, transactions: e.target.checked}))} 
                          />
                          <label className="form-check-label fw-bold small text-dark mt-1" htmlFor="optTransactions">
                            Phiếu Giao Dịch Kho
                          </label>
                          <div className="text-muted italic" style={{fontSize: '10px', marginLeft: '32px'}}>Bảng: stock_transactions</div>
                        </div>
                        <div className="form-check p-3 bg-white rounded-3 border">
                          <input 
                            className="form-check-input ms-0 me-3" 
                            type="checkbox" 
                            id="optTeaCake" 
                            checked={deleteOptions.teaCake} 
                            onChange={e => setDeleteOptions(prev => ({...prev, teaCake: e.target.checked}))} 
                          />
                          <label className="form-check-label fw-bold small text-dark mt-1" htmlFor="optTeaCake">
                            Dữ liệu Kiểm kê Trà & Bánh
                          </label>
                          <div className="text-muted italic" style={{fontSize: '10px', marginLeft: '32px'}}>Bảng: tea_cake_audits</div>
                        </div>
                      </div>
                    </div>

                    <div className="alert alert-warning border-warning rounded-3 d-flex gap-3 mb-4">
                      <AlertTriangle size={24} className="flex-shrink-0" />
                      <div className="small">
                        <strong>Cảnh báo:</strong> Thao tác này sẽ xóa vĩnh viễn các bản ghi tương ứng trong khoảng thời gian đã chọn. Hãy sao lưu dữ liệu nếu cần trước khi thực hiện.
                      </div>
                    </div>

                    <button 
                      className={`btn btn-danger w-100 py-3 fw-black text-uppercase rounded-3 shadow-sm d-flex align-items-center justify-content-center gap-2 ${isDeleting ? 'disabled' : ''}`}
                      onClick={handleDeleteData}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <div className="spinner-border spinner-border-sm" role="status"></div>
                          <span>Đang thực hiện...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={20} />
                          <span>Xóa dữ liệu ngay lập tức</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="col-12 col-lg-7">
                  <div className="card border-0 h-100 rounded-4 p-4 border shadow-sm">
                    <h6 className="fw-black text-dark text-uppercase mb-4 d-flex align-items-center gap-2">
                       <Database size={20} className="text-info" /> Sức khỏe hệ thống
                    </h6>
                    
                    <div className="row g-3">
                      <div className="col-12">
                        <div className="p-3 bg-light rounded-3">
                          <div className="small text-secondary fw-black text-uppercase tracking-tighter mb-1">Dữ liệu kiểm kê (NVL)</div>
                          <div className="h4 mb-0 fw-black text-dark">{profiles.length > 0 ? 'Hoạt động' : '...'}</div>
                        </div>
                      </div>
                      <div className="col-12">
                         <div className="p-3 bg-light rounded-3">
                          <div className="small text-secondary fw-black text-uppercase tracking-tighter mb-1">Dữ liệu giao dịch kho</div>
                          <div className="h4 mb-0 fw-black text-dark">Ổn định</div>
                        </div>
                      </div>
                      <div className="col-12">
                        <div className="mt-2 text-muted small">
                           <p><strong>Lưu ý về hiệu năng:</strong> Khi số lượng bản ghi vượt quá 10,000 dòng, bạn nên dọn dẹp các dữ liệu cũ hơn 1 năm để đảm bảo tốc độ tải trang và tính toán báo cáo được mượt mà hơn.</p>
                           <p className="mb-0">Dữ liệu sau khi xóa sẽ được giải phóng hoàn toàn khỏi cơ sở dữ liệu Supabase.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
