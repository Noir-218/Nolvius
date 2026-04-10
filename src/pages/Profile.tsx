import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Lock, Save, Key, UserCircle, Shield, AlertCircle, CheckCircle2, Camera } from 'lucide-react';

export default function Profile() {
  const { user, fullName, avatarUrl, refreshProfile } = useAuth();
  
  // Profile state
  const [userName, setUserName] = useState(fullName || '');
  const [updatingName, setUpdatingName] = useState(false);
  
  // Password state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!userName.trim()) return;
    
    setUpdatingName(true);
    setMessage(null);
    
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: userName })
      .eq('id', user.id);
      
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi cập nhật tên: ' + error.message });
    } else {
      await refreshProfile();
      setMessage({ type: 'success', text: 'Đã cập nhật tên người dùng thành công!' });
    }
    setUpdatingName(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Mật khẩu mới phải từ 6 ký tự trở lên' });
      return;
    }
    
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Mật khẩu xác nhận không khớp' });
      return;
    }
    
    setUpdatingPassword(true);
    setMessage(null);
    
    const { error } = await supabase.auth.updateUser({ password });
    
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi cập nhật mật khẩu: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Đã đổi mật khẩu thành công!' });
      setPassword('');
      setConfirmPassword('');
    }
    setUpdatingPassword(false);
  };

  return (
    <div className="container-fluid py-4 animate__animated animate__fadeIn">
      <div className="row justify-content-center">
        <div className="col-12 col-xl-10">
          <div className="mb-4">
            <h1 className="h3 fw-black text-dark mb-1">CÀI ĐẶT TÀI KHOẢN</h1>
            <p className="text-secondary small mb-0">Quản lý thông tin hồ sơ và mật khẩu cá nhân.</p>
          </div>

          {message && (
            <div className={`alert ${message.type === 'success' ? 'alert-success border-success-subtle' : 'alert-danger border-danger-subtle'} shadow-sm rounded-4 mb-4 d-flex align-items-center gap-3`}>
              {message.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
              <div className="fw-bold">{message.text}</div>
            </div>
          )}

          <div className="row g-4">
            {/* profile Column */}
            <div className="col-12 col-lg-6">
              <div className="card border-0 shadow-sm rounded-4 overflow-hidden h-100">
                <div className="card-header bg-white border-bottom p-4">
                  <h5 className="mb-0 fw-black text-dark d-flex align-items-center gap-2">
                    <UserCircle className="text-primary" size={24} /> Thông Tin Hồ Sơ
                  </h5>
                </div>
                <div className="card-body p-4">
                  <div className="text-center mb-5">
                    <div className="relative inline-block group mb-3">
                      <div className="w-24 h-24 rounded-full bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center fw-bold fs-1 mx-auto border-4 border-white shadow-lg overflow-hidden relative">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          (fullName || user?.email || 'U').charAt(0).toUpperCase()
                        )}
                      </div>
                      <label 
                        className="absolute bottom-0 right-0 bg-teal-600 text-white p-2 rounded-full cursor-pointer shadow-lg hover:bg-teal-700 transition-all transform hover:scale-110 border-2 border-white"
                        htmlFor="avatar-upload"
                      >
                        <Camera size={16} />
                        <input 
                          id="avatar-upload" 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !user) return;
                            
                            setUpdatingName(true);
                            try {
                              const fileExt = file.name.split('.').pop();
                              const fileName = `${user.id}-${Math.random()}.${fileExt}`;
                              const filePath = `${fileName}`;
                              
                              // Upload to storage
                              const { error: uploadError } = await supabase.storage
                                .from('avatars')
                                .upload(filePath, file);
                                
                              if (uploadError) throw uploadError;
                              
                              // Get public URL
                              const { data: { publicUrl } } = supabase.storage
                                .from('avatars')
                                .getPublicUrl(filePath);
                                
                              // Update profile
                              const { error: updateError } = await supabase
                                .from('profiles')
                                .update({ avatar_url: publicUrl })
                                .eq('id', user.id);
                                
                              if (updateError) throw updateError;
                              
                              await refreshProfile();
                              setMessage({ type: 'success', text: 'Đã cập nhật ảnh đại diện thành công!' });
                            } catch (err: any) {
                              setMessage({ type: 'error', text: 'Lỗi tải ảnh: ' + err.message });
                            }
                            setUpdatingName(false);
                          }}
                        />
                      </label>
                    </div>
                    <h5 className="fw-black text-dark mb-1">{fullName || 'Chưa đặt tên'}</h5>
                    <p className="text-muted small">{user?.email}</p>
                  </div>

                  <form onSubmit={handleUpdateName}>
                    <div className="mb-4">
                      <label className="form-label small fw-black text-secondary text-uppercase tracking-wider">Tên người dùng (Hiển thị)</label>
                      <div className="input-group">
                        <span className="input-group-text bg-light border-end-0"><User size={18} className="text-muted" /></span>
                        <input 
                          type="text" 
                          className="form-control border-start-0" 
                          value={userName}
                          onChange={e => setUserName(e.target.value)}
                          placeholder="Nhập tên của bạn..."
                        />
                      </div>
                      <div className="form-text small italic mt-2">Ví dụ: Nam, Lan, Admin... Đây là tên sẽ xuất hiện trong các biên bản kiểm kê.</div>
                    </div>

                    <button 
                      type="submit" 
                      disabled={updatingName}
                      className="btn btn-primary w-100 py-3 rounded-pill fw-black text-uppercase tracking-widest shadow-lg d-flex align-items-center justify-content-center gap-2"
                    >
                      {updatingName ? (
                        <div className="spinner-border spinner-border-sm" role="status"></div>
                      ) : (
                        <Save size={18} />
                      )}
                      CẬP NHẬT TÊN HIỂN THỊ
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Password Column */}
            <div className="col-12 col-lg-6">
              <div className="card border-0 shadow-sm rounded-4 overflow-hidden h-100">
                <div className="card-header bg-white border-bottom p-4">
                  <h5 className="mb-0 fw-black text-dark d-flex align-items-center gap-2">
                    <Shield className="text-danger" size={24} /> Bảo Mật & Mật Khẩu
                  </h5>
                </div>
                <div className="card-body p-4">
                  <div className="alert alert-warning border-warning-subtle rounded-3 small mb-4">
                     Vui lòng sử dụng mật khẩu mạnh để bảo vệ tài khoản. Hệ thống khuyến nghị mật khẩu có tối thiểu 6 ký tự.
                  </div>

                  <form onSubmit={handleUpdatePassword}>
                    <div className="mb-3">
                      <label className="form-label small fw-black text-secondary text-uppercase tracking-wider">Mật khẩu mới</label>
                      <div className="input-group">
                        <span className="input-group-text bg-light border-end-0"><Lock size={18} className="text-muted" /></span>
                        <input 
                          type="password" 
                          className="form-control border-start-0" 
                          placeholder="••••••••"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="form-label small fw-black text-secondary text-uppercase tracking-wider">Xác nhận mật khẩu</label>
                      <div className="input-group">
                        <span className="input-group-text bg-light border-end-0"><Key size={18} className="text-muted" /></span>
                        <input 
                          type="password" 
                          className="form-control border-start-0" 
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                        />
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      disabled={updatingPassword}
                      className="btn btn-danger w-100 py-3 rounded-pill fw-black text-uppercase tracking-widest shadow-lg d-flex align-items-center justify-content-center gap-2"
                    >
                      {updatingPassword ? (
                        <div className="spinner-border spinner-border-sm" role="status"></div>
                      ) : (
                        <Lock size={18} />
                      )}
                      ĐỔI MẬT KHẨU NGAY
                    </button>
                  </form>

                  <div className="mt-5 p-3 bg-light rounded-3">
                    <h6 className="small fw-black text-dark text-uppercase mb-2">Thông tin đăng nhập</h6>
                    <div className="d-flex justify-content-between small">
                      <span className="text-secondary">Email:</span>
                      <span className="fw-bold">{user?.email}</span>
                    </div>
                    <div className="d-flex justify-content-between small mt-1">
                      <span className="text-secondary">Lần đăng nhập cuối:</span>
                      <span className="fw-bold">{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '---'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
