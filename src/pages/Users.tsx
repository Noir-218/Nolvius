import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // Master DB
import { Search, Mail, Edit3, Check, X, Database, Trash2, Calendar, AlertTriangle, Plus, Landmark, CheckSquare, Square, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  avatar_url: string | null;
  created_at: string | null;
  action_permissions: Record<string, string> | null;
}

interface Facility {
  id: string;
  name: string;
  address: string | null;
  supabase_url: string;
  supabase_anon_key: string;
  google_script_url?: string | null;
  created_at?: string;
}

interface UserFacility {
  user_id: string;
  facility_id: string;
}

export default function Users() {
  const { role: currentUserRole } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [userFacilities, setUserFacilities] = useState<UserFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'facilities' | 'maintenance'>('users');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  
  // Details Modal
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  
  // Facility Form Modal
  const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false);
  const [editingFacilityId, setEditingFacilityId] = useState<string | null>(null);
  const [facilityForm, setFacilityForm] = useState({
    name: '',
    address: '',
    supabase_url: '',
    supabase_anon_key: '',
    google_script_url: '',
  });

  // User Facility Mapping Modal
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingUser, setMappingUser] = useState<Profile | null>(null);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);

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

  // Action Permissions Modal
  const [isActionPermModalOpen, setIsActionPermModalOpen] = useState(false);
  const [actionPermUser, setActionPermUser] = useState<Profile | null>(null);
  const [tempActionPerms, setTempActionPerms] = useState<Record<string, string>>({});

  const PAGE_PERMISSION_DEFS = [
    { key: 'dashboard', label: 'SOS (Trang chủ)' },
    { key: 'ingredients', label: 'Nguyên Liệu' },
    { key: 'products', label: 'Sản Phẩm' },
    { key: 'recipes', label: 'Công Thức' },
    { key: 'stock', label: 'Tồn Kho' },
    { key: 'transactions', label: 'Giao Dịch Kho' },
    { key: 'sales', label: 'Nhập Bán Hàng' },
    { key: 'audit', label: 'Kiểm Kê Kho' },
    { key: 'analysis', label: 'Phân Tích Tiêu Hao' },
    { key: 'forecast', label: 'Dự Đoán Nhập Hàng' },
    { key: 'expenses', label: 'Quản Lý Thu Chi' },
    { key: 'scheduling', label: 'Xếp Lịch Làm Việc' },
    { key: 'sync', label: 'Đồng Bộ Dữ Liệu' },
  ];

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profilesRes, facilitiesRes, mappingRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('facilities' as any).select('*').order('created_at', { ascending: false }),
        supabase.from('user_facilities' as any).select('*')
      ]);

      if (profilesRes.data) setProfiles(profilesRes.data as unknown as Profile[]);
      if (facilitiesRes.data) setFacilities(facilitiesRes.data as unknown as Facility[]);
      if (mappingRes.data) setUserFacilities(mappingRes.data as unknown as UserFacility[]);
    } catch (e: any) {
      toast.error('Lỗi tải dữ liệu: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
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
      toast.error('Lỗi cập nhật role: ' + error.message);
    } else {
      toast.success('Cập nhật quyền thành công');
      fetchData();
    }
  };

  const handleUpdateName = async (userId: string) => {
    if (!tempName.trim()) return setEditingUserId(null);
    
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: tempName })
      .eq('id', userId);
    
    if (error) {
      toast.error('Lỗi cập nhật tên: ' + error.message);
    } else {
      setEditingUserId(null);
      toast.success('Cập nhật tên thành công');
      fetchData();
    }
  };

  // Facility Management CRUD
  const handleOpenFacilityModal = (fac?: Facility) => {
    if (fac) {
      setEditingFacilityId(fac.id);
      setFacilityForm({
        name: fac.name,
        address: fac.address || '',
        supabase_url: fac.supabase_url,
        supabase_anon_key: fac.supabase_anon_key,
        google_script_url: fac.google_script_url || '',
      });
    } else {
      setEditingFacilityId(null);
      setFacilityForm({
        name: '',
        address: '',
        supabase_url: '',
        supabase_anon_key: '',
        google_script_url: '',
      });
    }
    setIsFacilityModalOpen(true);
  };

  const handleSaveFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facilityForm.name || !facilityForm.supabase_url || !facilityForm.supabase_anon_key) {
      toast.error('Vui lòng điền đầy đủ các thông tin bắt buộc!');
      return;
    }

    try {
      if (editingFacilityId) {
        const { error } = await supabase
          .from('facilities' as any)
          .update({
            name: facilityForm.name,
            address: facilityForm.address || null,
            supabase_url: facilityForm.supabase_url,
            supabase_anon_key: facilityForm.supabase_anon_key,
            google_script_url: facilityForm.google_script_url || null,
          })
          .eq('id', editingFacilityId);

        if (error) throw error;
        toast.success('Cập nhật cơ sở thành công!');
      } else {
        const { error } = await supabase
          .from('facilities' as any)
          .insert({
            name: facilityForm.name,
            address: facilityForm.address || null,
            supabase_url: facilityForm.supabase_url,
            supabase_anon_key: facilityForm.supabase_anon_key,
            google_script_url: facilityForm.google_script_url || null,
          });

        if (error) throw error;
        toast.success('Thêm cơ sở mới thành công!');
      }
      setIsFacilityModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleDeleteFacility = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa cơ sở này? Tài khoản được gán quyền cơ sở này sẽ mất liên kết.')) return;
    try {
      const { error } = await supabase.from('facilities' as any).delete().eq('id', id);
      if (error) throw error;
      toast.success('Xóa cơ sở thành công!');
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi khi xóa: ' + err.message);
    }
  };

  // Facility Mapping Management
  const handleOpenMappingModal = (user: Profile) => {
    setMappingUser(user);
    const assignedIds = userFacilities
      .filter(uf => uf.user_id === user.id)
      .map(uf => uf.facility_id);
    setSelectedFacilityIds(assignedIds);
    setIsMappingModalOpen(true);
  };

  const handleToggleFacilityAssignment = (facilityId: string) => {
    setSelectedFacilityIds(prev => 
      prev.includes(facilityId)
        ? prev.filter(id => id !== facilityId)
        : [...prev, facilityId]
    );
  };

  const handleSaveMapping = async () => {
    if (!mappingUser) return;
    try {
      // Xóa liên kết cũ của user này
      await supabase.from('user_facilities' as any).delete().eq('user_id', mappingUser.id);
      
      // Thêm liên kết mới
      if (selectedFacilityIds.length > 0) {
        const inserts = selectedFacilityIds.map(fid => ({
          user_id: mappingUser.id,
          facility_id: fid
        }));
        const { error } = await supabase.from('user_facilities' as any).insert(inserts);
        if (error) throw error;
      }
      
      toast.success(`Đã cập nhật phân quyền cơ sở cho ${mappingUser.full_name || mappingUser.email}`);
      setIsMappingModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi phân quyền: ' + err.message);
    }
  };

  // Action Permissions handlers
  const handleOpenActionPermModal = (user: Profile) => {
    setActionPermUser(user);
    setTempActionPerms(user.action_permissions || {});
    setIsActionPermModalOpen(true);
  };

  const handleSetActionPerm = (pageKey: string, value: string) => {
    setTempActionPerms(prev => ({ ...prev, [pageKey]: value }));
  };

  const handleSaveActionPerms = async () => {
    if (!actionPermUser) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ action_permissions: tempActionPerms })
        .eq('id', actionPermUser.id);
      if (error) throw error;
      toast.success(`Đã cập nhật phân quyền thao tác cho ${actionPermUser.full_name || actionPermUser.email}`);
      setIsActionPermModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error('Lỗi lưu phân quyền: ' + err.message);
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



  const filteredProfiles = profiles.filter(p => 
    p.email?.toLowerCase().includes(search.toLowerCase()) || 
    p.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container-fluid py-4">
      <div className="row g-3 align-items-center mb-4">
        <div className="col-12 col-md-auto me-auto">
          <h1 className="h3 fw-black text-dark mb-1">QUẢN TRỊ HỆ THỐNG</h1>
          <p className="text-secondary small mb-0">Quản lý người dùng, phân chia cơ sở và bảo trì dữ liệu.</p>
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
                onClick={() => setActiveTab('facilities')}
                className={`nav-link rounded-pill fw-bold small transition-all py-2 ${activeTab === 'facilities' ? 'active shadow-sm' : 'text-secondary hover-bg-light'}`}
              >
                Quản lý cơ sở
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
          {activeTab === 'users' && (
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
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Cơ sở được gán</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {loading ? (
                      <tr><td colSpan={5} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
                    ) : filteredProfiles.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-5 text-center text-muted italic">Không có người dùng nào.</td></tr>
                    ) : (
                      filteredProfiles.map(p => {
                        const userAssignedFacilities = userFacilities
                          .filter(uf => uf.user_id === p.id)
                          .map(uf => facilities.find(f => f.id === uf.facility_id)?.name)
                          .filter(Boolean);

                        return (
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
                            <td className="px-4 py-3">
                              {userAssignedFacilities.length === 0 ? (
                                <span className="text-muted italic small">Chưa gán cơ sở</span>
                              ) : (
                                <div className="d-flex flex-wrap gap-1">
                                  {userAssignedFacilities.map((name, i) => (
                                    <span key={i} className="badge bg-secondary rounded-pill">{name}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end">
                              <div className="d-flex justify-content-end gap-2">
                                <button 
                                  onClick={() => handleOpenActionPermModal(p)}
                                  className={`btn btn-sm rounded-circle p-2 border-0 ${
                                    p.role === 'master'
                                      ? 'btn-outline-secondary opacity-50'
                                      : 'btn-outline-success hover-bg-success-subtle'
                                  }`}
                                  title={p.role === 'master' ? 'Master àoàon có toàn quyền' : 'Phân quyền thao tác'}
                                >
                                  <ShieldCheck size={18} />
                                </button>
                                <button 
                                  onClick={() => handleOpenMappingModal(p)}
                                  className="btn btn-outline-info btn-sm rounded-circle p-2 border-0 hover-bg-info-subtle"
                                  title="Phân quyền cơ sở"
                                >
                                  <Landmark size={18} />
                                </button>
                                <button 
                                  onClick={() => setSelectedUser(p)}
                                  className="btn btn-outline-primary btn-sm rounded-circle p-2 border-0 hover-bg-primary-subtle"
                                  title="Xem chi tiết"
                                >
                                  <Database size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
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
                        <button type="button" className="btn-close btn-close-white" onClick={() => { setSelectedUser(null); }}></button>
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
                        </div>
                      </div>
                      <div className="modal-footer border-0 p-4 pt-0">
                        <button type="button" className="btn btn-dark w-100 rounded-pill py-2 fw-bold" onClick={() => setSelectedUser(null)}>Đóng</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MAPPING FACILITY MODAL */}
              {isMappingModalOpen && mappingUser && (
                <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                      <div className="modal-header bg-dark text-white border-0 py-3">
                        <h5 className="modal-title fw-black small text-uppercase tracking-widest">
                          Phân quyền cơ sở cho tài khoản
                        </h5>
                        <button type="button" className="btn-close btn-close-white" onClick={() => setIsMappingModalOpen(false)}></button>
                      </div>
                      <div className="modal-body p-4">
                        <div className="mb-3">
                          <span className="small text-muted d-block">Tài khoản:</span>
                          <strong className="text-dark">{mappingUser.full_name || 'Chưa đặt tên'} ({mappingUser.email})</strong>
                        </div>
                        <label className="small fw-black text-muted text-uppercase tracking-tighter d-block mb-2">Chọn các cơ sở được phép truy cập:</label>
                        
                        {facilities.length === 0 ? (
                          <div className="text-center text-muted p-4 border rounded-3 bg-light">
                            Chưa có cơ sở nào được tạo. Vui lòng tạo cơ sở trước ở tab "Quản lý cơ sở".
                          </div>
                        ) : (
                          <div className="d-flex flex-column gap-2" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                            {facilities.map(fac => {
                              const isChecked = selectedFacilityIds.includes(fac.id);
                              return (
                                <div 
                                  key={fac.id}
                                  onClick={() => handleToggleFacilityAssignment(fac.id)}
                                  className={`d-flex align-items-center justify-content-between p-3 rounded-3 border cursor-pointer transition-all ${
                                    isChecked ? 'bg-primary-subtle border-primary text-primary-emphasis fw-bold' : 'bg-white'
                                  }`}
                                >
                                  <div>
                                    <div style={{ fontSize: '14px' }}>{fac.name}</div>
                                    <div className="text-secondary small fw-normal" style={{ fontSize: '11px' }}>{fac.address || 'Không có địa chỉ'}</div>
                                  </div>
                                  <div>
                                    {isChecked ? <CheckSquare size={20} className="text-primary" /> : <Square size={20} className="text-secondary" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="modal-footer border-0 p-4 pt-0 d-flex gap-2">
                        <button type="button" className="btn btn-light rounded-pill flex-grow-1 py-2 fw-bold" onClick={() => setIsMappingModalOpen(false)}>Hủy</button>
                        <button type="button" className="btn btn-primary rounded-pill flex-grow-1 py-2 fw-bold" onClick={handleSaveMapping}>Lưu phân quyền</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ACTION PERMISSIONS MODAL */}
              {isActionPermModalOpen && actionPermUser && (
                <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                  <div className="modal-dialog modal-dialog-centered modal-lg">
                    <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                      <div className="modal-header border-0 py-3" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}>
                        <div>
                          <h5 className="modal-title fw-black small text-uppercase tracking-widest text-white mb-0">
                            <ShieldCheck size={16} className="me-2" />
                            Phân quyền thao tác trang
                          </h5>
                          <div className="text-white-50 small mt-1" style={{ fontSize: '12px' }}>
                            {actionPermUser.full_name || 'Chưa đặt tên'} — {actionPermUser.email}
                          </div>
                        </div>
                        <button type="button" className="btn-close btn-close-white" onClick={() => setIsActionPermModalOpen(false)}></button>
                      </div>
                      <div className="modal-body p-4">
                        {actionPermUser.role === 'master' ? (
                          <div className="text-center py-4">
                            <ShieldCheck size={48} className="text-danger mb-3" />
                            <h6 className="fw-black text-dark">Tài khoản Master</h6>
                            <p className="text-secondary small">Tài khoản Master luôn có toàn quyền chỉnh sửa trên tất cả các trang. Không thể giới hạn phân quyền cho tài khoản này.</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-secondary small mb-3">
                              Thiết lập quyền cho từng trang. Mặc định là <strong>Chỉnh sửa</strong> nếu chưa cài đặt.
                            </p>
                            <div className="table-responsive rounded-3 border">
                              <table className="table table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
                                <thead className="table-light">
                                  <tr>
                                    <th className="px-4 py-3 border-0 small fw-black text-secondary text-uppercase">Trang</th>
                                    <th className="px-4 py-3 border-0 small fw-black text-secondary text-uppercase text-center">
                                      <span className="text-danger">&#128683; Ẩn</span>
                                    </th>
                                    <th className="px-4 py-3 border-0 small fw-black text-secondary text-uppercase text-center">
                                      <span className="text-primary">&#128065; Chỉ Xem</span>
                                    </th>
                                    <th className="px-4 py-3 border-0 small fw-black text-secondary text-uppercase text-center">
                                      <span className="text-success">&#9998; Chỉnh Sửa</span>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white">
                                  {PAGE_PERMISSION_DEFS.map(page => {
                                    const current = tempActionPerms[page.key] || 'edit';
                                    return (
                                      <tr key={page.key}>
                                        <td className="px-4 py-2 fw-bold text-dark">{page.label}</td>
                                        {(['hide', 'view', 'edit'] as const).map(perm => (
                                          <td key={perm} className="px-4 py-2 text-center">
                                            <div
                                              onClick={() => handleSetActionPerm(page.key, perm)}
                                              className={`d-inline-flex align-items-center justify-content-center rounded-circle border-2 transition-all ${
                                                current === perm
                                                  ? perm === 'hide' ? 'bg-danger border-danger text-white'
                                                    : perm === 'view' ? 'bg-primary border-primary text-white'
                                                    : 'bg-success border-success text-white'
                                                  : 'bg-white border-secondary text-secondary'
                                              }`}
                                              style={{ width: '32px', height: '32px', cursor: 'pointer' }}
                                            >
                                              {current === perm && <Check size={16} />}
                                            </div>
                                          </td>
                                        ))}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-3 p-3 bg-light rounded-3 border small text-secondary">
                              <strong>Ẩn:</strong> Trang bị ẩn khỏi menu và không thể truy cập.
                              &nbsp;&nbsp;<strong>Chỉ Xem:</strong> Chỉ xem dữ liệu, không thể thêm/sửa/xóa.
                              &nbsp;&nbsp;<strong>Chỉnh Sửa:</strong> Toàn quyền thao tác.
                            </div>
                          </>
                        )}
                      </div>
                      <div className="modal-footer border-0 p-4 pt-0 d-flex gap-2">
                        <button type="button" className="btn btn-light rounded-pill flex-grow-1 py-2 fw-bold" onClick={() => setIsActionPermModalOpen(false)}>Hủy</button>
                        {actionPermUser.role !== 'master' && (
                          <button type="button" className="btn btn-dark rounded-pill flex-grow-1 py-2 fw-bold" onClick={handleSaveActionPerms}>Lưu phân quyền</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'facilities' && (
            <div className="py-2">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h5 className="fw-black text-dark text-uppercase mb-0">Danh sách các cơ sở vận hành</h5>
                <button 
                  onClick={() => handleOpenFacilityModal()}
                  className="btn btn-primary d-flex align-items-center gap-2 rounded-pill fw-bold shadow-sm"
                >
                  <Plus size={18} /> Thêm Cơ Sở Mới
                </button>
              </div>

              <div className="table-responsive rounded-4 border">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
                  <thead className="table-light">
                    <tr>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Tên cơ sở</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Địa chỉ</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary">Supabase URL / Connection</th>
                      <th className="px-4 py-3 border-0 small fw-black tracking-widest text-uppercase text-secondary text-end">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {loading ? (
                      <tr><td colSpan={4} className="px-4 py-5 text-center text-muted">Đang tải...</td></tr>
                    ) : facilities.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-5 text-center text-muted italic">Chưa cấu hình cơ sở nào. Hãy thêm cơ sở để bắt đầu vận hành đa luồng DB.</td></tr>
                    ) : (
                      facilities.map(fac => (
                        <tr key={fac.id}>
                          <td className="px-4 py-3 fw-bold text-dark">{fac.name}</td>
                          <td className="px-4 py-3 text-secondary">{fac.address || '—'}</td>
                          <td className="px-4 py-3 text-secondary small font-monospace">
                            <div>{fac.supabase_url}</div>
                            <div className="text-muted" style={{ fontSize: '10px' }}>Anon Key: {fac.supabase_anon_key.substring(0, 15)}...</div>
                          </td>
                          <td className="px-4 py-3 text-end">
                            <div className="d-flex justify-content-end gap-2">
                              <button 
                                onClick={() => handleOpenFacilityModal(fac)}
                                className="btn btn-outline-primary btn-sm rounded-circle p-2 border-0 hover-bg-primary-subtle"
                                title="Sửa cơ sở"
                              >
                                <Edit3 size={18} />
                              </button>
                              <button 
                                onClick={() => handleDeleteFacility(fac.id)}
                                className="btn btn-outline-danger btn-sm rounded-circle p-2 border-0 hover-bg-danger-subtle"
                                title="Xóa cơ sở"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* FACILITY CONFIG FORM MODAL */}
              {isFacilityModalOpen && (
                <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <div className="modal-dialog modal-dialog-centered modal-md">
                    <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                      <div className="modal-header bg-dark text-white border-0 py-3">
                        <h5 className="modal-title fw-black small text-uppercase tracking-widest">
                          {editingFacilityId ? 'Cập nhật cấu hình cơ sở' : 'Thêm cơ sở mới'}
                        </h5>
                        <button type="button" className="btn-close btn-close-white" onClick={() => setIsFacilityModalOpen(false)}></button>
                      </div>
                      <form onSubmit={handleSaveFacility}>
                        <div className="modal-body p-4 row g-3">
                          <div className="col-12">
                            <label className="form-label small fw-bold text-muted">Tên Cơ Sở (*)</label>
                            <input 
                              required type="text"
                              value={facilityForm.name}
                              onChange={e => setFacilityForm({ ...facilityForm, name: e.target.value })}
                              className="form-control"
                              placeholder="VD: Cửa hàng Quận 1"
                            />
                          </div>
                          <div className="col-12">
                            <label className="form-label small fw-bold text-muted">Địa chỉ</label>
                            <input 
                              type="text"
                              value={facilityForm.address}
                              onChange={e => setFacilityForm({ ...facilityForm, address: e.target.value })}
                              className="form-control"
                              placeholder="VD: 123 Đường Nguyễn Huệ, Quận 1"
                            />
                          </div>
                          <div className="col-12">
                            <label className="form-label small fw-bold text-muted">Supabase URL (*)</label>
                            <input 
                              required type="text"
                              value={facilityForm.supabase_url}
                              onChange={e => setFacilityForm({ ...facilityForm, supabase_url: e.target.value })}
                              className="form-control font-monospace"
                              placeholder="VD: https://xyz.supabase.co"
                            />
                          </div>
                          <div className="col-12">
                            <label className="form-label small fw-bold text-muted">Supabase Anon Key (*)</label>
                            <textarea 
                              required
                              rows={3}
                              value={facilityForm.supabase_anon_key}
                              onChange={e => setFacilityForm({ ...facilityForm, supabase_anon_key: e.target.value })}
                              className="form-control font-monospace"
                              placeholder="Nhập Supabase Anon Public Key của cơ sở..."
                            />
                          </div>
                          <div className="col-12">
                            <label className="form-label small fw-bold text-muted">Google Script URL</label>
                            <input 
                              type="url"
                              value={facilityForm.google_script_url}
                              onChange={e => setFacilityForm({ ...facilityForm, google_script_url: e.target.value })}
                              className="form-control font-monospace"
                              placeholder="https://script.google.com/macros/s/.../exec"
                            />
                          </div>
                        </div>
                        <div className="modal-footer border-0 p-4 pt-0 d-flex gap-2">
                          <button type="button" className="btn btn-light rounded-pill flex-grow-1 py-2 fw-bold" onClick={() => setIsFacilityModalOpen(false)}>Hủy</button>
                          <button type="submit" className="btn btn-primary rounded-pill flex-grow-1 py-2 fw-bold">Lưu thông tin</button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'maintenance' && (
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
