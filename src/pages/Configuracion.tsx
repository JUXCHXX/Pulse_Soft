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
type ImportStatus = 'ok' | 'warning' | 'error';

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

function buildProjectLookup(rows: MasterRow[]) {
  const projectIdsByName = new Map<string, string>();
  const duplicateNames = new Set<string>();

  for (const row of rows) {
    if (normalizeEntity(row.entity) !== 'proyecto') continue;
    const projectName = pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_nombre);
    const projectId = (row.data.project_id ?? row.data.projectId ?? row.data['project-id'] ?? '').trim();
    if (!projectName || !projectId) continue;
    const key = normalizeImportName(projectName);
    if (projectIdsByName.has(key)) {
      duplicateNames.add(key);
      continue;
    }
    projectIdsByName.set(key, projectId);
  }

  return { projectIdsByName, duplicateNames };
}

function resolveProjectId(row: MasterRow, projectIdsByName: Map<string, string>, duplicateNames: Set<string>): { projectId: string; resolvedByName: boolean; error: string | null } {
  const explicitProjectId = (row.data.project_id ?? row.data.projectId ?? row.data['project-id'] ?? '').trim();
  if (explicitProjectId) return { projectId: explicitProjectId, resolvedByName: false, error: null };

  const projectName = pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_nombre);
  if (!projectName) return { projectId: '', resolvedByName: false, error: 'Falta nombre del proyecto' };

  const normalizedKey = normalizeImportName(projectName);
  if (duplicateNames.has(normalizedKey)) {
    return { projectId: '', resolvedByName: false, error: `Proyecto ambiguo: nombre duplicado después de normalizar -> ${projectName}` };
  }

  const resolvedProjectId = projectIdsByName.get(normalizedKey) ?? '';
  if (!resolvedProjectId) {
    return { projectId: '', resolvedByName: false, error: `Proyecto no encontrado por nombre -> ${projectName}` };
  }

  return { projectId: resolvedProjectId, resolvedByName: true, error: null };
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

