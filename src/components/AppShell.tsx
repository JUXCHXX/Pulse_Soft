import { useState, useEffect, useRef, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Calendar,
  Timer,
  Users,
  BarChart3,
  MessageSquare,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Search,
  Bell,
  Plus,
  LogOut,
  User,
  ChevronDown,
  Activity,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar } from '@/components/Avatar';
import { getRol } from '@/lib/constants';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { to: '/tareas', label: 'Tareas', icon: CheckSquare },
  { to: '/calendario', label: 'Calendario', icon: Calendar },
  { to: '/tiempo', label: 'Registro de Tiempo', icon: Timer },
  { to: '/equipo', label: 'Equipo', icon: Users },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/mensajes', label: 'Mensajes', icon: MessageSquare },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
];

export function AppShell() {
  const { usuario, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isPMO = usuario?.rol === 'pmo';
  const isDireccion = usuario?.rol === 'direccion';

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const navItems = isPMO
    ? [...NAV_ITEMS, { to: '/asistente', label: 'Asistente', icon: Sparkles }]
    : NAV_ITEMS;

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg-base)]">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-[var(--bg-sidebar)] flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-caribbean-green/15 flex items-center justify-center">
              <Activity className="w-5 h-5 text-caribbean-green" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-bold text-[var(--text-on-dark)] tracking-tight">
              Pulsesoft
            </span>
          </div>
          <button
            className="lg:hidden text-[var(--text-on-dark)]"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
                <span className="text-sm">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User card */}
        <div className="p-3 border-t border-[var(--border)]" ref={userMenuRef}>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Avatar name={usuario?.nombre ?? '?'} size="md" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-[var(--text-on-dark)] truncate">
                  {usuario?.nombre}
                </p>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  {getRol(usuario?.rol ?? '').label}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${
                  userMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 card p-1.5 animate-fade-in">
                <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--text-primary)] hover:bg-[var(--bg-base)] transition-colors">
                  <User className="w-4 h-4" />
                  Perfil
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-[var(--bg-base)]/80 backdrop-blur-lg border-b border-[var(--border)] px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="lg:hidden text-[var(--text-primary)]"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                Hola, {usuario?.nombre?.split(' ')[0]} <span className="inline-block">👋</span>
              </h1>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Search */}
              <div className="hidden sm:flex relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Buscar…"
                  className="input-field !py-2 !pl-9 w-48 lg:w-64 text-sm"
                />
              </div>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
                title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Notifications */}
              <button className="relative w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full ring-2 ring-[var(--bg-base)]" />
              </button>

              {/* New project */}
              {!isDireccion && (
                <button
                  onClick={() => setShowNewProject(true)}
                  className="btn-primary flex items-center gap-1.5 text-sm whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  <span className="hidden sm:inline">Nuevo Proyecto</span>
                  <span className="sm:hidden">Nuevo</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 animate-fade-in">
          <Outlet context={{ showNewProject, setShowNewProject }} />
        </main>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNewProjectDialog(): [boolean, (v: boolean) => void] {
  const [show, setShow] = useState(false);
  return [show, setShow];
}

// Re-export for type usage
// eslint-disable-next-line react-refresh/only-export-components
export type { ReactNode };
