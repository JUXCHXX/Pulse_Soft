import { useEffect, useState } from 'react';
import { Calendar as CalIcon, FolderKanban, CheckSquare, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/Badge';
import { getEstadoTarea, getPrioridad } from '@/lib/constants';
import { isOverdue } from '@/lib/format';
import type { Tarea, Reunion, Proyecto } from '@/lib/types';

interface TareaWithProy extends Tarea {
  proyectos: { nombre: string } | null;
}

export function Calendario() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tareas, setTareas] = useState<TareaWithProy[]>([]);
  const [reuniones, setReuniones] = useState<(Reunion & { proyectos: { nombre: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  async function loadData() {
    setLoading(true);
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [resTareas, resReuniones] = await Promise.all([
      supabase
        .from('tareas')
        .select('*, proyectos(nombre)')
        .gte('fecha_limite', firstDay)
        .lte('fecha_limite', lastDay)
        .order('fecha_limine', { ascending: true }),
      supabase
        .from('reuniones')
        .select('*, proyectos(nombre)')
        .gte('fecha', firstDay)
        .lte('fecha', lastDay)
        .order('fecha', { ascending: true }),
    ]);

    setTareas((resTareas.data as TareaWithProy[]) ?? []);
    setReuniones((resReuniones.data as (Reunion & { proyectos: { nombre: string } | null })[]) ?? []);
    setLoading(false);
  }

  const monthName = currentMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const firstDayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const today = new Date().toDateString();

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function eventsForDay(day: number) {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTareas = tareas.filter((t) => t.fecha_limite === dateStr);
    const dayReuniones = reuniones.filter((r) => r.fecha === dateStr);
    return { dayTareas, dayReuniones };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Calendario</h2>
          <p className="text-sm text-[var(--text-secondary)] capitalize">{monthName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="w-9 h-9 rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentMonth(new Date())} className="btn-secondary text-sm !py-2">Hoy</button>
          <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="w-9 h-9 rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-[var(--text-secondary)] py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-24 rounded-lg" />;
            const { dayTareas, dayReuniones } = eventsForDay(day);
            const isToday = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString() === today;
            return (
              <div key={i} className={`min-h-24 rounded-lg p-1.5 border ${isToday ? 'border-caribbean-green bg-caribbean-green/5' : 'border-[var(--border)]'}`}>
                <span className={`text-xs font-medium ${isToday ? 'text-caribbean-green' : 'text-[var(--text-secondary)]'}`}>{day}</span>
                <div className="space-y-1 mt-1">
                  {dayTareas.slice(0, 3).map((t) => {
                    const overdue = isOverdue(t.fecha_limite, t.estado);
                    return (
                      <div key={t.id} className={`text-[10px] truncate px-1.5 py-0.5 rounded ${overdue ? 'bg-danger/15 text-danger' : 'bg-caribbean-green/15 text-caribbean-green'}`}>
                        {t.nombre}
                      </div>
                    );
                  })}
                  {dayReuniones.slice(0, 2).map((r) => (
                    <div key={r.id} className="text-[10px] truncate px-1.5 py-0.5 rounded bg-info/15 text-info">
                      {r.nombre}
                    </div>
                  ))}
                  {dayTareas.length + dayReuniones.length > 5 && (
                    <p className="text-[10px] text-[var(--text-secondary)]">+{dayTareas.length + dayReuniones.length - 5} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
