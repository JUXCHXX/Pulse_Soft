import { useEffect, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Loader2, Palette, Trash2, XCircle } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import { IMPORT_ENTITY_ALIASES, type ImportEntity } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

type Tab = 'plantillas' | 'datos' | 'preferencias';
type CsvTemplateKey = 'campuspack' | 'schoolpack' | 'language' | 'soporte';
type CsvTemplateType = 'implementacion' | 'soporte';
type ImportStatus = 'ok' | 'pending' | 'warning' | 'error';

interface CsvTemplateConfig { key: CsvTemplateKey; label: string; tipo: CsvTemplateType; producto: string | null }
interface CsvTemplateState { nombre_archivo: string; cargado_en: string; tareas: number; procesos: number }
interface ScheduleActivity {
  template_key: string;
  process_key: string;
  process_name: string;
  activity_key: string;
  activity_name: string;
  parent_process_key: string;
  sort_order: number;
  duration_days: number | null;
  start_offset_days: number;
  default_priority: string;
  suggested_role: string;
  is_optional: boolean;
}
interface SchedulePreview { fileName: string; activities: ScheduleActivity[]; structure: Array<{ key: string; name: string; activities: string[] }>; errors: string[] }
interface MasterRow { id: string; entity: string; data: Record<string, string>; status: ImportStatus; message: string; manuallyCorrected?: boolean }
interface PendingImport { id: string; entidad: string; source_record_id: string; datos: Record<string, string>; proyecto_nombre: string | null; tarea_nombre: string | null; mensaje: string }

const CSV_TEMPLATES: CsvTemplateConfig[] = [
  { key: 'campuspack', label: 'Implementación Campuspack', tipo: 'implementacion', producto: 'Campuspack' },
  { key: 'schoolpack', label: 'Implementación Schoolpack', tipo: 'implementacion', producto: 'Schoolpack' },
  { key: 'language', label: 'Implementación Language', tipo: 'implementacion', producto: 'Language' },
  { key: 'soporte', label: 'Soporte', tipo: 'soporte', producto: null },
];

const TEMPLATE_REQUIRED = ['template_key', 'process_key', 'process_name', 'activity_key', 'activity_name'];
const CSV_FIELD_ALIASES = {
  nombre: ['nombre', 'full_name', 'nombre_usuario', 'usuario_nombre'],
  email: ['email', 'correo', 'usuario_email', 'email_usuario'],
  rol: ['rol', 'role', 'cargo'],
  tarifa_hora: ['tarifa_hora', 'tarifa', 'hourly_rate'],
  proyecto_nombre: ['proyecto_nombre', 'project_name', 'nombre_proyecto', 'proyecto', 'project'],
  proyecto_cliente: ['proyecto_cliente', 'project_client', 'cliente_proyecto', 'cliente'],
  tarea_nombre: ['tarea_nombre', 'task_name', 'nombre_tarea', 'tarea', 'task', 'activity_name'],
  reunion_nombre: ['reunion_nombre', 'meeting_name', 'nombre_reunion', 'reunion'],
  usuario_email: ['usuario_email', 'user_email', 'email_usuario', 'email'],
  tipo_raci: ['tipo_raci', 'raci', 'rol'],
  tipo: ['tipo', 'type', 'categoria'],
  estado: ['estado', 'status'],
  prioridad: ['prioridad', 'priority'],
  fecha_inicio: ['fecha_inicio', 'start_date', 'fecha_de_inicio'],
  fecha_limite: ['fecha_limite', 'due_date', 'fecha_de_cierre'],
  descripcion: ['descripcion', 'description', 'detalle'],
  valor_estimado: ['valor_estimado', 'estimated_value', 'valor'],
  linea_producto: ['linea_producto', 'producto', 'product_line'],
  categoria: ['categoria', 'category', 'categoria_proyecto'],
  notas: ['notas', 'notes'],
  resultado: ['resultado', 'result', 'outcome'],
  inicio: ['inicio', 'start', 'fecha_inicio'],
  fin: ['fin', 'end', 'fecha_fin'],
  hora: ['hora', 'time', 'hora_reunion'],
  asignados_emails: ['asignados_emails', 'assigned_emails', 'emails_asignados'],
  asistentes_emails: ['asistentes_emails', 'attendee_emails', 'emails_asistentes'],
  tiempo_estimado_horas: ['tiempo_estimado_horas', 'estimated_hours', 'horas'],
} as const;

function normalizeEntity(value: string): ImportEntity | null {
  const normalized = (value ?? '').trim().toLowerCase();
  return IMPORT_ENTITY_ALIASES[normalized] ?? null;
}

function normalizeCsvKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function normalizeImportName(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isPendingMarker(value: string): boolean {
  return value.toUpperCase().includes('DATO FALTANTE');
}

function rowNeedsPendingData(row: MasterRow): boolean {
  if (Object.values(row.data).some((value) => isPendingMarker(value))) return true;
  const entity = normalizeEntity(row.entity);
  if (entity === 'usuario') return !pickCsvValue(row.data, CSV_FIELD_ALIASES.nombre) || !pickCsvValue(row.data, CSV_FIELD_ALIASES.email);
  if (entity === 'proyecto') return !pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_nombre) || !pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_cliente);
  if (entity === 'tarea') return !pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_nombre) || !pickCsvValue(row.data, CSV_FIELD_ALIASES.tarea_nombre);
  return false;
}

function pendingPlaceholder(value: string, field: string, explicitPlaceholder: string): { value: string; pending: boolean } {
  const trimmed = value.trim();
  return trimmed ? { value: trimmed, pending: isPendingMarker(trimmed) } : { value: explicitPlaceholder || `DATO PENDIENTE - ${field.toUpperCase()}`, pending: true };
}

function pendingDate(value: string): { value: string; pending: boolean } {
  return value.trim() ? { value: value.trim(), pending: isPendingMarker(value) } : { value: '', pending: true };
}

function pickCsvValue(row: Record<string, string>, aliases: readonly string[]): string {
  const normalizedEntries = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[normalizeCsvKey(key)] = value ?? '';
    return acc;
  }, {});

  for (const alias of aliases) {
    const normalizedAlias = normalizeCsvKey(alias);
    const value = normalizedEntries[normalizedAlias];
    if (typeof value === 'string' && value.trim()) return value.trim();
    const exactValue = row[alias];
    if (typeof exactValue === 'string' && exactValue.trim()) return exactValue.trim();
  }

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeCsvKey(key);
    if (aliases.some((alias) => normalizeCsvKey(alias) === normalizedKey) && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function pickRawCsvValue(row: MasterRow, key: string): string {
  return Object.entries(row.data).find(([header]) => normalizeCsvKey(header) === normalizeCsvKey(key))?.[1]?.trim() ?? '';
}

export function Configuracion() {
  const { usuario } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isPMO = usuario?.rol === 'pmo';
  const [tab, setTab] = useState<Tab>('plantillas');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Configuración</h2>
        <p className="text-sm text-[var(--text-secondary)]">Plantillas de cronograma, datos operativos y preferencias</p>
      </div>
      <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto">
        {(['plantillas', 'datos', 'preferencias'] as Tab[]).map((key) => {
          if (key === 'datos' && !isPMO) return null;
          return <button key={key} onClick={() => setTab(key)} className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px ${tab === key ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-secondary)] border-transparent'}`}>{key === 'plantillas' ? 'Plantillas' : key === 'datos' ? 'Importar datos' : 'Preferencias'}</button>;
        })}
      </div>
      {tab === 'plantillas' && <ScheduleTemplatesTab isPMO={isPMO} />}
      {tab === 'datos' && isPMO && <MasterCsvImportTab />}
      {tab === 'preferencias' && <div className="card p-6"><h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 flex items-center gap-2"><Palette className="w-4 h-4" /> Apariencia</h3><div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-base)]"><div><p className="text-sm font-medium text-[var(--text-primary)]">Tema</p><p className="text-xs text-[var(--text-secondary)]">{theme === 'dark' ? 'Modo oscuro activo' : 'Modo claro activo'}</p></div><button onClick={toggleTheme} className="btn-secondary text-sm">Cambiar a {theme === 'dark' ? 'claro' : 'oscuro'}</button></div></div>}
    </div>
  );
}

