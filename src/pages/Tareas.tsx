import { useCallback, useEffect, useState } from 'react';
import { Play, Square, Timer as TimerIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AvatarStack } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { getEstadoTarea, getPrioridad } from '@/lib/constants';
import { formatDate, formatDuration, isOverdue } from '@/lib/format';
import type { Tarea, EstadoTarea, PrioridadNivel } from '@/lib/types';

interface TareaRow extends Tarea {
  proyectos: { nombre: string } | null;
  tarea_asignados: { usuarios: { nombre: string } | null }[] | null;
}

export function Tareas() {
  const { usuario } = useAuth();
  const [tareas, setTareas] = useState<TareaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTimer, setActiveTimer] = useState<{ registro_id: string; tarea_id: string; inicio: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [filterEstado, setFilterEstado] = useState<EstadoTarea | 'todos'>('todos');
  const [filterPrioridad, setFilterPrioridad] = useState<PrioridadNivel | 'todos'>('todos');

  useEffect(() => {
    if (!activeTimer) return;
    const start = new Date(activeTimer.inicio).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  async function loadTareas() {
    setLoading(true);
    const { data, error } = await supabase.rpc('listar_tareas_existentes', { p_proyecto_id: null });
    if (error) console.error('Error cargando tareas:', error);
    setTareas((data as TareaRow[]) ?? []);
    setLoading(false);
  }

  const loadActiveTimer = useCallback(async () => {
    if (!usuario) return;
    const { data } = await supabase
      .from('vw_cronometros_activos')
      .select('*')
      .eq('usuario_id', usuario.id)
      .maybeSingle();
    if (data) {
      setActiveTimer({ registro_id: data.registro_id, tarea_id: data.tarea_id, inicio: data.inicio });
    } else {
      setActiveTimer(null);
    }
  }, [usuario]);

  useEffect(() => {
    void loadTareas();
    void loadActiveTimer();
  }, [loadActiveTimer, usuario]);

  async function startTimer(tareaId: string) {
    if (!usuario) return;
    if (activeTimer) {
      alert('Ya tienes un cronómetro activo. Detenlo antes de iniciar otro.');
      return;
    }
    const { data, error } = await supabase
      .from('registros_tiempo')
      .insert({ tarea_id: tareaId, usuario_id: usuario.id })
      .select('id, inicio')
      .single();
    if (error) {
      alert('No se pudo iniciar el cronómetro: ' + error.message);
      return;
    }
    setActiveTimer({ registro_id: data.id, tarea_id: tareaId, inicio: data.inicio });
    setElapsed(0);
  }

  async function stopTimer() {
    if (!activeTimer) return;
    const { error } = await supabase
      .from('registros_tiempo')
      .update({ fin: new Date().toISOString() })
      .eq('id', activeTimer.registro_id);
    if (error) {
      alert('Error al detener: ' + error.message);
      return;
    }
    setActiveTimer(null);
    setElapsed(0);
    loadTareas();
  }

  async function updateEstado(tareaId: string, estado: EstadoTarea) {
    const { error } = await supabase.from('tareas').update({ estado }).eq('id', tareaId);
    if (!error) loadTareas();
  }

  const filtered = tareas.filter((t) => {
    if (filterEstado !== 'todos' && t.estado !== filterEstado) return false;
    if (filterPrioridad !== 'todos' && t.prioridad !== filterPrioridad) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Tareas</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          {tareas.length} tarea{tareas.length !== 1 ? 's' : ''} en total
        </p>
      </div>

      {activeTimer && (
        <div className="card p-4 flex items-center gap-4 border-caribbean-green/30">
          <div className="w-10 h-10 rounded-xl bg-caribbean-green/15 flex items-center justify-center">
            <TimerIcon className="w-5 h-5 text-caribbean-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {tareas.find((t) => t.id === activeTimer.tarea_id)?.nombre ?? 'Cronómetro activo'}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">Registrando tiempo…</p>
          </div>
          <div className="text-lg font-mono font-bold text-caribbean-green">
            {formatDuration(elapsed)}
          </div>
          <button
            onClick={stopTimer}
            className="w-10 h-10 rounded-xl bg-danger/15 text-danger flex items-center justify-center hover:bg-danger/25 transition-colors"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value as EstadoTarea | 'todos')}
          className="input-field !py-2 text-sm w-auto"
        >
          <option value="todos">Todos los estados</option>
          <option value="no_iniciado">No iniciado</option>
          <option value="en_progreso">En progreso</option>
          <option value="en_espera">En espera</option>
          <option value="hecho">Completado</option>
        </select>
        <select
          value={filterPrioridad}
          onChange={(e) => setFilterPrioridad(e.target.value as PrioridadNivel | 'todos')}
          className="input-field !py-2 text-sm w-auto"
        >
          <option value="todos">Toda prioridad</option>
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
          <option value="urgente">Urgente</option>
        </select>
      </div>

      <div className="card p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Tarea</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Proyecto</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Asignado(s)</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Estado</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Prioridad</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Fecha límite</th>
                <th className="text-center text-xs font-medium text-[var(--text-secondary)] pb-3">Cronómetro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[var(--text-secondary)]">
                    Sin tareas
                  </td>
                </tr>
              )}
              {filtered.map((t) => {
                const est = getEstadoTarea(t.estado);
                const pri = getPrioridad(t.prioridad);
                const asignados = (t.tarea_asignados ?? [])
                  .map((a) => a.usuarios?.nombre)
                  .filter(Boolean) as string[];
                const overdue = isOverdue(t.fecha_limite, t.estado);
                const isActive = activeTimer?.tarea_id === t.id;
                return (
                  <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-base)] transition-colors">
                    <td className="py-3 pr-4 text-sm font-medium text-[var(--text-primary)]">{t.nombre}</td>
                    <td className="py-3 pr-4 text-sm text-[var(--text-secondary)]">{t.proyectos?.nombre ?? '—'}</td>
                    <td className="py-3 pr-4">
                      {asignados.length > 0 ? <AvatarStack names={asignados} /> : <span className="text-xs text-[var(--text-secondary)]">—</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        value={t.estado}
                        onChange={(e) => updateEstado(t.id, e.target.value as EstadoTarea)}
                        className="text-xs bg-transparent border-0 cursor-pointer"
                        style={{ color: 'inherit' }}
                      >
                        <option value="no_iniciado">No iniciado</option>
                        <option value="en_progreso">En progreso</option>
                        <option value="en_espera">En espera</option>
                        <option value="hecho">Completado</option>
                      </select>
                      <Badge color={est.color} className="ml-1">{est.label}</Badge>
                    </td>
                    <td className="py-3 pr-4"><Badge color={pri.color}>{pri.label}</Badge></td>
                    <td className={`py-3 pr-4 text-sm ${overdue ? 'text-danger' : 'text-[var(--text-secondary)]'}`}>
                      {formatDate(t.fecha_limite)}
                    </td>
                    <td className="py-3 text-center">
                      {isActive ? (
                        <button onClick={stopTimer} className="w-8 h-8 rounded-lg bg-danger/15 text-danger flex items-center justify-center mx-auto hover:bg-danger/25 transition-colors">
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => startTimer(t.id)}
                          disabled={!!activeTimer}
                          className="w-8 h-8 rounded-lg bg-caribbean-green/15 text-caribbean-green flex items-center justify-center mx-auto hover:bg-caribbean-green/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
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
