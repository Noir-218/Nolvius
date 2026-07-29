import { useState, useEffect } from 'react';
import { Outlet, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useFacility } from '../contexts/FacilityContext';
import { usePermissions } from '../hooks/usePermissions';
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
  Sparkles,
  CalendarDays,
  Building,
  RefreshCw,
  Database
} from 'lucide-react';
import { LoungeBubble } from './LoungeBubble';

const navItems = [
  { path: '/', label: 'SOS', icon: ShoppingCart, roles: ['master', 'SM', 'SS', 'MB', 'staff'], pageKey: 'dashboard' },
  { path: '/ingredients', label: 'Nguyên Liệu', icon: Package, roles: ['master', 'SM', 'SS', 'MB'], pageKey: 'ingredients' },
  { path: '/products', label: 'Sản Phẩm', icon: Coffee, roles: ['master', 'SM', 'SS', 'MB'], pageKey: 'products' },
  { path: '/recipes', label: 'Công Thức', icon: BookOpen, roles: ['master', 'SM', 'SS', 'MB'], pageKey: 'recipes' },
  { path: '/stock', label: 'Tồn Kho', icon: Archive, roles: ['master', 'SM', 'SS', 'MB', 'staff'], pageKey: 'stock' },
  { path: '/transactions', label: 'Giao Dịch Kho', icon: ArrowRightLeft, roles: ['master', 'SM', 'SS', 'MB', 'staff'], pageKey: 'transactions' },
  { path: '/sales', label: 'Nhập Bán Hàng', icon: ShoppingCart, roles: ['master', 'SM', 'SS', 'MB', 'staff'], pageKey: 'sales' },
  { path: '/audit', label: 'Kiểm Kê Kho', icon: ClipboardCheck, roles: ['master', 'SM', 'SS', 'MB', 'staff'], pageKey: 'audit' },
  { path: '/analysis', label: 'Phân Tích Tiêu Hao', icon: TrendingUp, roles: ['master', 'SM', 'SS', 'MB'], pageKey: 'analysis' },
  { path: '/forecast', label: 'Dự Đoán Nhập Hàng', icon: Calculator, roles: ['master', 'SM', 'SS', 'MB'], pageKey: 'forecast' },
  { path: '/expenses', label: 'Quản Lý Thu Chi', icon: Home, roles: ['master'], pageKey: 'expenses' },
  { path: '/users', label: 'Quản Trị Người Dùng', icon: UsersIcon, roles: ['master'], pageKey: 'users' },
  { path: '/scheduling', label: 'Xếp Lịch Làm Việc', icon: CalendarDays, roles: ['master', 'SM', 'MB'], pageKey: 'scheduling' },
  { path: '/sync', label: 'Đồng Bộ Dữ Liệu', icon: Database, roles: ['master'], pageKey: 'sync' },
];