function ScheduleTemplatesTab({ isPMO }: { isPMO: boolean }) {
  const [templates, setTemplates] = useState<Partial<Record<CsvTemplateKey, CsvTemplateState>>>({});
  const [previews, setPreviews] = useState<Partial<Record<CsvTemplateKey, SchedulePreview>>>({});
  const [saving, setSaving] = useState<CsvTemplateKey | null>(null);
  const [showClean, setShowClean] = useState(false);
  const [cleanText, setCleanText] = useState('');

  useEffect(() => { void loadTemplates(); }, []);
  async function loadTemplates() {
    const { data } = await supabase.from('plantillas_csv').select('tipo, producto, nombre_archivo, cargado_en, plantillas_csv_tareas(count), plantillas_csv_procesos(count)');
    const next: Partial<Record<CsvTemplateKey, CsvTemplateState>> = {};
    for (const row of (data ?? []) as unknown as Array<{ tipo: CsvTemplateType; producto: string | null; nombre_archivo: string; cargado_en: string; plantillas_csv_tareas: Array<{ count: number }>; plantillas_csv_procesos: Array<{ count: number }> }>) {
      const key = row.tipo === 'soporte' ? 'soporte' : row.producto?.toLowerCase() as CsvTemplateKey;
      if (key) next[key] = { nombre_archivo: row.nombre_archivo, cargado_en: row.cargado_en, tareas: row.plantillas_csv_tareas?.[0]?.count ?? 0, procesos: row.plantillas_csv_procesos?.[0]?.count ?? 0 };
    }
    setTemplates(next);
  }
  function parseTemplate(config: CsvTemplateConfig, file: File) {
    Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: 'greedy', transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''), complete: (result) => {
      const headers = result.meta.fields ?? [];
      const errors = TEMPLATE_REQUIRED.filter((header) => !headers.includes(header));
      const hasOrder = headers.includes('order') || headers.includes('sort_order');
      if (!hasOrder) errors.push('order o sort_order');
      const expectedKey = config.tipo === 'soporte' ? 'support' : `implementation_${config.producto?.toLowerCase()}`;
      const activities: ScheduleActivity[] = [];
      result.data.forEach((row, index) => {
        if (!Object.values(row).some((value) => value?.trim())) return;
        const order = Number((row.sort_order ?? row.order ?? '').trim());
        if ((row.template_key ?? '').trim() !== expectedKey) errors.push(`Fila ${index + 2}: template_key debe ser ${expectedKey}`);
        if (!Number.isInteger(order) || order < 0) errors.push(`Fila ${index + 2}: order/sort_order debe ser entero no negativo`);
        if (!(row.process_key ?? '').trim() || !(row.process_name ?? '').trim() || !(row.activity_key ?? '').trim() || !(row.activity_name ?? '').trim()) errors.push(`Fila ${index + 2}: proceso y actividad son obligatorios`);
        if (!errors.some((error) => error.startsWith(`Fila ${index + 2}:`))) activities.push({ template_key: expectedKey, process_key: row.process_key.trim(), process_name: row.process_name.trim(), activity_key: row.activity_key.trim(), activity_name: row.activity_name, parent_process_key: (row.parent_process_key ?? '').trim(), sort_order: order, duration_days: row.duration_days?.trim() ? Number(row.duration_days) : null, start_offset_days: row.start_offset_days?.trim() ? Number(row.start_offset_days) : 0, default_priority: normalizePriority(row.default_priority), suggested_role: (row.suggested_role ?? '').trim(), is_optional: ['true', '1', 'si', 'sí'].includes((row.is_optional ?? '').trim().toLowerCase()) });
      });
      const structure = [...new Map(activities.map((activity) => [activity.process_key, activity])).values()].map((process) => ({ key: process.process_key, name: process.process_name, activities: activities.filter((activity) => activity.process_key === process.process_key).sort((a, b) => a.sort_order - b.sort_order).map((activity) => activity.activity_name) }));
      setPreviews((current) => ({ ...current, [config.key]: { fileName: file.name, activities, structure, errors } }));
    }, error: (error) => setPreviews((current) => ({ ...current, [config.key]: { fileName: file.name, activities: [], structure: [], errors: [error.message] } })) });
  }
  async function saveTemplate(config: CsvTemplateConfig) {
    const preview = previews[config.key];
    if (!preview || preview.errors.length) return;
    setSaving(config.key);
    const { error } = await supabase.rpc('guardar_plantilla_csv', { p_tipo: config.tipo, p_producto: config.producto, p_nombre_archivo: preview.fileName, p_tareas: preview.activities });
    if (!error) { setPreviews((current) => ({ ...current, [config.key]: undefined })); await loadTemplates(); }
    else setPreviews((current) => ({ ...current, [config.key]: { ...preview, errors: [error.message] } }));
    setSaving(null);
  }
  async function clearTemplates() {
    if (cleanText !== 'LIMPIAR PLANTILLAS') return;
    await supabase.rpc('limpiar_plantillas_csv');
    setTemplates({}); setPreviews({}); setCleanText(''); setShowClean(false);
  }
  if (!isPMO) return <p className="text-sm text-[var(--text-secondary)]">Solo la PMO puede administrar plantillas.</p>;
  return <div className="space-y-4"><div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-semibold text-[var(--text-primary)]">Plantillas de cronograma</h3><p className="text-sm text-[var(--text-secondary)]">Cada CSV define procesos y actividades modelo. No contiene datos históricos.</p></div><button onClick={() => setShowClean(true)} className="btn-secondary text-sm text-danger flex items-center gap-2"><Trash2 className="w-4 h-4" /> Limpiar plantillas</button></div><div className="rounded-lg bg-[var(--bg-base)] p-3 text-xs text-[var(--text-secondary)]"><p className="font-medium text-[var(--text-primary)]">Formato esperado</p><p>Obligatorias: <code>template_key</code>, <code>process_key</code>, <code>process_name</code>, <code>activity_key</code>, <code>activity_name</code> y <code>order</code> o <code>sort_order</code>.</p><p>Opcionales: <code>parent_process_key</code>, <code>duration_days</code>, <code>start_offset_days</code>, <code>default_priority</code>, <code>suggested_role</code>, <code>is_optional</code>.</p></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{CSV_TEMPLATES.map((config) => { const current = templates[config.key]; const preview = previews[config.key]; return <div key={config.key} className="card p-5 space-y-4"><div className="flex items-start justify-between"><div><h4 className="font-semibold text-[var(--text-primary)]">{config.label}</h4><p className="text-xs text-[var(--text-secondary)]">{current ? `${current.procesos} procesos · ${current.tareas} actividades` : 'Sin plantilla cargada'}</p></div><FileSpreadsheet className="w-5 h-5 text-caribbean-green" /></div><input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) parseTemplate(config, file); event.currentTarget.value = ''; }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:text-sm file:text-white" />{preview && <div className="rounded-lg bg-[var(--bg-base)] p-3 space-y-2"><p className="text-sm font-medium text-[var(--text-primary)]">{preview.structure.length} procesos · {preview.activities.length} actividades</p>{preview.structure.map((process) => <div key={process.key}><p className="text-sm font-medium text-[var(--text-primary)]">{process.name}</p>{process.activities.map((activity) => <p key={`${process.key}-${activity}`} className="text-xs text-[var(--text-secondary)] pl-3">• {activity}</p>)}</div>)}{preview.errors.map((error) => <p key={error} className="text-xs text-danger">{error}</p>)}<button onClick={() => void saveTemplate(config)} disabled={saving === config.key || preview.errors.length > 0} className="btn-primary text-sm flex items-center gap-2">{saving === config.key && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar plantilla</button></div>}</div>; })}</div>{showClean && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="card p-6 w-full max-w-md space-y-4"><h3 className="text-lg font-bold text-[var(--text-primary)]">Limpiar plantillas</h3><p className="text-sm text-[var(--text-secondary)]">Esta acción elimina solo las plantillas de cronograma. No elimina proyectos ni cronogramas existentes.</p><input value={cleanText} onChange={(event) => setCleanText(event.target.value)} className="input-field" placeholder="LIMPIAR PLANTILLAS" /><div className="flex justify-end gap-3"><button onClick={() => setShowClean(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={() => void clearTemplates()} disabled={cleanText !== 'LIMPIAR PLANTILLAS'} className="btn-primary text-sm">Confirmar</button></div></div></div>}</div>;
}

function MasterCsvImportTab() {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [showClean, setShowClean] = useState(false);
  const [cleanText, setCleanText] = useState('');
  const [pendingImports, setPendingImports] = useState<PendingImport[]>([]);
  const errors = rows.filter((row) => row.status === 'error');
  const counts = rows.reduce<Record<string, number>>((acc, row) => { acc[row.entity] = (acc[row.entity] ?? 0) + 1; return acc; }, {});

  useEffect(() => { void loadPendingImports(); }, []);

  async function loadPendingImports() {
    const { data } = await supabase.rpc('listar_importaciones_pendientes');
    setPendingImports((data ?? []) as PendingImport[]);
  }

  function parseMaster(file: File) {
    Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: 'greedy', transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''), complete: (parsed) => {
      const headers = parsed.meta.fields ?? [];
      const required = ['entidad'];
      const next: MasterRow[] = [];
      parsed.data.forEach((data, index) => {
        const entityRaw = (data.entidad ?? '').trim().toLowerCase();
        const entity = normalizeEntity(entityRaw);
        const status: ImportStatus = !entity ? 'error' : 'ok';
        const entityName = entity ? entity : entityRaw ? entityRaw : 'fila';
        next.push({ id: `${entityName}-${index}`, entity: entityName, data, status, message: status === 'ok' ? 'Lista para importar' : `Entidad no soportada: ${entityRaw || 'vacía'}` });
      });
      if (headers.length === 0 || required.some((header) => !headers.includes(header))) next.unshift({ id: 'header-error', entity: 'archivo', data: {}, status: 'error', message: 'El CSV debe incluir la columna entidad.' });
      setRows(next); setFileName(file.name); setResult(null);
    }, error: (error) => { setRows([{ id: 'parse-error', entity: 'archivo', data: {}, status: 'error', message: error.message }]); setFileName(file.name); } });
  }

  async function confirmImport() {
    if (errors.length) return;

    const pendingRows = rows.filter(rowNeedsPendingData);
    setRows((current) => current.map((row) => rowNeedsPendingData(row) ? { ...row, status: 'pending', message: 'Pendiente de completar' } : row));
    setImporting(true);
    const payload: Record<string, unknown[]> = { usuarios: [], proyectos: [], tareas: [], reuniones: [], comunicaciones: [], roles_proyecto: [], asignaciones_tarea: [], asistentes_reunion: [], registros_tiempo: [] };
    const get = (row: MasterRow, aliases: readonly string[]) => pickCsvValue(row.data, aliases);
    const source = (row: MasterRow, pendingFields: Record<string, string> = {}) => ({ source_record_id: pickRawCsvValue(row, 'record_id') || row.id, raw_data: row.data, pending_fields: pendingFields, pending_marker: Object.values(row.data).some((value) => isPendingMarker(value)) || Object.keys(pendingFields).length > 0 });
    const projectPayloadNames = new Set<string>();
    const projectClientsByName = new Map<string, string>();
    const projectNamesByExternalId = new Map<string, string>();
    for (const projectRow of rows) {
      if (normalizeEntity(projectRow.entity) !== 'proyecto') continue;
      const projectName = get(projectRow, CSV_FIELD_ALIASES.proyecto_nombre);
      const externalProjectId = pickRawCsvValue(projectRow, 'project_id');
      if (projectName) {
        projectClientsByName.set(normalizeImportName(projectName), get(projectRow, CSV_FIELD_ALIASES.proyecto_cliente));
        if (externalProjectId) projectNamesByExternalId.set(externalProjectId, projectName);
      }
    }
    const ensureProject = (projectName: { value: string; pending: boolean }, client: { value: string; pending: boolean }) => {
      const key = normalizeImportName(projectName.value);
      if (projectPayloadNames.has(key)) return;
      payload.proyectos.push({ source_record_id: `generated-project-${key}`, pending_marker: projectName.pending || client.pending, pending_fields: projectName.pending || client.pending ? { nombre: projectName.value, cliente: client.value } : {}, proyecto_id_externo: '', nombre: projectName.value, descripcion: '', categoria: 'implementacion', estado: 'no_iniciado', prioridad: 'media', linea_producto: '', fecha_inicio: '', fecha_limite: '', valor_estimado: '', cliente: client.value, template_key: '' });
      projectPayloadNames.add(key);
    };
    for (const row of rows) {
      const entity = normalizeEntity(row.entity);
      if (entity === 'usuario') {
        const nombre = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.nombre), 'nombre', 'USUARIO PENDIENTE - FALTA NOMBRE');
        const sourceId = pickRawCsvValue(row, 'record_id') || row.id;
        const email = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.email), 'email', `usuario-pendiente-${sourceId}@pendiente.local`);
        payload.usuarios.push({ ...source(row, { nombre: nombre.pending ? nombre.value : '', email: email.pending ? email.value : '' }), nombre: nombre.value, email: email.value, rol: normalizeRole(get(row, CSV_FIELD_ALIASES.rol)), tarifa_hora: get(row, CSV_FIELD_ALIASES.tarifa_hora) || '0' });
      }
      if (entity === 'proyecto') {
        const nombre = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.proyecto_nombre), 'nombre', 'PROYECTO PENDIENTE - FALTA NOMBRE');
        const cliente = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.proyecto_cliente), 'cliente', 'CLIENTE PENDIENTE');
        const fechaInicio = pendingDate(get(row, CSV_FIELD_ALIASES.fecha_inicio));
        const fechaLimite = pendingDate(get(row, CSV_FIELD_ALIASES.fecha_limite));
        payload.proyectos.push({ ...source(row, { ...(nombre.pending ? { nombre: nombre.value } : {}), ...(cliente.pending ? { cliente: cliente.value } : {}), ...(fechaInicio.pending ? { fecha_inicio: 'FECHA PENDIENTE' } : {}), ...(fechaLimite.pending ? { fecha_limite: 'FECHA PENDIENTE' } : {}) }), proyecto_id_externo: pickRawCsvValue(row, 'project_id'), nombre: nombre.value, descripcion: get(row, CSV_FIELD_ALIASES.descripcion), categoria: normalizeCategory(get(row, CSV_FIELD_ALIASES.categoria)), estado: get(row, CSV_FIELD_ALIASES.estado) || 'no_iniciado', prioridad: normalizePriority(get(row, CSV_FIELD_ALIASES.prioridad)), linea_producto: get(row, CSV_FIELD_ALIASES.linea_producto), fecha_inicio: fechaInicio.value, fecha_limite: fechaLimite.value, valor_estimado: get(row, CSV_FIELD_ALIASES.valor_estimado), cliente: cliente.value, template_key: get(row, ['template_key']) });
        projectPayloadNames.add(normalizeImportName(nombre.value));
      }
      if (entity === 'tarea') {
        const externalProjectId = pickRawCsvValue(row, 'project_id');
        const projectName = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.proyecto_nombre) || projectNamesByExternalId.get(externalProjectId) || '', 'proyecto_nombre', 'PROYECTO PENDIENTE - FALTA NOMBRE');
        const taskName = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.tarea_nombre), 'tarea_nombre', 'TAREA PENDIENTE - FALTA NOMBRE');
        const client = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.proyecto_cliente) || projectClientsByName.get(normalizeImportName(projectName.value)) || '', 'cliente', 'CLIENTE PENDIENTE');
        const startDate = pendingDate(get(row, CSV_FIELD_ALIASES.fecha_inicio));
        const dueDate = pendingDate(get(row, CSV_FIELD_ALIASES.fecha_limite));
        ensureProject(projectName, client);
        payload.tareas.push({ ...source(row, { ...(projectName.pending ? { proyecto_nombre: projectName.value } : {}), ...(taskName.pending ? { tarea_nombre: taskName.value } : {}), ...(client.pending ? { cliente: client.value } : {}), ...(startDate.pending ? { fecha_inicio: 'FECHA PENDIENTE' } : {}), ...(dueDate.pending ? { fecha_limite: 'FECHA PENDIENTE' } : {}) }), source_task_id: pickRawCsvValue(row, 'task_id'), proyecto_id: null, proyecto_id_externo: pickRawCsvValue(row, 'project_id'), proyecto_nombre: projectName.value, proyecto_cliente: client.value, nombre: taskName.value, descripcion: get(row, CSV_FIELD_ALIASES.descripcion), estado: get(row, CSV_FIELD_ALIASES.estado) || 'no_iniciado', prioridad: normalizePriority(get(row, CSV_FIELD_ALIASES.prioridad)), fecha_inicio: startDate.value, fecha_limite: dueDate.value, tiempo_estimado_horas: get(row, CSV_FIELD_ALIASES.tiempo_estimado_horas), asignados_emails: get(row, CSV_FIELD_ALIASES.asignados_emails).split(/[;,]/).map((value) => value.trim()).filter(Boolean) });
      }
      if (entity === 'reunion') {
        const externalProjectId = pickRawCsvValue(row, 'project_id');
        const projectName = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.proyecto_nombre) || projectNamesByExternalId.get(externalProjectId) || '', 'proyecto_nombre', 'PROYECTO PENDIENTE - FALTA NOMBRE');
        const meetingName = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.reunion_nombre), 'reunion_nombre', 'REUNIÓN PENDIENTE - FALTA NOMBRE');
        const client = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.proyecto_cliente) || projectClientsByName.get(normalizeImportName(projectName.value)) || '', 'cliente', 'CLIENTE PENDIENTE');
        const meetingDate = pendingDate(get(row, CSV_FIELD_ALIASES.fecha_inicio));
        ensureProject(projectName, client);
        payload.reuniones.push({ ...source(row, { ...(projectName.pending ? { proyecto_nombre: projectName.value } : {}), ...(meetingName.pending ? { reunion_nombre: meetingName.value } : {}), ...(client.pending ? { cliente: client.value } : {}), ...(meetingDate.pending ? { fecha: 'FECHA PENDIENTE' } : {}) }), source_meeting_id: pickRawCsvValue(row, 'meeting_id'), proyecto_id: null, proyecto_id_externo: pickRawCsvValue(row, 'project_id'), proyecto_nombre: projectName.value, proyecto_cliente: client.value, nombre: meetingName.value, tipo: get(row, CSV_FIELD_ALIASES.tipo), estado: get(row, CSV_FIELD_ALIASES.estado) || 'programada', fecha: meetingDate.value, hora: get(row, CSV_FIELD_ALIASES.hora), notas: get(row, CSV_FIELD_ALIASES.notas), asistentes_emails: get(row, CSV_FIELD_ALIASES.asistentes_emails).split(/[;,]/).map((value) => value.trim()).filter(Boolean) });
      }
      if (entity === 'comunicacion') {
        const externalProjectId = pickRawCsvValue(row, 'project_id');
        const projectName = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.proyecto_nombre) || projectNamesByExternalId.get(externalProjectId) || '', 'proyecto_nombre', 'PROYECTO PENDIENTE - FALTA NOMBRE');
        const client = pendingPlaceholder(get(row, CSV_FIELD_ALIASES.proyecto_cliente) || projectClientsByName.get(normalizeImportName(projectName.value)) || '', 'cliente', 'CLIENTE PENDIENTE');
        const communicationDate = pendingDate(get(row, CSV_FIELD_ALIASES.fecha_inicio));
        ensureProject(projectName, client);
        payload.comunicaciones.push({ ...source(row, { ...(projectName.pending ? { proyecto_nombre: projectName.value } : {}), ...(client.pending ? { cliente: client.value } : {}), ...(communicationDate.pending ? { fecha: 'FECHA PENDIENTE' } : {}) }), source_communication_id: pickRawCsvValue(row, 'communication_id'), proyecto_id: null, proyecto_id_externo: pickRawCsvValue(row, 'project_id'), proyecto_nombre: projectName.value, proyecto_cliente: client.value, tipo: get(row, CSV_FIELD_ALIASES.tipo), fecha: communicationDate.value, resultado: get(row, CSV_FIELD_ALIASES.resultado), notas: get(row, CSV_FIELD_ALIASES.notas), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email) });
      }
      if (entity === 'rol_proyecto') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        payload.roles_proyecto.push({ ...source(row), proyecto_id: null, proyecto_id_externo: pickRawCsvValue(row, 'project_id'), proyecto_nombre: projectName, proyecto_cliente: get(row, CSV_FIELD_ALIASES.proyecto_cliente), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email), tipo_raci: get(row, CSV_FIELD_ALIASES.tipo_raci) || get(row, CSV_FIELD_ALIASES.rol) });
      }
      if (entity === 'asignacion_tarea') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        payload.asignaciones_tarea.push({ ...source(row), proyecto_id: null, proyecto_id_externo: pickRawCsvValue(row, 'project_id'), proyecto_nombre: projectName, tarea_nombre: get(row, CSV_FIELD_ALIASES.tarea_nombre), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email) });
      }
      if (entity === 'asistente_reunion') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        payload.asistentes_reunion.push({ ...source(row), proyecto_id: null, proyecto_id_externo: pickRawCsvValue(row, 'project_id'), proyecto_nombre: projectName, reunion_nombre: get(row, CSV_FIELD_ALIASES.reunion_nombre), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email) });
      }
      if (entity === 'registro_tiempo') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        payload.registros_tiempo.push({ ...source(row), proyecto_id: null, proyecto_id_externo: pickRawCsvValue(row, 'project_id'), proyecto_nombre: projectName, tarea_nombre: get(row, CSV_FIELD_ALIASES.tarea_nombre), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email), inicio: get(row, CSV_FIELD_ALIASES.inicio), fin: get(row, CSV_FIELD_ALIASES.fin) });
      }
    }
    const importPayload = { ...payload, nombre_archivo: fileName };
    const { error: pendingError } = await supabase.rpc('importar_datos_pendientes_csv', { p_payload: importPayload });
    if (pendingError) { setImporting(false); setRows((current) => [...current, { id: 'pending-error', entity: 'pendientes', data: {}, status: 'error', message: pendingError.message }]); return; }
    const { data, error } = await supabase.rpc('importar_datos_csv', { p_payload: importPayload });
    setImporting(false);
    if (error) { setRows((current) => [...current, { id: 'import-error', entity: 'importación', data: {}, status: 'error', message: error.message }]); return; }
    setResult({
      registros_importados: rows.length,
      registros_completos: rows.length - pendingRows.length,
      registros_pendientes: pendingRows.length,
      registros_descartados_por_campos_faltantes: 0,
      ...(data as Record<string, number>),
    });
    await loadPendingImports();
  }

  async function updatePendingImport(item: PendingImport, field: 'project_name' | 'task_name', value: string) {
    const datos = { ...item.datos, [field]: value };
    const { error } = await supabase.rpc('editar_importacion_pendiente', { p_id: item.id, p_datos: datos });
    if (!error) await loadPendingImports();
  }

  async function clearDatabase() {
    if (cleanText !== 'LIMPIAR BASE DE DATOS') return;
    const { error } = await supabase.rpc('limpiar_datos_operativos');
    const { error: pendingError } = error ? { error: null } : await supabase.rpc('limpiar_importaciones_pendientes');
    const { error: masterError } = error || pendingError ? { error: null } : await supabase.rpc('limpiar_registros_maestros');
    if (error || pendingError || masterError) setRows([{ id: 'clean-error', entity: 'limpieza', data: {}, status: 'error', message: error?.message ?? pendingError?.message ?? masterError?.message ?? 'No se pudo limpiar la base de datos' }]);
    else { setRows([]); setResult(null); setCleanText(''); setShowClean(false); }
  }

  return <div className="space-y-4"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-[var(--text-primary)]">Importar datos</h3><p className="text-sm text-[var(--text-secondary)]">Selecciona el archivo CSV maestro. Los faltantes se convierten en placeholders editables; no se descartan registros.</p><p className="text-xs text-[var(--text-secondary)] mt-2">Columna obligatoria: <code>entidad</code>. Valores: usuario, proyecto, tarea, rol_proyecto, asignacion_tarea, reunion, asistente_reunion, comunicacion.</p></div><button onClick={() => setShowClean(true)} className="btn-secondary text-sm text-danger flex items-center gap-2 shrink-0"><Trash2 className="w-4 h-4" /> Limpiar base de datos</button></div><div className="card p-8 text-center"><input id="master-csv" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) parseMaster(file); event.currentTarget.value = ''; }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:text-sm file:text-white" /></div>{fileName && <div className="card p-5 space-y-4"><div className="flex items-center justify-between"><div><h4 className="font-semibold text-[var(--text-primary)]">Vista previa: {fileName}</h4><p className="text-sm text-[var(--text-secondary)]">{rows.length} registros · {errors.length} errores estructurales</p></div><button onClick={() => void confirmImport()} disabled={errors.length > 0 || importing || !rows.length} className="btn-primary text-sm flex items-center gap-2">{importing && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar importación</button></div><div className="grid grid-cols-2 md:grid-cols-5 gap-2">{Object.entries(counts).map(([entity, count]) => <div key={entity} className="rounded-lg bg-[var(--bg-base)] p-3"><p className="text-lg font-bold text-[var(--text-primary)]">{count}</p><p className="text-xs text-[var(--text-secondary)]">{entity}</p></div>)}</div>{result && <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-[var(--text-primary)]"><p className="font-semibold text-success">{result.registros_importados} registros importados</p><p>{result.registros_completos} registros completos</p><p>{result.registros_pendientes} registros con datos pendientes</p><p>{result.registros_descartados_por_campos_faltantes} registros descartados por campos faltantes</p></div>}<div className="space-y-2">{rows.filter((row) => row.status === 'error').map((row) => <div key={row.id} className="rounded-lg border border-red-200 bg-red-50/50 p-3"><p className="text-sm text-danger flex items-center gap-2"><XCircle className="w-4 h-4 shrink-0" /> {row.message}</p></div>)}{rows.filter((row) => row.status === 'pending').slice(0, 20).map((row) => <p key={row.id} className="text-xs text-amber-700"><span className="mr-1">Pendiente de completar</span> · {row.entity}: {row.message}</p>)}{rows.filter((row) => row.status === 'ok').slice(0, 20).map((row) => <p key={row.id} className="text-xs text-[var(--text-secondary)]"><CheckCircle2 className="w-3 h-3 inline mr-1 text-success" />{row.entity}: {row.data.nombre ?? row.data.activity_name ?? row.message}</p>)}</div></div>}{pendingImports.length > 0 && <div className="card p-5 space-y-3"><div><h4 className="font-semibold text-[var(--text-primary)]">Datos pendientes de completar</h4><p className="text-xs text-[var(--text-secondary)]">Estos registros se conservaron sin inventar información. La PMO puede corregirlos desde aquí.</p></div>{pendingImports.map((item) => <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2"><p className="text-xs text-[var(--text-secondary)]">Pendiente de completar · {item.entidad} · {item.source_record_id} · {item.mensaje}</p>{(item.entidad === 'tarea' || item.proyecto_nombre) && <div className="grid grid-cols-1 md:grid-cols-2 gap-2"><label className="text-xs text-[var(--text-secondary)]">Proyecto<input defaultValue={item.proyecto_nombre ?? ''} onBlur={(event) => void updatePendingImport(item, 'project_name', event.target.value)} className="input-field mt-1" /></label>{item.entidad === 'tarea' && <label className="text-xs text-[var(--text-secondary)]">Tarea<input defaultValue={item.tarea_nombre ?? ''} onBlur={(event) => void updatePendingImport(item, 'task_name', event.target.value)} className="input-field mt-1" /></label>}</div>}</div>)}</div>}{showClean && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="card p-6 w-full max-w-md space-y-4"><h3 className="text-lg font-bold text-danger">Limpiar base de datos</h3><p className="text-sm text-[var(--text-secondary)]">Se eliminarán proyectos, tareas, asignaciones, tiempos, reuniones, comunicaciones, reportes, relaciones RACI e historial de importaciones. Las plantillas, usuarios y configuración permanecerán intactos.</p><p className="text-sm text-[var(--text-secondary)]">Escribe <strong>LIMPIAR BASE DE DATOS</strong> para confirmar.</p><input value={cleanText} onChange={(event) => setCleanText(event.target.value)} className="input-field" placeholder="LIMPIAR BASE DE DATOS" /><div className="flex justify-end gap-3"><button onClick={() => setShowClean(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={() => void clearDatabase()} disabled={cleanText !== 'LIMPIAR BASE DE DATOS'} className="btn-primary text-sm">Confirmar limpieza</button></div></div></div>}</div>;
}

function normalizePriority(value: string | undefined) { const normalized = (value ?? '').trim().toLowerCase(); return ({ baja: 'baja', low: 'baja', media: 'media', medium: 'media', normal: 'media', alta: 'alta', high: 'alta', urgente: 'urgente', urgent: 'urgente' } as Record<string, string>)[normalized] ?? 'media'; }
function normalizeRole(value: string) { const normalized = value.trim().toLowerCase().replace(/\s+/g, '_'); return ['pmo', 'direccion', 'project_manager', 'consultor_senior', 'consultor_junior', 'desarrollo', 'administrativo'].includes(normalized) ? normalized : 'consultor_junior'; }
function normalizeCategory(value: string) { return value.toLowerCase().includes('soport') ? 'soporte' : 'implementacion'; }
