import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Star,
  Share2,
  Edit3,
  FolderKanban,
  Calendar,
  DollarSign,
  Clock,
  Plus,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Avatar, AvatarStack } from '@/components/Avatar';
import { Badge, ProgressBar } from '@/components/Badge';
import {
  getEstadoProyecto,
  getEstadoTarea,
  getPrioridad,
  getCategoria,
} from '@/lib/constants';
import {
  formatCurrency,
  formatDate,
  formatHours,
  formatRelativeTime,
  isOverdue,
} from '@/lib/format';
import type { Proyecto, Tarea, Usuario, ProyectoRol, Comunicacion } from '@/lib/types';

type Tab = 'resumen' | 'tareas' | 'cronograma' | 'archivos' | 'discusiones' | 'reportes';
type ProyectoProceso = { id: string; proyecto_id: string; nombre: string; orden: number };

export function ProyectoDetalle() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const isPMO = usuario?.rol === 'pmo';
  const canEdit = isPMO;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [tareas, setTareas] = useState<(Tarea & { tarea_asignados: { usuarios: { nombre: string } | null }[] })[]>([]);
  const [procesos, setProcesos] = useState<ProyectoProceso[]>([]);
  const [roles, setRoles] = useState<(ProyectoRol & { usuarios: Usuario | null })[]>([]);
  const [comunicaciones, setComunicaciones] = useState<Comunicacion[]>([]);
  const [resumen, setResumen] = useState<{
    total_tareas: number;
    tareas_completadas: number;
    tareas_atrasadas: number;
    progreso_pct: number | null;
    costo_real_total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('resumen');
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [newActivity, setNewActivity] = useState({ nombre: '', procesoId: '', duracion: '' });
  const [mutationError, setMutationError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [resProy, resTareas, resProcesos, resRoles, resResumen, resComunicaciones] = await Promise.all([
      supabase.from('proyectos').select('*').eq('id', id!).maybeSingle(),
      supabase.rpc('listar_tareas_existentes', { p_proyecto_id: id! }),
      supabase
        .from('proyecto_procesos')
        .select('*')
        .eq('proyecto_id', id!)
        .order('orden', { ascending: true }),
      supabase
        .from('proyecto_roles')
        .select('*, usuarios(*)')
        .eq('proyecto_id', id!),
      supabase.from('vw_proyecto_resumen').select('*').eq('proyecto_id', id!).maybeSingle(),
      supabase.from('comunicaciones').select('*').eq('proyecto_id', id!).order('fecha', { ascending: false }),
    ]);

    setProyecto(resProy.data as Proyecto | null);
    setTareas((resTareas.data as typeof tareas) ?? []);
    setProcesos((resProcesos.data as ProyectoProceso[]) ?? []);
    setRoles((resRoles.data as typeof roles) ?? []);
    setResumen(resResumen.data as typeof resumen);
    setComunicaciones((resComunicaciones.data as Comunicacion[]) ?? []);
    setLoading(false);
  }, [id]);

  async function addActivity(event: React.FormEvent) {
    event.preventDefault();
    if (!id || !newActivity.nombre.trim() || !newActivity.procesoId) return;
    const processTasks = tareas.filter((task) => task.proceso_id === newActivity.procesoId);
    const { error } = await supabase.from('tareas').insert({
      proyecto_id: id,
      proceso_id: newActivity.procesoId,
      orden: processTasks.length + 1,
      nombre: newActivity.nombre.trim(),
      duracion_ideal_dias: newActivity.duracion ? Number(newActivity.duracion) : null,
    });
    if (error) {
      setMutationError(error.message);
      return;
    }
    setNewActivity({ nombre: '', procesoId: '', duracion: '' });
    setShowNewActivity(false);
    setMutationError(null);
    await loadData();
  }

  async function deleteActivity(taskId: string) {
    if (!window.confirm('¿Eliminar esta actividad del cronograma? La plantilla original no cambiará.')) return;
    const { error } = await supabase.from('tareas').delete().eq('id', taskId);
    if (error) setMutationError(error.message);
    else {
      setMutationError(null);
      await loadData();
    }
  }

  useEffect(() => {
    if (!id) return;
    void loadData();
  }, [id, loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!proyecto) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--text-secondary)]">Proyecto no encontrado.</p>
        <Link to="/proyectos" className="text-[var(--accent)] hover:underline mt-2 inline-block">
          Volver a proyectos
        </Link>
      </div>
    );
  }

  const estado = getEstadoProyecto(proyecto.estado);
  const prioridad = getPrioridad(proyecto.prioridad);
  const categoria = getCategoria(proyecto.categoria);
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/proyectos"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Proyectos
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-caribbean-green/10 flex items-center justify-center shrink-0">
              <FolderKanban className="w-6 h-6 text-caribbean-green" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">{proyecto.nombre}</h2>
                <button className="text-[var(--text-secondary)] hover:text-warning transition-colors">
                  <Star className="w-4 h-4" />
                </button>
              </div>
              {proyecto.descripcion && (
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  {proyecto.descripcion}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge color={estado.color}>{estado.label}</Badge>
                <Badge color={prioridad.color}>{prioridad.label}</Badge>
                <span className="text-xs text-[var(--text-secondary)]">{categoria.label}</span>
                <span className="text-xs text-[var(--text-secondary)]">· {proyecto.linea_producto ?? (proyecto.template_key === 'support' ? 'Soporte' : 'Producto pendiente')}</span>
                {proyecto.template_key && <span className="text-xs text-[var(--text-secondary)]">· {proyecto.template_key}</span>}
                {proyecto.cliente && (
                  <span className="text-xs text-[var(--text-secondary)]">· {proyecto.cliente}</span>
                )}
              </div>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button className="btn-secondary text-sm flex items-center gap-1.5">
                <Share2 className="w-4 h-4" />
                Compartir
              </button>
              <button className="btn-primary text-sm flex items-center gap-1.5">
                <Edit3 className="w-4 h-4" />
                Editar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto">
        {(['resumen', 'tareas', 'cronograma', 'archivos', 'discusiones', 'reportes'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'text-[var(--accent)] border-[var(--accent)]'
                : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {tab === 'resumen' && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
                Información del proyecto
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <InfoItem icon={Calendar} label="Fecha inicio" value={formatDate(proyecto.fecha_inicio)} />
                <InfoItem icon={Calendar} label="Fecha límite" value={formatDate(proyecto.fecha_limite)} />
                <InfoItem icon={DollarSign} label="Valor estimado" value={formatCurrency(proyecto.valor_estimado)} />
                <InfoItem icon={DollarSign} label="Costo real" value={formatCurrency(resumen?.costo_real_total ?? 0)} />
                <InfoItem icon={Clock} label="Tareas" value={`${resumen?.total_tareas ?? 0} totales`} />
                <InfoItem icon={Clock} label="Completadas" value={`${resumen?.tareas_completadas ?? 0}`} />
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-[var(--text-secondary)]">Progreso general</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {Math.round(resumen?.progreso_pct ?? 0)}%
                  </span>
                </div>
                <ProgressBar value={resumen?.progreso_pct ?? 0} />
              </div>
            </div>
          )}

          {tab === 'tareas' && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
                  Tareas del proyecto
                </h3>
                {canEdit && (
                  <button onClick={() => setShowNewActivity(true)} className="btn-primary text-xs flex items-center gap-1 !py-2">
                    <Plus className="w-3.5 h-3.5" />
                    Nueva Tarea
                  </button>
                )}
              </div>
              {mutationError && <p className="text-sm text-danger mb-3">{mutationError}</p>}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Tarea</th>
                      <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Asignado(s)</th>
                      <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Estado</th>
                      <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Prioridad</th>
                      <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3">Fecha límite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tareas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm text-[var(--text-secondary)]">
                          Sin tareas. {canEdit && 'Crea una nueva o importa desde Excel.'}
                        </td>
                      </tr>
                    )}
                    {tareas.map((t) => {
                      const est = getEstadoTarea(t.estado);
                      const pri = getPrioridad(t.prioridad);
                      const asignados = t.tarea_asignados
                        ?.map((a) => a.usuarios?.nombre)
                        .filter(Boolean) as string[];
                      const overdue = isOverdue(t.fecha_limite, t.estado);
                      return (
                        <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-base)] transition-colors">
                          <td className="py-3 pr-4 text-sm font-medium text-[var(--text-primary)]">{t.nombre}</td>
                          <td className="py-3 pr-4">
                            {asignados && asignados.length > 0 ? (
                              <AvatarStack names={asignados} />
                            ) : (
                              <span className="text-xs text-[var(--text-secondary)]">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge color={est.color}>{est.label}</Badge>
                          </td>
                          <td className="py-3 pr-4">
                            <Badge color={pri.color}>{pri.label}</Badge>
                          </td>
                          <td className={`py-3 text-sm ${overdue ? 'text-danger' : 'text-[var(--text-secondary)]'}`}>
                            {formatDate(t.fecha_limite)}
                          </td>
                          {canEdit && (
                            <td className="py-3 text-right">
                              <button onClick={() => void deleteActivity(t.id)} className="text-[var(--text-secondary)] hover:text-danger" title="Eliminar actividad">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'cronograma' && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Cronograma del proyecto</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{proyecto.template_key ?? 'Sin plantilla'} · {procesos.length} procesos · {tareas.length} actividades</p>
                </div>
                <Badge color="bg-info/20 text-info">{Math.round(resumen?.progreso_pct ?? 0)}% avance</Badge>
              </div>
              <ScheduleView procesos={procesos} tareas={tareas} />
            </div>
          )}

          {tab === 'archivos' && (
            <div className="card p-12 text-center">
              <p className="text-[var(--text-secondary)]">No hay archivos subidos todavía.</p>
            </div>
          )}

          {tab === 'discusiones' && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Comunicaciones del proyecto</h3>
              {comunicaciones.length === 0 ? <p className="text-[var(--text-secondary)] text-center py-8">No hay comunicaciones registradas.</p> : <div className="space-y-3">{comunicaciones.map((comunicacion) => <div key={comunicacion.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-[var(--text-primary)]">{comunicacion.tipo}</span><span className="text-xs text-[var(--text-secondary)]">{formatDate(comunicacion.fecha)}</span></div>{comunicacion.resultado && <p className="text-sm text-[var(--text-primary)] mt-1">{comunicacion.resultado}</p>}{comunicacion.notas && <p className="text-xs text-[var(--text-secondary)] mt-1">{comunicacion.notas}</p>}</div>)}</div>}
            </div>
          )}

          {tab === 'reportes' && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Reportes del proyecto</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[var(--bg-base)]">
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{resumen?.total_tareas ?? 0}</p>
                  <p className="text-xs text-[var(--text-secondary)]">Total tareas</p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-base)]">
                  <p className="text-2xl font-bold text-success">{resumen?.tareas_completadas ?? 0}</p>
                  <p className="text-xs text-[var(--text-secondary)]">Completadas</p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-base)]">
                  <p className="text-2xl font-bold text-danger">{resumen?.tareas_atrasadas ?? 0}</p>
                  <p className="text-xs text-[var(--text-secondary)]">Atrasadas</p>
                </div>
              </div>
            </div>
          )}

          {showNewActivity && canEdit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <form onSubmit={addActivity} className="card p-6 w-full max-w-md space-y-4">
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Nueva actividad</h3>
                <p className="text-xs text-[var(--text-secondary)]">Se agregará solo a este cronograma; la plantilla permanecerá intacta.</p>
                <input required value={newActivity.nombre} onChange={(event) => setNewActivity({ ...newActivity, nombre: event.target.value })} className="input-field" placeholder="Nombre de la actividad" />
                <select required value={newActivity.procesoId} onChange={(event) => setNewActivity({ ...newActivity, procesoId: event.target.value })} className="input-field">
                  <option value="">Selecciona un proceso</option>
                  {procesos.map((process) => <option key={process.id} value={process.id}>{process.nombre}</option>)}
                </select>
                <input type="number" min="0" value={newActivity.duracion} onChange={(event) => setNewActivity({ ...newActivity, duracion: event.target.value })} className="input-field" placeholder="Duración ideal en días (opcional)" />
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setShowNewActivity(false)} className="btn-secondary text-sm">Cancelar</button>
                  <button type="submit" className="btn-primary text-sm">Agregar actividad</button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-6">
          {/* Summary */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Resumen</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Progreso</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {Math.round(resumen?.progreso_pct ?? 0)}%
                </span>
              </div>
              <ProgressBar value={resumen?.progreso_pct ?? 0} />
              <div className="flex items-center justify-between text-sm pt-2">
                <span className="text-[var(--text-secondary)]">Presupuesto</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {formatCurrency(proyecto.valor_estimado)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Gastado</span>
                <span className="font-medium text-danger">
                  {formatCurrency(resumen?.costo_real_total ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Horas estimadas</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {formatHours(tareas.reduce((s, t) => s + (t.tiempo_estimado_horas ?? 0), 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Team members */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
              Miembros del equipo
            </h3>
            <div className="space-y-3">
              {roles.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Avatar name={r.usuarios?.nombre ?? '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {r.usuarios?.nombre}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] capitalize">{r.tipo_raci}</p>
                  </div>
                </div>
              ))}
              {roles.length === 0 && (
                <p className="text-sm text-[var(--text-secondary)] text-center py-2">
                  Sin miembros asignados
                </p>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
              Actividad reciente
            </h3>
            <div className="space-y-3">
              {tareas.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent)] mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{t.nombre}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {formatRelativeTime(t.updated_at)}
                    </p>
                  </div>
                </div>
              ))}
              {tareas.length === 0 && (
                <p className="text-sm text-[var(--text-secondary)] text-center py-2">
                  Sin actividad
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-[var(--bg-base)] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[var(--text-secondary)]" />
      </div>
      <div>
        <p className="text-xs text-[var(--text-secondary)]">{label}</p>
        <p className="text-sm font-medium text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  );
}

function ScheduleView({ procesos, tareas }: { procesos: ProyectoProceso[]; tareas: (Tarea & { tarea_asignados?: { usuarios: { nombre: string } | null }[] })[] }) {
  const historicalTasks = tareas.filter((task) => !task.proceso_id);
  if (procesos.length === 0 && historicalTasks.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)] text-center py-8">Este proyecto no tiene actividades de cronograma.</p>;
  }

  return (
    <div className="space-y-4">
      {procesos.map((proceso) => {
        const processTasks = tareas
          .filter((task) => task.proceso_id === proceso.id)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        const completed = processTasks.filter((task) => task.estado === 'hecho').length;
        return (
          <section key={proceso.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-[var(--bg-base)] px-4 py-3">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">{proceso.nombre}</h4>
              <span className="text-xs text-[var(--text-secondary)]">{completed}/{processTasks.length} completadas</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {processTasks.length === 0 ? (
                <p className="px-4 py-3 text-xs text-[var(--text-secondary)]">Sin actividades</p>
              ) : processTasks.map((task) => {
                const assignees = task.tarea_asignados?.map((item) => item.usuarios?.nombre).filter(Boolean).join(', ');
                return (
                  <div key={task.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[var(--text-primary)] truncate">{task.nombre}</p>
                      {assignees && <p className="text-xs text-[var(--text-secondary)]">{assignees}</p>}
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">{formatDate(task.fecha_inicio)} - {formatDate(task.fecha_limite)}</span>
                    <Badge color={getEstadoTarea(task.estado).color}>{getEstadoTarea(task.estado).label}</Badge>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {historicalTasks.length > 0 && <section className="border border-amber-200 rounded-lg overflow-hidden"><div className="flex items-center justify-between gap-3 bg-amber-50/50 px-4 py-3"><h4 className="text-sm font-semibold text-[var(--text-primary)]">Actividades históricas importadas</h4><span className="text-xs text-[var(--text-secondary)]">{historicalTasks.length} actividades</span></div><div className="divide-y divide-[var(--border)]">{historicalTasks.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((task) => <div key={task.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center px-4 py-3"><div className="min-w-0"><p className="text-sm text-[var(--text-primary)] truncate">{task.nombre}</p><p className="text-xs text-[var(--text-secondary)]">Sin proceso de plantilla; registro histórico</p></div><span className="text-xs text-[var(--text-secondary)]">{formatDate(task.fecha_inicio)} - {formatDate(task.fecha_limite)}</span><Badge color={getEstadoTarea(task.estado).color}>{getEstadoTarea(task.estado).label}</Badge></div>)}</div></section>}
    </div>
  );
}

