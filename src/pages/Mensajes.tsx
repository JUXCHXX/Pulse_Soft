import { MessageSquare, Inbox } from 'lucide-react';

export function Mensajes() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Mensajes</h2>
        <p className="text-sm text-[var(--text-secondary)]">Comunicaciones internas del equipo</p>
      </div>
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-base)] flex items-center justify-center mx-auto mb-4">
          <Inbox className="w-8 h-8 text-[var(--text-secondary)]" />
        </div>
        <p className="text-[var(--text-secondary)]">No tienes mensajes nuevos.</p>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Las notificaciones de tareas y proyectos aparecerán aquí.</p>
      </div>
    </div>
  );
}
