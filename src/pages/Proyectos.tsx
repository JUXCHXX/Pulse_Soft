import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, FolderKanban, Plus, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Badge, ProgressBar } from '@/components/Badge';
import {
  getEstadoProyecto,
  getPrioridad,
  ESTADOS_PROYECTO,
  PRIORIDADES,
  CATEGORIAS,
} from '@/lib/constants';
import { formatCurrency } from '@/lib/format';
import type { VwProyectoResumen, CategoriaProyecto, EstadoProyecto, PrioridadNivel } from '@/lib/types';

export function Proyectos() {
  const { usuario } = useAuth();
  const isPMO = usuario?.rol === 'pmo';
  const canEdit = isPMO;

  const [proyectos, setProyectos] = useState<VwProyectoResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoProyecto | 'todos'>('todos');
  const [filterPrioridad, setFilterPrioridad] = useState<PrioridadNivel | 'todos'>('todos');
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadProyectos();
  }, []);

  async function loadProyectos() {
    setLoading(true);
    const { data } = await supabase
      .from('vw_proyecto_resumen')
      .select('*')
      .order('nombre', { ascending: true });
    setProyectos((data as VwProyectoResumen[]) ?? []);
    setLoading(false);
  }

  const filtered = proyectos.filter((p) => {
    if (search && !p.nombre.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterEstado !== 'todos' && p.estado !== filterEstado) return false;
    if (filterPrioridad !== 'todos' && p.prioridad !== filterPrioridad) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Proyectos</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''} en total
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Nuevo Proyecto
          </button>
        )}
      </div>
      {notice && (
        <div className="rounded-lg bg-info/10 px-4 py-3 text-sm text-info" role="status">
          {notice}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar proyecto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field !py-2 !pl-9 text-sm"
          />
        </div>
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value as EstadoProyecto | 'todos')}
          className="input-field !py-2 text-sm w-auto"
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS_PROYECTO.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          value={filterPrioridad}
          onChange={(e) => setFilterPrioridad(e.target.value as PrioridadNivel | 'todos')}
          className="input-field !py-2 text-sm w-auto"
        >
          <option value="todos">Toda prioridad</option>
          {PRIORIDADES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FolderKanban className="w-10 h-10 text-[var(--text-secondary)] mx-auto mb-3" />
          <p className="text-[var(--text-secondary)]">
            {proyectos.length === 0
              ? 'No hay proyectos. Crea uno nuevo o importa datos desde Excel.'
              : 'No se encontraron proyectos con estos filtros.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => {
            const estado = getEstadoProyecto(p.estado);
            const prioridad = getPrioridad(p.prioridad);
            return (
              <Link
                key={p.proyecto_id}
                to={`/proyectos/${p.proyecto_id}`}
                className="card p-5 card-hover group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-caribbean-green/10 flex items-center justify-center group-hover:bg-caribbean-green/20 transition-colors">
                    <FolderKanban className="w-5 h-5 text-caribbean-green" />
                  </div>
                  <button
                    onClick={(e) => e.preventDefault()}
                    className="text-[var(--text-secondary)] hover:text-warning transition-colors"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1 group-hover:text-[var(--accent)] transition-colors">
                  {p.nombre}
                </h3>
                <div className="flex items-center gap-2 mb-4">
                  <Badge color={estado.color}>{estado.label}</Badge>
                  <Badge color={prioridad.color}>{prioridad.label}</Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Progreso</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {Math.round(p.progreso_pct ?? 0)}%
                    </span>
                  </div>
                  <ProgressBar value={p.progreso_pct ?? 0} />
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-[var(--text-secondary)]">
                      {Number(p.total_tareas)} tareas · {Number(p.tareas_atrasadas)} atrasadas
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatCurrency(p.costo_real_total)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showNew && canEdit && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(message) => {
            setNotice(message);
            void loadProyectos();
          }}
        />
      )}
    </div>
  );
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string) => void }) {
  const { usuario } = useAuth();
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    categoria: 'implementacion' as CategoriaProyecto,
    estado: 'no_iniciado' as EstadoProyecto,
    prioridad: 'media' as PrioridadNivel,
    fecha_inicio: '',
    fecha_limite: '',
    valor_estimado: '',
    cliente: '',
    producto: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('proyectos')
      .insert({
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        categoria: form.categoria,
        estado: form.estado,
        prioridad: form.prioridad,
        linea_producto: form.categoria === 'implementacion' ? form.producto : null,
        fecha_inicio: form.fecha_inicio || null,
        fecha_limite: form.fecha_limite || null,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : null,
        cliente: form.cliente || null,
        created_by: usuario?.id,
      })
      .select('id')
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    let copiedTasks = 0;
    if (data?.id) {
      const { data: copied, error: copyError } = await supabase.rpc('copiar_plantilla_csv_tareas', {
        p_proyecto_id: data.id,
        p_tipo: form.categoria,
        p_producto: form.categoria === 'implementacion' ? form.producto : null,
      });
      if (!copyError) copiedTasks = Number(copied ?? 0);
    }

    setSaving(false);
    onCreated(copiedTasks === 0
      ? 'Proyecto creado sin tareas iniciales: no hay una plantilla CSV cargada para esta combinación.'
      : `Proyecto creado con ${copiedTasks} tareas iniciales.`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Nuevo proyecto</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Nombre *</label>
            <input
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="input-field mt-1"
              placeholder="Nombre del proyecto"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="input-field mt-1"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)]">Categoría *</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaProyecto, producto: '' })}
                className="input-field mt-1"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {form.categoria === 'implementacion' && (
              <div>
                <label className="text-sm font-medium text-[var(--text-primary)]">Producto *</label>
                <select
                  required
                  value={form.producto}
                  onChange={(e) => setForm({ ...form, producto: e.target.value })}
                  className="input-field mt-1"
                >
                  <option value="">Selecciona un producto</option>
                  <option value="Campuspack">Campuspack</option>
                  <option value="Schoolpack">Schoolpack</option>
                  <option value="Language">Language</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)]">Cliente</label>
              <input
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                className="input-field mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)]">Estado</label>
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoProyecto })}
                className="input-field mt-1"
              >
                {ESTADOS_PROYECTO.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)]">Prioridad</label>
              <select
                value={form.prioridad}
                onChange={(e) => setForm({ ...form, prioridad: e.target.value as PrioridadNivel })}
                className="input-field mt-1"
              >
                {PRIORIDADES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)]">Fecha inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className="input-field mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--text-primary)]">Fecha límite</label>
              <input
                type="date"
                value={form.fecha_limite}
                onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })}
                className="input-field mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Valor estimado</label>
            <input
              type="number"
              value={form.valor_estimado}
              onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })}
              className="input-field mt-1"
              placeholder="0.00"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Creando…' : 'Crear proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
