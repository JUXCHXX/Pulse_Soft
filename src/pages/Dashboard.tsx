import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  CheckSquare,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Avatar, AvatarStack } from '@/components/Avatar';
import { Badge, ProgressBar } from '@/components/Badge';
import {
  getEstadoProyecto,
  getEstadoTarea,
  getPrioridad,
} from '@/lib/constants';
import {
  formatCurrency,
  formatHours,
  formatRelativeTime,
  isOverdue,
  daysUntil,
} from '@/lib/format';
import type {
  VwProyectoResumen,
  VwCargaConsultor,
  VwCronometroActivo,
  Tarea,
  Proyecto,
} from '@/lib/types';

export function Dashboard() {
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [proyectos, setProyectos] = useState<VwProyectoResumen[]>([]);
  const [cargaConsultores, setCargaConsultores] = useState<VwCargaConsultor[]>([]);
  const [cronometros, setCronometros] = useState<VwCronometroActivo[]>([]);
  const [tareasAlertas, setTareasAlertas] = useState<
    (Tarea & { proyectos: { nombre: string } | null; tarea_asignados: { usuarios: { nombre: string } | null }[] })[]
  >([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [resProy, resCarga, resCron, resTareas] = await Promise.all([
        supabase.from('vw_proyecto_resumen').select('*').order('nombre', { ascending: true }),
        supabase.from('vw_carga_consultor').select('*').order('tareas_atrasadas', { ascending: false }),
        supabase.from('vw_cronometros_activos').select('*'),
        supabase
          .from('tareas')
          .select('*, proyectos(nombre), tarea_asignados(usuarios(nombre))')
          .order('fecha_limite', { ascending: true })
          .limit(10),
      ]);

      if (resProy.error) console.error('Error cargando resumen de proyectos:', resProy.error);
      if (resCarga.error) console.error('Error cargando carga de consultores:', resCarga.error);
      if (resCron.error) console.error('Error cargando cronómetros:', resCron.error);
      if (resTareas.error) console.error('Error cargando alertas de tareas:', resTareas.error);
      if (resProy.data) setProyectos(resProy.data as VwProyectoResumen[]);
      if (resCarga.data) setCargaConsultores(resCarga.data as VwCargaConsultor[]);
      if (resCron.data) setCronometros(resCron.data as VwCronometroActivo[]);
      if (resTareas.data) setTareasAlertas(resTareas.data as typeof tareasAlertas);
      setLoading(false);
    }
    load();
  }, []);

  const totalProyectos = proyectos.length;
  const proyectosActivos = proyectos.filter((p) => p.estado === 'en_progreso').length;
  const totalTareas = proyectos.reduce((sum, p) => sum + Number(p.total_tareas), 0);
  const tareasCompletadas = proyectos.reduce((sum, p) => sum + Number(p.tareas_completadas), 0);
  const tareasAtrasadas = proyectos.reduce((sum, p) => sum + Number(p.tareas_atrasadas), 0);
  const costoTotal = proyectos.reduce((sum, p) => sum + Number(p.costo_real_total), 0);

  const donutData = [
    { name: 'Completadas', value: tareasCompletadas, color: '#00DF81' },
    {
      name: 'En progreso',
      value: totalTareas - tareasCompletadas - tareasAtrasadas,
      color: '#2CC295',
    },
    { name: 'Pendientes', value: tareasAtrasadas, color: '#F5A524' },
  ].filter((d) => d.value > 0);

  const trendData = proyectos.slice(0, 8).map((proyecto) => ({
    proyecto: proyecto.nombre.length > 18 ? `${proyecto.nombre.slice(0, 18)}…` : proyecto.nombre,
    progreso: Math.round(proyecto.progreso_pct ?? 0),
  }));

  const alertas = tareasAlertas
    .filter((t) => t.fecha_limite)
    .slice(0, 6)
    .map((t) => {
      const overdue = isOverdue(t.fecha_limite, t.estado);
      const days = daysUntil(t.fecha_limite);
      let type = 'info';
      if (t.estado === 'hecho') type = 'success';
      else if (overdue) type = 'danger';
      else if (days !== null && days <= 3) type = 'warning';
      return { tarea: t, type };
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (totalProyectos === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <div className="w-16 h-16 rounded-2xl bg-caribbean-green/10 flex items-center justify-center mb-4">
          <FolderKanban className="w-8 h-8 text-caribbean-green" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
          Bienvenido a Pulsesoft
        </h2>
        <p className="text-[var(--text-secondary)] max-w-md">
          No hay proyectos cargados todavía. Ve a Configuración → Cargar datos para importar tu
          Excel, o crea un proyecto nuevo con el botón superior.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FolderKanban}
          label="Proyectos activos"
          value={proyectosActivos.toString()}
          change="+2"
          changeUp
          color="caribbean-green"
        />
        <StatCard
          icon={CheckSquare}
          label="Tareas completadas"
          value={tareasCompletadas.toString()}
          change="+12%"
          changeUp
          color="mountain-meadow"
        />
        <StatCard
          icon={Clock}
          label="Horas registradas"
          value={formatHours(cargaConsultores.reduce((s, c) => s + c.horas_registradas_totales, 0))}
          change="+8h"
          changeUp
          color="info"
        />
        <StatCard
          icon={TrendingUp}
          label="Costo real total"
          value={formatCurrency(costoTotal)}
          change="-5%"
          changeUp={false}
          color="warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut chart */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
            Progreso general
          </h3>
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {donutData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-[var(--text-primary)]">
                {totalTareas > 0 ? Math.round((tareasCompletadas / totalTareas) * 100) : 0}%
              </span>
              <span className="text-xs text-[var(--text-secondary)]">completado</span>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-[var(--text-secondary)]">{d.name}</span>
                </div>
                <span className="font-semibold text-[var(--text-primary)]">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trend chart */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
              Progreso de proyectos recientes
            </h3>
            <span className="text-xs text-[var(--text-secondary)]">Datos reales</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorProgreso" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00DF81" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00DF81" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="proyecto" stroke="var(--text-secondary)" fontSize={12} />
                <YAxis stroke="var(--text-secondary)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="progreso"
                  stroke="#00DF81"
                  strokeWidth={2.5}
                  fill="url(#colorProgreso)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workload */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
            Carga de trabajo
          </h3>
          <div className="space-y-4">
            {cargaConsultores.slice(0, 5).map((c) => (
              <div key={c.usuario_id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.nombre} size="sm" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">{c.nombre}</span>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {c.tareas_asignadas_activas} tareas
                  </span>
                </div>
                <ProgressBar
                  value={c.tareas_asignadas_activas}
                  max={Math.max(10, ...cargaConsultores.map((x) => x.tareas_asignadas_activas))}
                  color={c.tareas_atrasadas > 0 ? '#F45B69' : '#00DF81'}
                />
                {c.tareas_atrasadas > 0 && (
                  <p className="text-xs text-danger">{c.tareas_atrasadas} atrasadas</p>
                )}
              </div>
            ))}
            {cargaConsultores.length === 0 && (
              <p className="text-sm text-[var(--text-secondary)] text-center py-4">
                Sin datos de carga
              </p>
            )}
          </div>
        </div>

        {/* Alerts feed */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
            Alertas recientes
          </h3>
          <div className="space-y-3">
            {alertas.length === 0 && (
              <p className="text-sm text-[var(--text-secondary)] text-center py-4">
                Sin alertas
              </p>
            )}
            {alertas.map((a, i) => {
              const t = a.tarea;
              const iconBg = {
                danger: 'bg-danger/15 text-danger',
                warning: 'bg-warning/15 text-warning',
                success: 'bg-success/15 text-success',
                info: 'bg-info/15 text-info',
              }[a.type] ?? 'bg-info/15 text-info';
              const Icon =
                a.type === 'danger'
                  ? AlertTriangle
                  : a.type === 'success'
                    ? CheckCircle2
                    : a.type === 'warning'
                      ? Clock
                      : MessageSquare;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{t.nombre}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {t.proyectos?.nombre} · {formatRelativeTime(t.fecha_limite)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active timers */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
            Cronómetros activos
          </h3>
          <div className="space-y-3">
            {cronometros.length === 0 && (
              <p className="text-sm text-[var(--text-secondary)] text-center py-4">
                Nadie está registrando tiempo ahora
              </p>
            )}
            {cronometros.map((c) => (
              <ActiveTimer key={c.registro_id} cronometro={c} />
            ))}
          </div>
        </div>
      </div>

      {/* Projects table */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Proyectos recientes</h3>
          <Link
            to="/proyectos"
            className="text-sm text-[var(--accent)] hover:underline font-medium"
          >
            Ver todos
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">
                  Proyecto
                </th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">
                  Estado
                </th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">
                  Prioridad
                </th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">
                  Progreso
                </th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] pb-3">
                  Costo real
                </th>
              </tr>
            </thead>
            <tbody>
              {proyectos.slice(0, 6).map((p) => {
                const estado = getEstadoProyecto(p.estado);
                const prioridad = getPrioridad(p.prioridad);
                return (
                  <tr
                    key={p.proyecto_id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-base)] transition-colors cursor-pointer"
                    onClick={() => (window.location.href = `/proyectos/${p.proyecto_id}`)}
                  >
                    <td className="py-3 pr-4">
                      <Link
                        to={`/proyectos/${p.proyecto_id}`}
                        className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                      >
                        {p.nombre}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge color={estado.color}>{estado.label}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge color={prioridad.color}>{prioridad.label}</Badge>
                    </td>
                    <td className="py-3 pr-4 w-40">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={p.progreso_pct ?? 0} />
                        <span className="text-xs text-[var(--text-secondary)] w-10">
                          {Math.round(p.progreso_pct ?? 0)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-sm font-medium text-[var(--text-primary)]">
                      {formatCurrency(p.costo_real_total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  change,
  changeUp,
  color,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
  change: string;
  changeUp: boolean;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    'caribbean-green': 'bg-caribbean-green/15 text-caribbean-green',
    'mountain-meadow': 'bg-mountain-meadow/15 text-mountain-meadow',
    'info': 'bg-info/15 text-info',
    'warning': 'bg-warning/15 text-warning',
  };
  return (
    <div className="card p-5 card-hover">
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div
          className={`flex items-center gap-0.5 text-xs font-medium ${
            changeUp ? 'text-success' : 'text-danger'
          }`}
        >
          {changeUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {change}
        </div>
      </div>
      <p className="text-2xl font-bold text-[var(--text-primary)] mt-3">{value}</p>
      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{label}</p>
    </div>
  );
}

function ActiveTimer({ cronometro }: { cronometro: VwCronometroActivo }) {
  const [elapsed, setElapsed] = useState(cronometro.segundos_transcurridos);

  useEffect(() => {
    const start = new Date(cronometro.inicio).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [cronometro.inicio]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = Math.floor(elapsed % 60);

  return (
    <div className="flex items-center gap-3 p-2 rounded-xl bg-[var(--bg-base)]">
      <Avatar name={cronometro.consultor} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {cronometro.consultor}
        </p>
        <p className="text-xs text-[var(--text-secondary)] truncate">{cronometro.tarea}</p>
      </div>
      <div className="flex items-center gap-1.5 text-sm font-mono font-semibold text-caribbean-green">
        <span className="w-2 h-2 bg-caribbean-green rounded-full animate-pulse" />
        {h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`}
      </div>
    </div>
  );
}
