import { useCallback, useEffect, useState } from 'react';
import { Square, Timer as TimerIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/Badge';
import { formatDuration, formatDate, formatHours } from '@/lib/format';
import type { RegistroTiempo, Tarea } from '@/lib/types';

interface RegistroWithTarea extends RegistroTiempo {
  tareas: (Tarea & { proyectos: { nombre: string } | null }) | null;
}

export function RegistroTiempo() {
  const { usuario } = useAuth();
  const [registros, setRegistros] = useState<RegistroWithTarea[]>([]);
  const [activeTimer, setActiveTimer] = useState<{ registro_id: string; tarea_id: string; inicio: string; tarea_nombre: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeTimer) return;
    const start = new Date(activeTimer.inicio).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const loadRegistros = useCallback(async () => {
    if (!usuario) return;
    setLoading(true);
    const { data } = await supabase
      .from('registros_tiempo')
      .select('*, tareas(*, proyectos(nombre))')
      .eq('usuario_id', usuario.id)
      .order('inicio', { ascending: false })
      .limit(50);
    setRegistros((data as RegistroWithTarea[]) ?? []);
    setLoading(false);
  }, [usuario]);

  const loadActiveTimer = useCallback(async () => {
    if (!usuario) return;
    const { data } = await supabase
      .from('vw_cronometros_activos')
      .select('*')
      .eq('usuario_id', usuario.id)
      .maybeSingle();
    if (data) {
      setActiveTimer({ registro_id: data.registro_id, tarea_id: data.tarea_id, inicio: data.inicio, tarea_nombre: data.tarea });
    } else {
      setActiveTimer(null);
    }
  }, [usuario]);

  useEffect(() => {
    void loadRegistros();
    void loadActiveTimer();
  }, [loadActiveTimer, loadRegistros]);

  async function stopTimer() {
    if (!activeTimer) return;
    const { error } = await supabase.rpc('finalizar_cronometro', { p_registro_id: activeTimer.registro_id });
    if (error) {
      alert('Error: ' + error.message);
      return;
    }
    setActiveTimer(null);
    setElapsed(0);
    loadRegistros();
  }

  const totalHoras = registros
    .filter((r) => r.duracion_segundos)
    .reduce((sum, r) => sum + (r.duracion_segundos ?? 0) / 3600, 0);

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
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Registro de Tiempo</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Total registrado: {formatHours(totalHoras)}
        </p>
      </div>

      {activeTimer && (
        <div className="card p-5 flex items-center gap-4 border-caribbean-green/30">
          <div className="w-12 h-12 rounded-xl bg-caribbean-green/15 flex items-center justify-center">
            <TimerIcon className="w-6 h-6 text-caribbean-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{activeTimer.tarea_nombre}</p>
            <p className="text-xs text-[var(--text-secondary)]">Cronómetro en marcha</p>
          </div>
          <div className="text-2xl font-mono font-bold text-caribbean-green">{formatDuration(elapsed)}</div>
          <button onClick={stopTimer} className="w-11 h-11 rounded-xl bg-danger/15 text-danger flex items-center justify-center hover:bg-danger/25 transition-colors">
            <Square className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="card p-6">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Historial reciente</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Tarea</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Proyecto</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Inicio</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Fin</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] pb-3">Duración</th>
              </tr>
            </thead>
            <tbody>
              {registros.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-[var(--text-secondary)]">Sin registros de tiempo</td></tr>
              )}
              {registros.map((r) => {
                return (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-4 text-sm font-medium text-[var(--text-primary)]">{r.tareas?.nombre ?? '—'}</td>
                    <td className="py-3 pr-4 text-sm text-[var(--text-secondary)]">{r.tareas?.proyectos?.nombre ?? '—'}</td>
                    <td className="py-3 pr-4 text-sm text-[var(--text-secondary)]">{formatDate(r.inicio)}</td>
                    <td className="py-3 pr-4 text-sm text-[var(--text-secondary)]">{r.fin ? formatDate(r.fin) : <Badge color="bg-caribbean-green/20 text-caribbean-green">En curso</Badge>}</td>
                    <td className="py-3 text-right text-sm font-mono font-medium text-[var(--text-primary)]">
                      {r.duracion_segundos ? formatDuration(r.duracion_segundos) : '—'}
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