const Layout = () => {
  const { session, user, role, fullName, avatarUrl, loading, signOut } = useAuth();
  const { getPagePermission } = usePermissions();
  const { currentFacility, facilities, clearFacility } = useFacility();
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
    return <div className="h-screen flex items-center justify-center bg-cream"><div className="text-muted">Đang tải dữ liệu...</div></div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!currentFacility) {
    return <Navigate to="/select-facility" replace />;
  }

  const handleLogout = async () => {
    clearFacility();
    await signOut();
    navigate('/login');
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);

  const filteredNavItems = navItems.filter(item =>
    (!item.roles || item.roles.includes(role || 'staff')) &&
    getPagePermission(item.pageKey) !== 'hide'
  );

  // Guard: if current page is hidden via action_permissions, redirect to home
  const currentNavItem = navItems.find(item => item.path === location.pathname);
  if (currentNavItem && getPagePermission(currentNavItem.pageKey) === 'hide') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen bg-cream overflow-hidden font-sans border-0">
      <style>{`
        a { text-decoration: none !important; }
        .nav-link { text-decoration: none !important; }
        .active-nav-bg { background-color: #DDE8D9 !important; color: #365542 !important; }
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
        fixed lg:static inset-y-0 left-0 bg-forest flex flex-col z-30 transition-all duration-300 ease-in-out border-r border-forest-dark/20
        ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-[260px]'}
        ${isMenuOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className={`h-[60px] flex items-center px-6 border-b border-forest-dark/20 bg-forest transition-all duration-300 ${isSidebarCollapsed ? 'lg:px-4 justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-forest-dark/30 p-1.5 rounded-xl shrink-0">
              <Coffee size={20} className="text-warm-white" strokeWidth={1.5} />
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

        <nav className="flex-1 overflow-y-auto py-6 scrollbar-hide px-3 space-y-6">
          <div>
            <p className={`px-3 text-[11px] font-semibold text-sage/70 uppercase tracking-widest mb-3 transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:h-0 lg:mb-0' : 'opacity-100'}`}>
              Quản lý vận hành
            </p>
            <ul className="space-y-1.5 list-none">
              {filteredNavItems.slice(0, 10).map((item) => (
              <li key={item.path} className="list-none">
                <NavLink
                  to={item.path}
                  title={isSidebarCollapsed ? item.label : ''}
                  className={({ isActive }) =>
                        `flex items-center px-3 py-2.5 rounded-xl transition-all no-underline group ${isSidebarCollapsed ? 'lg:justify-center lg:px-2' : 'space-x-3'} ${isActive
                          ? 'active-nav-bg font-semibold shadow-sm'
                          : 'text-sage hover:bg-forest-dark/20 hover:text-warm-white opacity-[0.88] hover:opacity-100'
                        }`
                  }
                >
                  <item.icon size={18} strokeWidth={1.5} className={`shrink-0 transition-colors ${location.pathname === item.path ? 'text-forest-dark' : 'text-sage group-hover:text-warm-white'}`} />
                  <span className={`text-[14px] tracking-tight transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:w-0' : 'opacity-100 w-auto'}`}>
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
            </ul>
          </div>
          
          {filteredNavItems.length > 10 && (
            <div>
              <p className={`px-3 text-[11px] font-semibold text-sage/70 uppercase tracking-widest mb-3 mt-6 transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:h-0 lg:mb-0 lg:mt-0' : 'opacity-100'}`}>
                Hệ thống & Nhân sự
              </p>
              <ul className="space-y-1.5 list-none">
                {filteredNavItems.slice(10).map((item) => (
                  <li key={item.path} className="list-none">
                    <NavLink
                      to={item.path}
                      title={isSidebarCollapsed ? item.label : ''}
                      className={({ isActive }) =>
                        `flex items-center px-3 py-2.5 rounded-xl transition-all no-underline group ${isSidebarCollapsed ? 'lg:justify-center lg:px-2' : 'space-x-3'} ${isActive
                          ? 'active-nav-bg font-semibold shadow-sm'
                          : 'text-sage hover:bg-forest-dark/20 hover:text-warm-white opacity-80 hover:opacity-100'
                        }`
                      }
                    >
                      <item.icon size={18} strokeWidth={1.5} className={`shrink-0 transition-colors ${location.pathname === item.path ? 'text-forest-dark' : 'text-sage group-hover:text-warm-white'}`} />
                      <span className={`text-[14px] tracking-tight transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:w-0' : 'opacity-100 w-auto'}`}>
                        {item.label}
                      </span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        <div className={`p-4 bg-forest-dark/30 mt-auto border-t border-forest-dark/20 transition-all duration-300 ${isSidebarCollapsed ? 'lg:p-2 lg:flex lg:flex-col lg:items-center' : ''}`}>
          <NavLink
            to="/profile"
            title={isSidebarCollapsed ? 'Hồ sơ của tôi' : ''}
            className={({ isActive }) =>
              `flex items-center rounded-xl transition-all no-underline mb-2 group ${isSidebarCollapsed ? 'lg:justify-center lg:w-10 lg:h-10 lg:p-0' : 'px-4 py-3 space-x-3'} ${isActive
                ? 'active-nav-bg font-bold'
                : 'text-sage-light hover:bg-forest-light/20 hover:text-warm-white'
              }`
            }
          >
            <UsersIcon size={18} strokeWidth={1.5} className="text-sage group-hover:text-warm-white shrink-0" />
            <span className={`text-sm tracking-tight transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:w-0' : 'opacity-100 w-auto'}`}>
              Hồ sơ của tôi
            </span>
          </NavLink>
          <button
            onClick={handleLogout}
            title={isSidebarCollapsed ? 'Đăng xuất' : ''}
            className={`flex items-center rounded-xl text-rose hover:bg-rose/10 transition-all border-0 ${isSidebarCollapsed ? 'lg:justify-center lg:w-10 lg:h-10 lg:p-0' : 'px-4 py-3 space-x-3 w-full'}`}
          >
            <LogOut size={18} strokeWidth={1.5} className="shrink-0" />
            <span className={`text-sm font-bold transition-all duration-300 whitespace-nowrap overflow-hidden ${isSidebarCollapsed ? 'lg:opacity-0 lg:w-0' : 'opacity-100 w-auto'}`}>
              Đăng xuất
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden w-full bg-cream">
        {/* Header */}
        <header className="h-[60px] bg-warm-white border-b border-soft-gray flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleMenu}
              className="lg:hidden p-2 text-text-muted hover:bg-soft-gray rounded-xl transition-colors"
            >
              <Menu size={22} strokeWidth={1.5} />
            </button>
            <button
              onClick={toggleSidebar}
              className="hidden lg:flex p-2 text-text-muted hover:bg-soft-gray rounded-xl transition-colors"
              title={isSidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            >
              <Menu size={20} strokeWidth={1.5} />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-text-main capitalize tracking-tight leading-none">
                {navItems.find(item => item.path === location.pathname)?.label || 'Quản Lý'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Facility Indicator / Switcher */}
            {currentFacility && (
              <div className="flex items-center gap-2 bg-sage/10 border border-sage/30 px-3 py-1.5 rounded-xl shadow-soft">
                <Building size={16} strokeWidth={1.5} className="text-forest shrink-0" />
                <span className="text-xs font-bold text-forest-dark uppercase tracking-wide truncate max-w-[120px] sm:max-w-[200px]">
                  {currentFacility.name}
                </span>
                {(facilities.length > 1 || role === 'master') && (
                  <button
                    onClick={() => navigate('/select-facility')}
                    className="p-1 hover:bg-sage/20 rounded-lg text-forest transition-colors border-0 bg-transparent flex items-center justify-center"
                    title="Đổi cơ sở hoạt động"
                  >
                    <RefreshCw size={12} strokeWidth={1.5} className="animate-hover" />
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setIsLoungeOpen(!isLoungeOpen)}
              className={`w-10 h-10 flex items-center justify-center rounded-xl border cursor-pointer transition-all shadow-soft group ${isLoungeOpen
                ? 'bg-ochre border-ochre shadow-ochre/30 shadow-lg'
                : 'bg-warm-white border-sage/20 hover:border-ochre/50 hover:bg-ochre/10'
                }`}
              title="Góc Chill Staff"
            >
              <Sparkles
                size={18}
                strokeWidth={1.5}
                className={`transition-all duration-300 ${isLoungeOpen ? 'text-white rotate-12' : 'text-muted group-hover:text-ochre'
                  }`}
              />
            </button>

            <div
              onClick={() => navigate('/profile')}
              className="flex items-center bg-warm-white px-4 py-2 rounded-xl border border-sage/20 hover:border-forest/30 hover:bg-forest/5 cursor-pointer transition-all shadow-soft"
            >
              <div className="flex flex-col text-right mr-3">
                <span className="text-[9px] font-bold text-forest uppercase tracking-widest leading-none mb-1">
                  XIN CHÀO!
                </span>
                <span className="text-xs font-bold text-coffee hidden sm:inline max-w-[150px] truncate leading-none">
                  {fullName || user?.email?.split('@')[0] || 'User'}
                </span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-forest shadow-soft shadow-forest/20 flex items-center justify-center text-warm-white text-sm font-bold uppercase ring-2 ring-warm-white overflow-hidden">
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
          className="flex-1 overflow-y-auto p-4 sm:p-6 bg-cream outline-none"
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