function setImportField(row: MasterRow, field: 'project_name' | 'task_name', value: string): MasterRow {
  return { ...row, data: { ...row.data, [field]: value }, manuallyCorrected: true };
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
  const errors = rows.filter((row) => row.status === 'error');
  const counts = rows.reduce<Record<string, number>>((acc, row) => { acc[row.entity] = (acc[row.entity] ?? 0) + 1; return acc; }, {});

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

    const { projectIdsByName, duplicateNames } = buildProjectLookup(rows);

    const invalidRows = rows.filter((row) => {
      const entity = normalizeEntity(row.entity);
      if (entity === 'usuario') {
        const email = pickCsvValue(row.data, CSV_FIELD_ALIASES.email);
        const nombre = pickCsvValue(row.data, CSV_FIELD_ALIASES.nombre);
        return !email || !nombre;
      }
      if (entity === 'proyecto') {
        const projectName = pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_nombre);
        const client = pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_cliente);
        return !projectName || !client;
      }
      if (entity === 'tarea') {
        const projectName = pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_nombre);
        const taskName = pickCsvValue(row.data, CSV_FIELD_ALIASES.tarea_nombre);
        const projectResolution = resolveProjectId(row, projectIdsByName, duplicateNames);

        if (!taskName) return true;
        if (!projectName) return true;
        if (projectResolution.error && !row.manuallyCorrected) return true;
      }
      return false;
    });

    if (invalidRows.length > 0) {
      setRows((current) => current.map((row) => {
        if (!invalidRows.some((invalidRow) => invalidRow.id === row.id)) return row;
        const entity = normalizeEntity(row.entity);
        if (entity === 'tarea') {
          const projectName = pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_nombre);
          const taskName = pickCsvValue(row.data, CSV_FIELD_ALIASES.tarea_nombre);
          const projectResolution = resolveProjectId(row, projectIdsByName, duplicateNames);

          if (!taskName) {
            return { ...row, status: 'error', message: `Falta nombre de la tarea | proyecto="${projectName || 'vacío'}" | tarea="vacío"` };
          }
          if (!projectName) {
            return { ...row, status: 'error', message: `Falta nombre del proyecto | tarea="${taskName}"` };
          }
          if (projectResolution.error && !row.manuallyCorrected) {
            return { ...row, status: 'error', message: `Proyecto no resuelto: ${projectResolution.error}` };
          }

          return { ...row, status: 'ok', message: row.manuallyCorrected ? `Corrección lista: proyecto asignado a ${projectName}` : `Proyecto resuelto por nombre: ${projectName}` };
        }
        return { ...row, status: 'error', message: 'Falta nombre del proyecto o nombre de la tarea' };
      }));
      return;
    }

    setImporting(true);
    const payload: Record<string, unknown[]> = { usuarios: [], proyectos: [], tareas: [], reuniones: [], comunicaciones: [], roles_proyecto: [], asignaciones_tarea: [], asistentes_reunion: [], registros_tiempo: [] };
    const get = (row: MasterRow, aliases: readonly string[]) => pickCsvValue(row.data, aliases);
    for (const row of rows) {
      const entity = normalizeEntity(row.entity);
      if (entity === 'usuario') payload.usuarios.push({ nombre: get(row, CSV_FIELD_ALIASES.nombre), email: get(row, CSV_FIELD_ALIASES.email), rol: normalizeRole(get(row, CSV_FIELD_ALIASES.rol)), tarifa_hora: get(row, CSV_FIELD_ALIASES.tarifa_hora) || '0' });
      if (entity === 'proyecto') payload.proyectos.push({ nombre: get(row, CSV_FIELD_ALIASES.proyecto_nombre), descripcion: get(row, CSV_FIELD_ALIASES.descripcion), categoria: normalizeCategory(get(row, CSV_FIELD_ALIASES.categoria)), estado: get(row, CSV_FIELD_ALIASES.estado) || 'no_iniciado', prioridad: normalizePriority(get(row, CSV_FIELD_ALIASES.prioridad)), linea_producto: get(row, CSV_FIELD_ALIASES.linea_producto), fecha_inicio: get(row, CSV_FIELD_ALIASES.fecha_inicio), fecha_limite: get(row, CSV_FIELD_ALIASES.fecha_limite), valor_estimado: get(row, CSV_FIELD_ALIASES.valor_estimado), cliente: get(row, CSV_FIELD_ALIASES.proyecto_cliente), template_key: get(row, ['template_key']) });
      if (entity === 'tarea') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        const resolvedProject = resolveProjectId(row, projectIdsByName, duplicateNames);
        payload.tareas.push({ proyecto_id: resolvedProject.projectId || null, proyecto_nombre: projectName, proyecto_cliente: get(row, CSV_FIELD_ALIASES.proyecto_cliente), nombre: get(row, CSV_FIELD_ALIASES.tarea_nombre), descripcion: get(row, CSV_FIELD_ALIASES.descripcion), estado: get(row, CSV_FIELD_ALIASES.estado) || 'no_iniciado', prioridad: normalizePriority(get(row, CSV_FIELD_ALIASES.prioridad)), fecha_inicio: get(row, CSV_FIELD_ALIASES.fecha_inicio), fecha_limite: get(row, CSV_FIELD_ALIASES.fecha_limite), tiempo_estimado_horas: get(row, CSV_FIELD_ALIASES.tiempo_estimado_horas), asignados_emails: get(row, CSV_FIELD_ALIASES.asignados_emails).split(/[;,]/).map((value) => value.trim()).filter(Boolean) });
      }
      if (entity === 'reunion') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        const resolvedProject = resolveProjectId(row, projectIdsByName, duplicateNames);
        payload.reuniones.push({ proyecto_id: resolvedProject.projectId || null, proyecto_nombre: projectName, proyecto_cliente: get(row, CSV_FIELD_ALIASES.proyecto_cliente), nombre: get(row, CSV_FIELD_ALIASES.reunion_nombre), tipo: get(row, CSV_FIELD_ALIASES.tipo), estado: get(row, CSV_FIELD_ALIASES.estado) || 'programada', fecha: get(row, CSV_FIELD_ALIASES.fecha_inicio), hora: get(row, CSV_FIELD_ALIASES.hora), notas: get(row, CSV_FIELD_ALIASES.notas), asistentes_emails: get(row, CSV_FIELD_ALIASES.asistentes_emails).split(/[;,]/).map((value) => value.trim()).filter(Boolean) });
      }
      if (entity === 'comunicacion') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        const resolvedProject = resolveProjectId(row, projectIdsByName, duplicateNames);
        payload.comunicaciones.push({ proyecto_id: resolvedProject.projectId || null, proyecto_nombre: projectName, proyecto_cliente: get(row, CSV_FIELD_ALIASES.proyecto_cliente), tipo: get(row, CSV_FIELD_ALIASES.tipo), fecha: get(row, CSV_FIELD_ALIASES.fecha_inicio), resultado: get(row, CSV_FIELD_ALIASES.resultado), notas: get(row, CSV_FIELD_ALIASES.notas), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email) });
      }
      if (entity === 'rol_proyecto') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        const resolvedProject = resolveProjectId(row, projectIdsByName, duplicateNames);
        payload.roles_proyecto.push({ proyecto_id: resolvedProject.projectId || null, proyecto_nombre: projectName, proyecto_cliente: get(row, CSV_FIELD_ALIASES.proyecto_cliente), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email), tipo_raci: get(row, CSV_FIELD_ALIASES.tipo_raci) || get(row, CSV_FIELD_ALIASES.rol) });
      }
      if (entity === 'asignacion_tarea') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        const resolvedProject = resolveProjectId(row, projectIdsByName, duplicateNames);
        payload.asignaciones_tarea.push({ proyecto_id: resolvedProject.projectId || null, proyecto_nombre: projectName, tarea_nombre: get(row, CSV_FIELD_ALIASES.tarea_nombre), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email) });
      }
      if (entity === 'asistente_reunion') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        const resolvedProject = resolveProjectId(row, projectIdsByName, duplicateNames);
        payload.asistentes_reunion.push({ proyecto_id: resolvedProject.projectId || null, proyecto_nombre: projectName, reunion_nombre: get(row, CSV_FIELD_ALIASES.reunion_nombre), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email) });
      }
      if (entity === 'registro_tiempo') {
        const projectName = get(row, CSV_FIELD_ALIASES.proyecto_nombre);
        const resolvedProject = resolveProjectId(row, projectIdsByName, duplicateNames);
        payload.registros_tiempo.push({ proyecto_id: resolvedProject.projectId || null, proyecto_nombre: projectName, tarea_nombre: get(row, CSV_FIELD_ALIASES.tarea_nombre), usuario_email: get(row, CSV_FIELD_ALIASES.usuario_email), inicio: get(row, CSV_FIELD_ALIASES.inicio), fin: get(row, CSV_FIELD_ALIASES.fin) });
      }
    }
    const { data, error } = await supabase.rpc('importar_datos_csv', { p_payload: { ...payload, nombre_archivo: fileName } });
    setImporting(false);
    if (error) { setRows((current) => [...current, { id: 'import-error', entity: 'importación', data: {}, status: 'error', message: error.message }]); return; }
    setResult(data as Record<string, number>);
  }

  function updateImportRow(rowId: string, field: 'project_name' | 'task_name', value: string) {
    setRows((current) => current.map((row) => {
      if (row.id !== rowId) return row;
      const updated = setImportField(row, field, value);
      const projectName = pickCsvValue(updated.data, CSV_FIELD_ALIASES.proyecto_nombre);
      const taskName = pickCsvValue(updated.data, CSV_FIELD_ALIASES.tarea_nombre);
      if (normalizeEntity(updated.entity) !== 'tarea') return updated;
      if (!projectName && !taskName) return { ...updated, status: 'error', message: 'Falta nombre del proyecto y nombre de la tarea' };
      if (!projectName) return { ...updated, status: 'error', message: 'Falta nombre del proyecto' };
      if (!taskName) return { ...updated, status: 'error', message: 'Falta nombre de la tarea' };
      return { ...updated, status: 'ok', message: 'Corrección lista para importar' };
    }));
  }

  async function clearDatabase() {
    if (cleanText !== 'LIMPIAR BASE DE DATOS') return;
    const { error } = await supabase.rpc('limpiar_datos_operativos');
    if (error) setRows([{ id: 'clean-error', entity: 'limpieza', data: {}, status: 'error', message: error.message }]);
    else { setRows([]); setResult(null); setCleanText(''); setShowClean(false); }
  }

  return <div className="space-y-4"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-[var(--text-primary)]">Importar datos</h3><p className="text-sm text-[var(--text-secondary)]">Selecciona el archivo CSV maestro. Las entidades se resuelven relacionalmente en Supabase; no se aceptan archivos Excel.</p><p className="text-xs text-[var(--text-secondary)] mt-2">Columna obligatoria: <code>entidad</code>. Valores: usuario, proyecto, tarea, rol_proyecto, asignacion_tarea, reunion, asistente_reunion, comunicacion.</p></div><button onClick={() => setShowClean(true)} className="btn-secondary text-sm text-danger flex items-center gap-2 shrink-0"><Trash2 className="w-4 h-4" /> Limpiar base de datos</button></div><div className="card p-8 text-center"><input id="master-csv" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) parseMaster(file); event.currentTarget.value = ''; }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:text-sm file:text-white" /></div>{fileName && <div className="card p-5 space-y-4"><div className="flex items-center justify-between"><div><h4 className="font-semibold text-[var(--text-primary)]">Vista previa: {fileName}</h4><p className="text-sm text-[var(--text-secondary)]">{rows.length} registros · {errors.length} errores</p></div><button onClick={() => void confirmImport()} disabled={errors.length > 0 || importing || !rows.length} className="btn-primary text-sm flex items-center gap-2">{importing && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar importación</button></div><div className="grid grid-cols-2 md:grid-cols-5 gap-2">{Object.entries(counts).map(([entity, count]) => <div key={entity} className="rounded-lg bg-[var(--bg-base)] p-3"><p className="text-lg font-bold text-[var(--text-primary)]">{count}</p><p className="text-xs text-[var(--text-secondary)]">{entity}</p></div>)}</div>{result && <p className="text-sm text-success">Importación completada: {JSON.stringify(result)}</p>}<div className="space-y-2">{rows.filter((row) => row.status === 'error').map((row) => { const isTask = normalizeEntity(row.entity) === 'tarea'; return <div key={row.id} className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2"><p className="text-sm text-danger flex items-center gap-2"><XCircle className="w-4 h-4 shrink-0" /> {row.message}</p>{isTask && <div className="grid grid-cols-1 md:grid-cols-2 gap-2"><label className="text-xs text-[var(--text-secondary)]">Asignar proyecto<input value={pickCsvValue(row.data, CSV_FIELD_ALIASES.proyecto_nombre)} onChange={(event) => updateImportRow(row.id, 'project_name', event.target.value)} className="input-field mt-1" placeholder="Nombre exacto del proyecto" /></label><label className="text-xs text-[var(--text-secondary)]">Corregir tarea<input value={pickCsvValue(row.data, CSV_FIELD_ALIASES.tarea_nombre)} onChange={(event) => updateImportRow(row.id, 'task_name', event.target.value)} className="input-field mt-1" placeholder="Nombre de la tarea" /></label></div>}</div>; })}</div>{rows.filter((row) => row.status === 'ok').slice(0, 20).map((row) => <p key={row.id} className="text-xs text-[var(--text-secondary)]"><CheckCircle2 className="w-3 h-3 inline mr-1 text-success" />{row.entity}: {row.data.nombre ?? row.data.activity_name ?? row.message}</p>)}</div>}{showClean && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="card p-6 w-full max-w-md space-y-4"><h3 className="text-lg font-bold text-danger">Limpiar base de datos</h3><p className="text-sm text-[var(--text-secondary)]">Se eliminarán proyectos, tareas, asignaciones, tiempos, reuniones, comunicaciones, reportes, relaciones RACI e historial de importaciones. Las plantillas, usuarios y configuración permanecerán intactos.</p><p className="text-sm text-[var(--text-secondary)]">Escribe <strong>LIMPIAR BASE DE DATOS</strong> para confirmar.</p><input value={cleanText} onChange={(event) => setCleanText(event.target.value)} className="input-field" placeholder="LIMPIAR BASE DE DATOS" /><div className="flex justify-end gap-3"><button onClick={() => setShowClean(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={() => void clearDatabase()} disabled={cleanText !== 'LIMPIAR BASE DE DATOS'} className="btn-primary text-sm">Confirmar limpieza</button></div></div></div>}</div>;
}

function normalizePriority(value: string | undefined) { const normalized = (value ?? '').trim().toLowerCase(); return ({ baja: 'baja', low: 'baja', media: 'media', medium: 'media', normal: 'media', alta: 'alta', high: 'alta', urgente: 'urgente', urgent: 'urgente' } as Record<string, string>)[normalized] ?? 'media'; }
function normalizeRole(value: string) { const normalized = value.trim().toLowerCase().replace(/\s+/g, '_'); return ['pmo', 'direccion', 'project_manager', 'consultor_senior', 'consultor_junior', 'desarrollo', 'administrativo'].includes(normalized) ? normalized : 'consultor_junior'; }
function normalizeCategory(value: string) { return value.toLowerCase().includes('soport') ? 'soporte' : 'implementacion'; }
