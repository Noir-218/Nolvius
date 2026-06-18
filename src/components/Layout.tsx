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
  Users as UsersIcon,
  Sparkles
} from 'lucide-react';
import { LoungeBubble } from './LoungeBubble';

const navItems = [
  { path: '/', label: 'SOS', icon: ShoppingCart, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/ingredients', label: 'Nguyên Liệu', icon: Package, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/products', label: 'Sản Phẩm', icon: Coffee, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/recipes', label: 'Công Thức', icon: BookOpen, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/stock', label: 'Tồn Kho', icon: Archive, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/transactions', label: 'Giao Dịch Kho', icon: ArrowRightLeft, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/sales', label: 'Nhập Bán Hàng', icon: ShoppingCart, roles: ['master', 'SM', 'SS', 'MB', 'staff'] },
  { path: '/audit', label: 'Kiểm Kê Kho', icon: ClipboardCheck, roles: ['master', 'SM', 'SS', 'MB', 'staff'] },
  { path: '/analysis', label: 'Phân Tích Tiêu Hao', icon: TrendingUp, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/forecast', label: 'Dự Đoán Nhập Hàng', icon: Calculator, roles: ['master', 'SM', 'SS', 'MB'] },
  { path: '/expenses', label: 'Quản Lý Thu Chi', icon: Home, roles: ['master'] },
  { path: '/users', label: 'Quản Trị Người Dùng', icon: UsersIcon, roles: ['master'] },

];

const Layout = () => {
  const { session, user, role, fullName, avatarUrl, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoungeOpen, setIsLoungeOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Auto-focus the main content area when the app loads so the page captures
  // keyboard events immediately — without requiring the user to click first.
  // This is required for Ctrl+F and "/" shortcuts to work right after page load.
  useEffect(() => {
    const mainContent = document.getElementById('main-content-area');
    if (mainContent) mainContent.focus();
  }, [location.pathname]);

  // Global search shortcuts: Ctrl+F, Ctrl+Shift+F, and "/"
  // Ctrl+F works only after the page has focus (user clicked OR auto-focus above kicked in).
  // Ctrl+K is a Chrome-reserved shortcut (address bar) — do NOT use it.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;

      // Ctrl+F or Ctrl+Shift+F — block Chrome's Find bar, focus app search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        const searchInput = document.getElementById('main-search-input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // "/" shortcut — like GitHub / YouTube (only when not typing in an input)
      if (e.key === '/' && !isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const searchInput = document.getElementById('main-search-input') as HTMLInputElement;
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

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
  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);

  const filteredNavItems = navItems.filter(item =>
    !item.roles || item.roles.includes(role || 'staff')
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans border-0">
      {/* Global Style Override for underling and premium Feel */}
      <style>{`
        a { text-decoration: none !important; }
        .nav-link { text-decoration: none !important; }
        .premium-shadow { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02) !important; }
        .active-nav-bg { background-color: #f0f9f9 !important; color: #0d9488 !important; }
      `}</style>

      {/* Mobile Sidebar Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-gray-900/40 z-20 lg:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 bg-white border-r border-gray-100 flex flex-col shadow-xl lg:shadow-none z-30 transition-all duration-300 ease-in-out
        ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
        ${isMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className={`h-16 flex items-center px-6 border-b border-gray-100 bg-teal-800 transition-all duration-300 ${isSidebarCollapsed ? 'lg:px-4 justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="bg-white/10 p-1.5 rounded-lg shrink-0">
              <Coffee size={20} className="text-white" />
            </div>
            <h1 className={`text-sm font-black text-white tracking-widest uppercase truncate transition-all duration-300 ${isSidebarCollapsed ? 'lg:opacity-0 lg:w-0' : 'opacity-100 w-auto'}`}>
              NVC MANAGER
            </h1>
          </div>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="lg:hidden text-white/70 hover:text-white p-1"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 scrollbar-hide">
          <p className={`px-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:h-0 lg:mb-0' : 'opacity-100'}`}>
            Danh mục chính
          </p>
          <ul className="space-y-1 px-3 list-none">
            {filteredNavItems.map((item) => (
              <li key={item.path} className="list-none">
                <NavLink
                  to={item.path}
                  title={isSidebarCollapsed ? item.label : ''}
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3 rounded-xl transition-all no-underline group ${isSidebarCollapsed ? 'lg:justify-center lg:px-2' : 'space-x-3'} ${isActive
                      ? 'active-nav-bg font-black'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <item.icon size={18} className={`shrink-0 transition-colors ${location.pathname === item.path ? 'text-teal-600' : 'text-gray-400 group-hover:text-gray-700'}`} />
                  <span className={`text-sm tracking-tight transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:w-0' : 'opacity-100 w-auto'}`}>
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className={`p-4 bg-gray-50/50 mt-auto border-t border-gray-100 transition-all duration-300 ${isSidebarCollapsed ? 'lg:p-2 lg:flex lg:flex-col lg:items-center' : ''}`}>
          <NavLink
            to="/profile"
            title={isSidebarCollapsed ? 'Hồ sơ của tôi' : ''}
            className={({ isActive }) =>
              `flex items-center rounded-xl transition-all no-underline mb-2 group ${isSidebarCollapsed ? 'lg:justify-center lg:w-10 lg:h-10 lg:p-0' : 'px-4 py-3 space-x-3'} ${isActive
                ? 'active-nav-bg font-black'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <UsersIcon size={18} className="text-gray-400 group-hover:text-gray-700 shrink-0" />
            <span className={`text-sm tracking-tight transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:w-0' : 'opacity-100 w-auto'}`}>
              Hồ sơ của tôi
            </span>
          </NavLink>
          <button
            onClick={handleLogout}
            title={isSidebarCollapsed ? 'Đăng xuất' : ''}
            className={`flex items-center rounded-xl text-red-600 hover:bg-red-50 transition-all border-0 ${isSidebarCollapsed ? 'lg:justify-center lg:w-10 lg:h-10 lg:p-0' : 'px-4 py-3 space-x-3 w-full'}`}
          >
            <LogOut size={18} className="shrink-0" />
            <span className={`text-sm font-bold transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:w-0' : 'opacity-100 w-auto'}`}>
              Đăng xuất
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full bg-[#FAFAFA]">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleMenu}
              className="lg:hidden p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <Menu size={22} />
            </button>
            <button
              onClick={toggleSidebar}
              className="hidden lg:flex p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors"
              title={isSidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            >
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-lg font-black text-gray-800 tracking-tight leading-none">
                {navItems.find(item => item.path === location.pathname)?.label || 'Quản Lý'}
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Coffee Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsLoungeOpen(!isLoungeOpen)}
              className={`w-10 h-10 flex items-center justify-center rounded-2xl border cursor-pointer transition-all premium-shadow group ${isLoungeOpen
                ? 'bg-amber-500 border-amber-400 shadow-amber-200 shadow-lg'
                : 'bg-gray-50 border-gray-100 hover:border-amber-300 hover:bg-amber-50/40'
                }`}
              title="Góc Chill Staff"
            >
              <Sparkles
                size={18}
                className={`transition-all duration-300 ${isLoungeOpen ? 'text-white rotate-12' : 'text-gray-400 group-hover:text-amber-500'
                  }`}
              />
            </button>

            <div
              onClick={() => navigate('/profile')}
              className="flex items-center bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100 hover:border-teal-200 hover:bg-teal-50/30 cursor-pointer transition-all premium-shadow"
            >
              <div className="flex flex-col text-right mr-3">
                <span className="text-[9px] font-black text-teal-600 uppercase tracking-widest leading-none mb-1">
                  XIN CHÀO!
                </span>
                <span className="text-xs font-black text-gray-800 hidden sm:inline max-w-[150px] truncate leading-none">
                  {fullName || user?.email?.split('@')[0] || 'User'}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-teal-600 shadow-lg shadow-teal-200 flex items-center justify-center text-white text-sm font-black uppercase ring-2 ring-white overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  (fullName || user?.email || 'U').charAt(0).toUpperCase()
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content — tabIndex={-1} allows programmatic focus without visible outline */}
        <div
          id="main-content-area"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/50 outline-none"
        >
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Lounge Bubble */}
      <LoungeBubble isOpen={isLoungeOpen} onClose={() => setIsLoungeOpen(false)} />
    </div>
  );
};

export default Layout;
