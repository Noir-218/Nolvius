import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (isSignUp) {
      if (!fullName.trim()) {
        setError('Vui lòng nhập tên của bạn.');
        setLoading(false);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
      } else if (data.user) {
        // Create profile in Database
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            email: email,
            full_name: fullName,
            role: 'staff' // Default role
          });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          // Still success but profile might be missing name, user can fix later
        }

        setSuccess('Đăng ký thành công! Bạn có thể đăng nhập ngay.');
        setIsSignUp(false);
        setFullName('');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        navigate('/');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 border py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <div>
          <div className="bg-teal-600 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
            <span className="text-white text-3xl font-black">C</span>
          </div>
          <h2 className="mt-4 text-center text-3xl font-black text-gray-900 tracking-tighter uppercase">
            {isSignUp ? 'Tạo Tài Khoản' : 'Hệ Thống Kho'}
          </h2>
          <p className="mt-2 text-center text-sm font-medium text-gray-500 uppercase tracking-widest">
            {isSignUp ? 'Đăng ký để bắt đầu' : 'Quán Cà Phê'}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold border border-red-100 flex items-center gap-2 animate__animated animate__shakeX">
              <span className="bg-red-600 w-1.5 h-1.5 rounded-full"></span>
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 text-green-600 p-4 rounded-xl text-sm font-bold border border-green-100 flex items-center gap-2">
              <span className="bg-green-600 w-1.5 h-1.5 rounded-full"></span>
              {success}
            </div>
          )}

          <div className="rounded-md space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 ms-1">Tên người dùng</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nam, Lan..."
                  className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all shadow-sm"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 ms-1">Email</label>
              <input
                type="email"
                required
                placeholder="email@example.com"
                className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all shadow-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1 ms-1">Mật khẩu</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="appearance-none block w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all shadow-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-black rounded-xl text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              {loading ? 'Đang xử lý...' : (isSignUp ? 'ĐĂNG KÝ NGAY' : 'ĐĂNG NHẬP')}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setSuccess(null);
                }}
                className="text-sm font-bold text-gray-500 hover:text-teal-600 transition-colors uppercase tracking-widest"
              >
                {isSignUp ? 'Tôi đã có tài khoản →' : 'Tôi chưa có tài khoản ←'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
