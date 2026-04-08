import { useState, useEffect } from 'react';
import { Outlet, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LogOut,
  Home,
  Package,
  Coffee,
  BookOpen,
  Archive,
  ArrowRightLeft,
  ShoppingCart,
  ClipboardCheck,
  TrendingUp,
  Calculator,
  Menu,
  X,
  Users as UsersIcon
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'SOS', icon: ShoppingCart, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/ingredients', label: 'Nguyên Liệu', icon: Package, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/products', label: 'Sản Phẩm', icon: Coffee, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/recipes', label: 'Công Thức', icon: BookOpen, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/stock', label: 'Tồn Kho', icon: Archive, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/transactions', label: 'Giao Dịch Kho', icon: ArrowRightLeft, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/sales', label: 'Nhập Bán Hàng', icon: ShoppingCart, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/audit', label: 'Kiểm Kê Kho', icon: ClipboardCheck, roles: ['master', 'SM', 'SS', 'MB', 'staff'] },
  { path: '/analysis', label: 'Phân Tích Tiêu Hao', icon: TrendingUp, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/forecast', label: 'Dự Đoán Nhập Hàng', icon: Calculator, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/expenses', label: 'Quản Lý Thu Chi', icon: Home, roles: ['master'] },
  { path: '/users', label: 'Quản Trị Người Dùng', icon: UsersIcon, roles: ['master'] },
];

const Layout = () => {
  const { session, user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-500">Đang tải dữ liệu...</div></div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const filteredNavItems = navItems.filter(item =>
    !item.roles || item.roles.includes(role || 'staff')
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col shadow-xl lg:shadow-sm z-30 transition-transform duration-300 ease-in-out
        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 bg-blue-600">
          <h1 className="text-lg font-bold text-white truncate">NVC ALL IN ONE</h1>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="lg:hidden text-white p-1 hover:bg-blue-700 rounded-md"
          >
            <X size={24} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {filteredNavItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${isActive
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <item.icon size={20} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-3 py-2.5 w-full rounded-lg text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 shadow-sm z-10 transition-all duration-300">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleMenu}
              className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Toggle menu"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-800 line-clamp-1">
              {navItems.find(item => item.path === location.pathname)?.label || 'Quản Lý Kho'}
            </h2>
          </div>

          <div className="flex items-center bg-gray-100 px-2 sm:px-3 py-1.5 rounded-full border border-gray-200">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold mr-2 uppercase">
              {role?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-blue-700 uppercase leading-none mb-0.5" style={{ fontSize: '10px' }}>
                {role || 'staff'}
              </span>
              <span className="text-sm font-medium text-gray-700 hidden xs:inline max-w-[100px] truncate leading-none">
                {user?.email?.split('@')[0] || 'User'}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/50">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;
