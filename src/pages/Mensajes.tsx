import { Inbox } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import type { Comunicacion } from '@/lib/types';

export function Mensajes() {
  const [comunicaciones, setComunicaciones] = useState<(Comunicacion & { proyectos: { nombre: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.from('comunicaciones').select('*, proyectos(nombre)').order('fecha', { ascending: false }).then(({ data }) => {
      setComunicaciones((data as typeof comunicaciones) ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Mensajes</h2>
        <p className="text-sm text-[var(--text-secondary)]">Comunicaciones internas del equipo</p>
      </div>
      {loading ? <div className="card p-12 text-center"><p className="text-[var(--text-secondary)]">Cargando comunicaciones…</p></div> : comunicaciones.length === 0 ? <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-base)] flex items-center justify-center mx-auto mb-4">
          <Inbox className="w-8 h-8 text-[var(--text-secondary)]" />
        </div>
        <p className="text-[var(--text-secondary)]">No tienes mensajes nuevos.</p>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Las notificaciones de tareas y proyectos aparecerán aquí.</p>
      </div> : <div className="space-y-3">{comunicaciones.map((comunicacion) => <article key={comunicacion.id} className="card p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[var(--text-primary)]">{comunicacion.proyectos?.nombre ?? 'Proyecto pendiente'}</p><p className="text-xs text-[var(--text-secondary)]">{comunicacion.tipo}</p></div><time className="text-xs text-[var(--text-secondary)]">{formatDate(comunicacion.fecha)}</time></div>{comunicacion.resultado && <p className="text-sm text-[var(--text-primary)] mt-3">{comunicacion.resultado}</p>}{comunicacion.notas && <p className="text-sm text-[var(--text-secondary)] mt-1">{comunicacion.notas}</p>}</article>)}</div>}
    </div>
  );
}
