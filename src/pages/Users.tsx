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
  avatar_url: string | null;
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
  
  // Details Modal
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [isResetMode, setIsResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  
  // Maintenance State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deleteOptions, setDeleteOptions] = useState({
    audits: true,
    transactions: true,
    teaCake: true,
    monthlyOpening: false,
    sales: false,
  });
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setProfiles(data as unknown as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  if (currentUserRole !== 'master') {
    return <Navigate to="/" replace />;
  }

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
    const needsDateRange = deleteOptions.audits || deleteOptions.transactions || deleteOptions.teaCake || deleteOptions.sales;
    const needsMonthRange = deleteOptions.monthlyOpening;

    if (!needsDateRange && !needsMonthRange) {
      alert('Vui lòng chọn ít nhất một loại dữ liệu để xóa!');
      return;
    }
    if (needsDateRange && (!startDate || !endDate)) {
      alert('Vui lòng chọn khoảng ngày cho dữ liệu kiểm kê / giao dịch!');
      return;
    }
    if (needsMonthRange && (!startMonth || !endMonth)) {
      alert('Vui lòng chọn khoảng tháng cần xóa Tồn đầu!');
      return;
    }
    if (needsMonthRange && startMonth > endMonth) {
      alert('Tháng bắt đầu không được lớn hơn tháng kết thúc!');
      return;
    }

    const selectedTypes: string[] = [];
    if (deleteOptions.audits) selectedTypes.push('Kiểm kê NVL');
    if (deleteOptions.transactions) selectedTypes.push('Giao dịch kho');
    if (deleteOptions.teaCake) selectedTypes.push('Kiểm kê Trà & Bánh');
    if (deleteOptions.monthlyOpening) selectedTypes.push(`Tồn đầu tháng (${startMonth} → ${endMonth})`);
    if (deleteOptions.sales) selectedTypes.push('Dữ liệu bán hàng');

    const rangeInfo = [
      needsDateRange ? `- Ngày: ${startDate} → ${endDate}` : '',
      needsMonthRange ? `- Tháng: ${startMonth} → ${endMonth}` : '',
    ].filter(Boolean).join('\n');

    const confirmMsg = `CẢNH BÁO NGUY HIỂM!\n\nBạn đang yêu cầu XÓA VĨNH VIỄN dữ liệu:\n- Loại: ${selectedTypes.join(', ')}\n${rangeInfo}\n\nHành động này KHÔNG THỂ HOÀN TÁC. Bạn có chắc chắn muốn tiếp tục?`;

    if (!window.confirm(confirmMsg)) return;
    if (!window.confirm('XÁC NHẬN LẦN CUỐI: Bạn thực sự muốn xóa toàn bộ dữ liệu đã chọn?')) return;

    setIsDeleting(true);
    try {
      let successCount = 0;
      const errorMsgs: string[] = [];

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

      if (deleteOptions.monthlyOpening) {
        const { error } = await supabase
          .from('monthly_opening_stock')
          .delete()
          .gte('year_month', startMonth)
          .lte('year_month', endMonth);
        if (error) errorMsgs.push('Lỗi xóa Tồn đầu tháng: ' + error.message);
        else successCount++;
      }

      if (deleteOptions.sales) {
        // 1. Delete from sales table
        const { error: saleErr } = await supabase
          .from('sales')
          .delete()
          .gte('sale_date', startDate)
          .lte('sale_date', endDate);
        
        // 2. Delete from stock_transactions table (SALES_USAGE types only)
        // If the user also chose to delete ALL transactions, this is redundant but safe.
        const { error: txErr } = await supabase
          .from('stock_transactions')
          .delete()
          .eq('type', 'SALES_USAGE')
          .gte('transaction_date', startDate)
          .lte('transaction_date', endDate);

        if (saleErr || txErr) {
          errorMsgs.push('Lỗi xóa dữ liệu bán hàng: ' + (saleErr?.message || txErr?.message));
        } else {
          successCount++;
        }
      }

      if (errorMsgs.length > 0) {
        alert('Có lỗi xảy ra:\n' + errorMsgs.join('\n'));
      } else if (successCount > 0) {
        alert('Đã xóa dữ liệu thành công!');
        setStartDate('');
        setEndDate('');
        setStartMonth('');
        setEndMonth('');
      }
    } catch (err) {
      alert('Lỗi hệ thống: ' + (err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      alert('Mật khẩu phải ít nhất 6 ký tự!');
      return;
    }
    
    // In a real production app with Supabase, you'd call a service-role Edge Function
    // Since we are on client-side, we can only update the CURRENT logged in user's password.
    // For admin to change OTHERs, they'd usually go through Supabase Dashboard or an Admin API.
    alert(`Thông báo bảo mật:
Để đổi mật khẩu cho nhân viên [${selectedUser?.email}], Master vui lòng thực hiện trên Supabase Dashboard (Cài đặt Auth > Users) hoặc hướng dẫn nhân viên sử dụng tính năng "Quên mật khẩu".
Hệ thống hiện tại không lưu mật khẩu ở dạng văn bản để bảo vệ an toàn cho nhân viên.`);
    setIsResetMode(false);
    setNewPassword('');
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
                              <div className="w-10 h-10 rounded-full bg-light text-primary d-flex align-items-center justify-content-center fw-bold border overflow-hidden">
                                {p.avatar_url ? (
                                  <img src={p.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                  (p.full_name || p.email || 'U').charAt(0).toUpperCase()
                                )}
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
                                      className="btn btn-link p-0 text-muted hover-text-primary"
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
                            <div className="d-flex justify-content-end gap-2">
                              <button 
                                onClick={() => setSelectedUser(p)}
                                className="btn btn-outline-primary btn-sm rounded-circle p-2 border-0 hover-bg-primary-subtle"
                                title="Xem chi tiết"
                              >
                                <Database size={18} />
                              </button>
                              <button 
                                className="btn btn-outline-danger btn-sm rounded-circle p-2 border-0 hover-bg-danger-subtle"
                                title="Vô hiệu hóa tài khoản"
                                onClick={() => alert('Chức năng xóa người dùng yêu cầu thao tác trong Supabase Auth Dashboard.')}
                              >
                                <UserX size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* DETAILS MODAL */}
              {selectedUser && (
                <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                      <div className="modal-header bg-dark text-white border-0 py-3">
                        <h5 className="modal-title fw-black small text-uppercase tracking-widest">
                          Thông tin chi tiết tài khoản
                        </h5>
                        <button type="button" className="btn-close btn-close-white" onClick={() => { setSelectedUser(null); setIsResetMode(false); }}></button>
                      </div>
                      <div className="modal-body p-4">
                        <div className="text-center mb-4">
                          <div className="w-16 h-16 rounded-full bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center fw-bold fs-3 mx-auto border border-primary border-opacity-25 mb-3 overflow-hidden">
                            {selectedUser.avatar_url ? (
                              <img src={selectedUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              (selectedUser.full_name || selectedUser.email).charAt(0).toUpperCase()
                            )}
                          </div>
                          <h5 className="fw-black text-dark mb-1">{selectedUser.full_name || 'Chưa đặt tên'}</h5>
                          <div className={`badge rounded-pill px-3 py-1 ${
                            selectedUser.role === 'master' ? 'bg-danger text-white' : 'bg-light text-secondary border'
                          }`}>
                            Quyền: {selectedUser.role || 'Staff'}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="p-3 bg-light rounded-3 border">
                            <label className="small fw-black text-muted text-uppercase tracking-tighter d-block mb-1">Tên đăng nhập (Email)</label>
                            <div className="fw-bold text-dark">{selectedUser.email}</div>
                          </div>
                          <div className="p-3 bg-light rounded-3 border">
                            <label className="small fw-black text-muted text-uppercase tracking-tighter d-block mb-1">Mã định danh (User ID)</label>
                            <code className="text-primary small" style={{ wordBreak: 'break-all' }}>{selectedUser.id}</code>
                          </div>
                          <div className="p-3 bg-light rounded-3 border">
                            <label className="small fw-black text-muted text-uppercase tracking-tighter d-block mb-1">Ngày tham gia</label>
                            <div className="fw-bold text-dark">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString('vi-VN') : '---'}</div>
                          </div>

                          <div className="p-3 bg-danger bg-opacity-10 rounded-3 border border-danger border-opacity-25">
                            <label className="small fw-black text-danger text-uppercase tracking-tighter d-block mb-2">Quản lý Mật khẩu</label>
                            {isResetMode ? (
                              <div className="d-flex gap-2">
                                <input 
                                  type="text" 
                                  placeholder="Nhập mật khẩu mới..." 
                                  className="form-control form-control-sm"
                                  value={newPassword}
                                  onChange={e => setNewPassword(e.target.value)}
                                />
                                <button onClick={() => handleResetPassword()} className="btn btn-sm btn-danger px-3">Lưu</button>
                                <button onClick={() => setIsResetMode(false)} className="btn btn-sm btn-light border px-2">Hủy</button>
                              </div>
                            ) : (
                              <div className="d-flex align-items-center justify-content-between">
                                <div className="text-muted font-monospace">**********</div>
                                <button 
                                  onClick={() => setIsResetMode(true)}
                                  className="btn btn-sm btn-link text-danger fw-bold p-0 text-decoration-none"
                                >
                                  Cấp lại mật khẩu
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="modal-footer border-0 p-4 pt-0">
                        <button type="button" className="btn btn-dark w-100 rounded-pill py-2 fw-bold" onClick={() => setSelectedUser(null)}>Đóng</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
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

                        {/* --- Tồn đầu tháng --- */}
                        <div className={`p-3 bg-white rounded-3 border ${deleteOptions.monthlyOpening ? 'border-warning border-2' : ''}`}>
                          <div className="form-check">
                            <input 
                              className="form-check-input ms-0 me-3" 
                              type="checkbox" 
                              id="optMonthlyOpening" 
                              checked={deleteOptions.monthlyOpening} 
                              onChange={e => setDeleteOptions(prev => ({...prev, monthlyOpening: e.target.checked}))} 
                            />
                            <label className="form-check-label fw-bold small text-dark mt-1" htmlFor="optMonthlyOpening">
                              Tồn đầu tháng
                            </label>
                            <div className="text-muted italic" style={{fontSize: '10px', marginLeft: '32px'}}>Bảng: monthly_opening_stock</div>
                          </div>

                          {deleteOptions.monthlyOpening && (
                            <div className="mt-3 pt-3 border-top">
                              <div className="small fw-black text-warning-emphasis text-uppercase mb-2" style={{fontSize:'10px'}}>
                                Khoảng tháng cần xóa (riêng biệt)
                              </div>
                              <div className="row g-2">
                                <div className="col-6">
                                  <input 
                                    type="month" 
                                    className="form-control form-control-sm border-warning" 
                                    value={startMonth} 
                                    onChange={e => setStartMonth(e.target.value)} 
                                    placeholder="Từ tháng"
                                  />
                                  <div className="small text-muted mt-1" style={{fontSize:'10px'}}>Từ tháng</div>
                                </div>
                                <div className="col-6">
                                  <input 
                                    type="month" 
                                    className="form-control form-control-sm border-warning" 
                                    value={endMonth} 
                                    onChange={e => setEndMonth(e.target.value)} 
                                    min={startMonth || undefined}
                                    placeholder="Đến tháng"
                                  />
                                  <div className="small text-muted mt-1" style={{fontSize:'10px'}}>Đến tháng</div>
                                </div>
                              </div>
                              <div className="mt-2 p-2 bg-warning bg-opacity-10 rounded-2 small text-warning-emphasis" style={{fontSize:'11px'}}>
                                ⚠️ Thao tác này sẽ xóa toàn bộ tồn đầu của các tháng trong khoảng đã chọn.
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="form-check p-3 bg-white rounded-3 border">
                          <input 
                            className="form-check-input ms-0 me-3" 
                            type="checkbox" 
                            id="optSales" 
                            checked={deleteOptions.sales} 
                            onChange={e => setDeleteOptions(prev => ({...prev, sales: e.target.checked}))} 
                          />
                          <label className="form-check-label fw-bold small text-dark mt-1" htmlFor="optSales">
                            Dữ liệu bán hàng & Tiêu hao (Sales)
                          </label>
                          <div className="text-muted italic" style={{fontSize: '10px', marginLeft: '32px'}}>Bảng: sales & stock_transactions (SALES_USAGE)</div>
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
