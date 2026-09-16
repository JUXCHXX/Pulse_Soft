import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, Square, Timer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/Badge';
import type { Tarea } from '@/lib/types';

type TaskRow = Tarea & { proyectos: { nombre: string } | null; tarea_asignados: { usuario_id: string; usuarios: { nombre: string } | null }[] };
type TimerRow = { id: string; tarea_id: string; usuario_id: string; inicio: string; fin: string | null; estado: string; tiempo_acumulado_segundos: number; tareas: (Tarea & { proyectos: { nombre: string } | null }) | null; usuarios: { nombre: string } | null };

function formatSeconds(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function elapsed(timer: TimerRow, now: number) {
  if (timer.estado !== 'en_curso' || timer.fin) return timer.tiempo_acumulado_segundos ?? 0;
  return (timer.tiempo_acumulado_segundos ?? 0) + Math.max(0, Math.floor((now - new Date(timer.inicio).getTime()) / 1000));
}

export function Cronometro() {
  const { usuario } = useAuth();
  const isPMO = usuario?.rol === 'pmo';
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [timers, setTimers] = useState<TimerRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [taskResult, timerResult] = await Promise.all([
      supabase.rpc('listar_tareas_existentes', { p_proyecto_id: null }),
      supabase.from('registros_tiempo').select('*, tareas(*, proyectos(nombre)), usuarios(nombre)').is('fin', null),
    ]);
    setTasks((taskResult.data as TaskRow[]) ?? []);
    setTimers((timerResult.data as TimerRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const channel = supabase.channel('cronometros-activos').on('postgres_changes', { event: '*', schema: 'public', table: 'registros_tiempo' }, () => { void load(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  async function start(taskId: string) { const { error } = await supabase.rpc('iniciar_cronometro_tarea', { p_tarea_id: taskId }); if (error) alert(error.message); else await load(); }
  async function pause(id: string) { const { error } = await supabase.rpc('pausar_cronometro', { p_registro_id: id }); if (error) alert(error.message); else await load(); }
  async function resume(id: string) { const { error } = await supabase.rpc('continuar_cronometro', { p_registro_id: id }); if (error) alert(error.message); else await load(); }
  async function finish(id: string) { const { error } = await supabase.rpc('finalizar_cronometro', { p_registro_id: id }); if (error) alert(error.message); else await load(); }

  const ownActive = timers.find((timer) => timer.usuario_id === usuario?.id);
  const availableTasks = tasks.filter((task) => task.tarea_asignados?.some((assignment) => assignment.usuario_id === usuario?.id) || isPMO);
  if (loading) return <div className="flex items-center justify-center h-96"><div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>;

  return <div className="space-y-6"><div><h2 className="text-xl font-bold text-[var(--text-primary)]">Cronómetro</h2><p className="text-sm text-[var(--text-secondary)]">El tiempo ideal pertenece a cada tarea. El tiempo real se sincroniza con Registro de Tiempo.</p></div>{isPMO && <section><h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Supervisión PMO · cronómetros activos</h3><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{timers.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No hay cronómetros activos.</p> : timers.map((timer) => <TimerCard key={timer.id} timer={timer} now={now} onPause={pause} onResume={resume} onFinish={finish} canControl={timer.usuario_id === usuario?.id} />)}</div></section>}{!isPMO && ownActive && <TimerCard timer={ownActive} now={now} onPause={pause} onResume={resume} onFinish={finish} canControl />}{!isPMO && <section><h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Tareas asignadas</h3><div className="space-y-2">{availableTasks.map((task) => <div key={task.id} className="card p-4 flex items-center gap-4"><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[var(--text-primary)] truncate">{task.nombre}</p><p className="text-xs text-[var(--text-secondary)]">{task.proyectos?.nombre ?? 'Proyecto pendiente'} · Ideal {formatSeconds((task.tiempo_estimado_horas ?? 0) * 3600)}</p></div><button onClick={() => void start(task.id)} disabled={!!ownActive} className="btn-primary text-sm flex items-center gap-2"><Play className="w-4 h-4" /> Iniciar</button></div>)}{availableTasks.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No tienes tareas asignadas.</p>}</div></section>}</div>;
}

function TimerCard({ timer, now, onPause, onResume, onFinish, canControl }: { timer: TimerRow; now: number; onPause: (id: string) => Promise<void>; onResume: (id: string) => Promise<void>; onFinish: (id: string) => Promise<void>; canControl: boolean }) {
  const task = timer.tareas;
  const seconds = elapsed(timer, now);
  const ideal = (task?.tiempo_estimado_horas ?? 0) * 3600;
  const exceeded = ideal > 0 && seconds > ideal;
  const difference = Math.abs(seconds - ideal);
  return <article className={`card p-5 border-l-4 ${exceeded ? 'border-l-danger' : 'border-l-caribbean-green'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-base font-semibold text-[var(--text-primary)]">{task?.nombre ?? 'Tarea'}</p><p className="text-sm text-[var(--text-secondary)]">{task?.proyectos?.nombre ?? 'Proyecto pendiente'} · {timer.usuarios?.nombre ?? 'Consultor'}</p></div><Badge color={exceeded ? 'bg-danger/15 text-danger' : timer.estado === 'pausado' ? 'bg-warning/15 text-warning' : 'bg-caribbean-green/15 text-caribbean-green'}>{exceeded ? 'TIEMPO EXCEDIDO' : timer.estado === 'pausado' ? 'PAUSADO' : 'EN CURSO'}</Badge></div><div className="grid grid-cols-3 gap-3 mt-5 text-center"><div><p className="text-xs text-[var(--text-secondary)]">Ideal</p><p className="font-mono font-semibold text-[var(--text-primary)]">{formatSeconds(ideal)}</p></div><div><p className="text-xs text-[var(--text-secondary)]">Transcurrido</p><p className={`font-mono font-semibold ${exceeded ? 'text-danger' : 'text-[var(--text-primary)]'}`}>{formatSeconds(seconds)}</p></div><div><p className="text-xs text-[var(--text-secondary)]">Diferencia</p><p className={`font-mono font-semibold ${exceeded ? 'text-danger' : 'text-success'}`}>{exceeded ? '+' : '-'}{formatSeconds(difference)}</p></div></div>{canControl && <div className="flex justify-end gap-2 mt-5">{timer.estado === 'en_curso' ? <button onClick={() => void onPause(timer.id)} className="btn-secondary text-sm flex items-center gap-2"><Pause className="w-4 h-4" /> Pausar</button> : <button onClick={() => void onResume(timer.id)} className="btn-secondary text-sm flex items-center gap-2"><Play className="w-4 h-4" /> Continuar</button>}<button onClick={() => void onFinish(timer.id)} className="btn-primary text-sm flex items-center gap-2"><Square className="w-4 h-4" /> Finalizar</button></div>}<Timer className="w-4 h-4 text-[var(--text-secondary)] mt-4" /></article>;
}
