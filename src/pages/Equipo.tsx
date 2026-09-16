import { useEffect, useState } from 'react';
import { Plus, Mail, DollarSign, Briefcase, Edit3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { getRol, ROLES } from '@/lib/constants';
import { formatCurrency, formatHours } from '@/lib/format';
import type { Usuario, VwCargaConsultor, RolUsuario } from '@/lib/types';

export function Equipo() {
  const { usuario } = useAuth();
  const isPMO = usuario?.rol === 'pmo';
  const [usuarios, setUsuarios] = useState<(Usuario & { vw_carga_consultor?: VwCargaConsultor })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [resUsers, resCarga] = await Promise.all([
      supabase.from('usuarios').select('*').order('nombre', { ascending: true }),
      supabase.from('vw_carga_consultor').select('*'),
    ]);
    const cargaMap = new Map((resCarga.data as VwCargaConsultor[] ?? []).map((c) => [c.usuario_id, c]));
    setUsuarios((resUsers.data as Usuario[] ?? []).map((u) => ({ ...u, vw_carga_consultor: cargaMap.get(u.id) })));
    setLoading(false);
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
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Equipo</h2>
          <p className="text-sm text-[var(--text-secondary)]">{usuarios.length} miembros</p>
        </div>
        {isPMO && (
          <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Nuevo Usuario
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {usuarios.map((u) => {
          const rol = getRol(u.rol);
          const c = u.vw_carga_consultor;
          return (
            <div key={u.id} className="card p-5 card-hover">
              <div className="flex items-center gap-3 mb-4">
                <Avatar name={u.nombre} size="lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-[var(--text-primary)] truncate">{u.nombre}</h3>
                  <p className="text-xs text-[var(--text-secondary)] truncate flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {u.email}
                  </p>
                </div>
                <Badge color="bg-info/15 text-info">{rol.label}</Badge>
                {isPMO && <button onClick={() => setEditingUser(u)} className="text-[var(--text-secondary)] hover:text-[var(--accent)]" title="Editar usuario"><Edit3 className="w-4 h-4" /></button>}
              </div>
              <div className="space-y-2">
                {isPMO && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" /> Tarifa/hora
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">{formatCurrency(u.tarifa_hora)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" /> Tareas activas
                  </span>
                  <span className="font-medium text-[var(--text-primary)]">{c?.tareas_asignadas_activas ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Horas registradas</span>
                  <span className="font-medium text-[var(--text-primary)]">{formatHours(c?.horas_registradas_totales ?? 0)}</span>
                </div>
                {c && c.tareas_atrasadas > 0 && (
                  <p className="text-xs text-danger">{c.tareas_atrasadas} tareas atrasadas</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && isPMO && <NewUserModal onClose={() => setShowNew(false)} onCreated={loadData} />}
      {editingUser && isPMO && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onUpdated={loadData} />}
    </div>
  );
}

function EditUserModal({ user, onClose, onUpdated }: { user: Usuario; onClose: () => void; onUpdated: () => void }) {
  const [form, setForm] = useState({ nombre: user.nombre, email: user.email, rol: user.rol, tarifa: String(user.tarifa_hora ?? 0), activo: user.activo });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase.from('usuarios').update({ nombre: form.nombre.trim(), email: form.email.trim(), rol: form.rol, tarifa_hora: Number(form.tarifa) || 0, activo: form.activo }).eq('id', user.id);
    if (updateError) { setError(updateError.message); setSaving(false); return; }
    await onUpdated();
    onClose();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={handleSubmit} className="card p-6 w-full max-w-md space-y-4"><div><h3 className="text-lg font-bold text-[var(--text-primary)]">Editar usuario</h3><p className="text-xs text-[var(--text-secondary)] mt-1">Perfil de negocio existente. La autenticación de Supabase se mantiene separada.</p></div><label className="text-sm text-[var(--text-primary)]">Nombre<input required value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} className="input-field mt-1" /></label><label className="text-sm text-[var(--text-primary)]">Correo electrónico<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="input-field mt-1" /></label><label className="text-sm text-[var(--text-primary)]">Rol<select value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value as RolUsuario })} className="input-field mt-1">{ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label><label className="text-sm text-[var(--text-primary)]">Tarifa/hora<input type="number" min="0" value={form.tarifa} onChange={(event) => setForm({ ...form, tarifa: event.target.value })} className="input-field mt-1" /></label><label className="flex items-center gap-2 text-sm text-[var(--text-primary)]"><input type="checkbox" checked={form.activo} onChange={(event) => setForm({ ...form, activo: event.target.checked })} /> Usuario activo</label>{user.auth_id ? <p className="text-xs text-success">Cuenta de autenticación vinculada.</p> : <p className="text-xs text-amber-700">Pendiente de completar autenticación. Este cambio solo actualiza el perfil de negocio.</p>}{error && <p className="text-sm text-danger">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button><button disabled={saving} className="btn-primary text-sm">{saving ? 'Guardando…' : 'Guardar cambios'}</button></div></form></div>;
}

function NewUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'consultor_junior' as RolUsuario, tarifa: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc('crear_usuario_auth', {
      p_nombre: form.nombre,
      p_email: form.email,
      p_password: form.password,
      p_rol: form.rol,
      p_tarifa: form.tarifa ? Number(form.tarifa) : 0,
    });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="card p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Nuevo usuario</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Nombre *</label>
            <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input-field mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Email *</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-field mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Contraseña *</label>
            <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Rol *</label>
            <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as RolUsuario })} className="input-field mt-1">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Tarifa/hora</label>
            <input type="number" value={form.tarifa} onChange={(e) => setForm({ ...form, tarifa: e.target.value })} className="input-field mt-1" placeholder="0.00" />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Creando…' : 'Crear usuario'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
