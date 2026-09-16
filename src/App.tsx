import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { Login } from '@/pages/Login';
import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { Proyectos } from '@/pages/Proyectos';
import { ProyectoDetalle } from '@/pages/ProyectoDetalle';
import { Tareas } from '@/pages/Tareas';
import { Calendario } from '@/pages/Calendario';
import { RegistroTiempo } from '@/pages/RegistroTiempo';
import { Cronometro } from '@/pages/Cronometro';
import { Equipo } from '@/pages/Equipo';
import { Reportes } from '@/pages/Reportes';
import { Configuracion } from '@/pages/Configuracion';
import { Asistente } from '@/pages/Asistente';
import { Mensajes } from '@/pages/Mensajes';

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)] text-sm">Cargando Pulsesoft…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/proyectos" element={<Proyectos />} />
        <Route path="/proyectos/:id" element={<ProyectoDetalle />} />
        <Route path="/tareas" element={<Tareas />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/tiempo" element={<RegistroTiempo />} />
        <Route path="/cronometro" element={<Cronometro />} />
        <Route path="/equipo" element={<Equipo />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/mensajes" element={<Mensajes />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="/asistente" element={<Asistente />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)] text-sm">Cargando Pulsesoft…</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
