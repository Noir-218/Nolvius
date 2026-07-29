import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFacility, Facility } from '../contexts/FacilityContext';
import { supabase } from '../lib/supabase';
import { Coffee, MapPin, Building, ArrowRight, Shield } from 'lucide-react';

const FacilitySelect: React.FC = () => {
  const { user, signOut, role } = useAuth();
  const { selectFacility, facilities, setFacilitiesList, clearFacility } = useFacility();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserFacilities = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        // Query facilities that user has access to
        const { data, error: queryError } = await supabase
          .from('user_facilities' as any)
          .select('facility:facilities(*)')
          .eq('user_id', user.id);

        if (queryError) throw queryError;

        let userFacilities: Facility[] = [];
        if (data) {
          userFacilities = data
            .map((item: any) => item.facility)
            .filter((fac): fac is Facility => fac !== null);
        }

        // Nếu là role master, có thể lấy tất cả các cơ sở hiện có
        if (role === 'master') {
          const { data: allFacilities, error: allErr } = await supabase
            .from('facilities' as any)
            .select('*');

          if (!allErr && allFacilities) {
            userFacilities = allFacilities as unknown as Facility[];
          }
        }

        setFacilitiesList(userFacilities);

        // Nếu user chỉ được quyền quản lý đúng 1 cơ sở, chọn tự động và vào trang chủ luôn
        if (userFacilities.length === 1) {
          selectFacility(userFacilities[0]);
          navigate('/');
        } else if (userFacilities.length === 0) {
          setError('Tài khoản của bạn chưa được cấp quyền quản lý cơ sở nào. Vui lòng liên hệ Master.');
        }
      } catch (err: any) {
        console.error('Error fetching facilities:', err);
        setError('Có lỗi xảy ra khi tải danh sách cơ sở: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserFacilities();
  }, [user, role]);

  const handleSelect = (facility: Facility) => {
    selectFacility(facility);
    navigate('/');
  };

  const handleLogout = async () => {
    clearFacility();
    await signOut();
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <style>{`
        .facility-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .facility-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 20px -8px rgba(13, 148, 136, 0.15);
          border-color: #557A61 !important;
        }
      `}</style>
      <div className="max-w-2xl w-full space-y-8 bg-white p-8 sm:p-10 rounded-2xl shadow-xl border border-gray-100">
        <div className="text-center">
          <div className="bg-teal-600 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
            <Coffee className="text-white w-8 h-8" />
          </div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight uppercase">
            CHỌN CƠ SỞ HOẠT ĐỘNG
          </h2>
          <p className="mt-2 text-sm font-semibold text-gray-500 uppercase tracking-widest">
            Chọn một cơ sở để bắt đầu quản lý
          </p>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500 font-bold">
            <div className="spinner-border text-teal-600 spinner-border-sm me-2" role="status"></div>
            Đang tải danh sách cơ sở...
          </div>
        ) : error ? (
          <div className="space-y-4">
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold border border-red-100 flex items-center gap-2">
              <span className="bg-red-600 w-1.5 h-1.5 rounded-full shrink-0"></span>
              {error}
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-3 border border-transparent text-sm font-black rounded-xl text-white bg-red-600 hover:bg-red-700 transition-all shadow-md active:scale-95"
            >
              ĐĂNG XUẤT TÀI KHOẢN
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-h-[350px] overflow-y-auto pr-1">
              {facilities.map((fac) => (
                <div
                  key={fac.id}
                  onClick={() => handleSelect(fac)}
                  className="facility-card cursor-pointer p-5 bg-white border border-gray-200 rounded-2xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Building size={18} className="text-teal-600 shrink-0" />
                      <h3 className="font-black text-gray-800 text-base leading-tight truncate uppercase">
                        {fac.name}
                      </h3>
                    </div>
                    {fac.address && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-500 leading-snug mb-4">
                        <MapPin size={13} className="shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{fac.address}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50 text-teal-600 text-xs font-bold uppercase tracking-wider">
                    <span>Vào cơ sở</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 font-bold uppercase">
                <Shield size={14} />
                <span>Tài khoản: {user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-sm font-bold text-gray-500 hover:text-red-600 transition-colors uppercase tracking-widest"
              >
                Đăng xuất →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FacilitySelect;
