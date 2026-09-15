import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileUp,
  Loader2,
  Palette,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { ROLES } from '@/lib/constants';
import type { Usuario, RolUsuario } from '@/lib/types';

type Step = 'upload' | 'preview' | 'done';
type RowStatus = 'ok' | 'warning' | 'error';

interface ImportRow {
  id: string;
  hoja: string;
  data: Record<string, string>;
  status: RowStatus;
  message: string;
}

export function Configuracion() {
  const { usuario } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isPMO = usuario?.rol === 'pmo';
  const [tab, setTab] = useState<'plantillas' | 'datos' | 'preferencias'>('plantillas');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Configuración</h2>
        <p className="text-sm text-[var(--text-secondary)]">Plantillas, datos y preferencias del sistema</p>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto">
        {([
          { key: 'plantillas', label: 'Plantillas de Tareas' },
          { key: 'datos', label: 'Cargar Datos' },
          { key: 'preferencias', label: 'Preferencias' },
        ] as const).map((t) => {
          if (t.key === 'datos' && !isPMO) return null;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'text-[var(--accent)] border-[var(--accent)]'
                  : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'plantillas' && (
        <CsvTemplatesTab isPMO={isPMO} />
      )}
      {tab === 'datos' && isPMO && <ImportTab />}
      {tab === 'preferencias' && (
        <div className="card p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
              <Palette className="w-4 h-4" /> Apariencia
            </h3>
            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-base)]">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Tema</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {theme === 'dark' ? 'Modo oscuro activo' : 'Modo claro activo'}
                </p>
              </div>
              <button onClick={toggleTheme} className="btn-secondary text-sm">
                Cambiar a {theme === 'dark' ? 'claro' : 'oscuro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type CsvTemplateKey = 'campuspack' | 'schoolpack' | 'language' | 'soporte';
type CsvTemplateType = 'implementacion' | 'soporte';

interface CsvTask {
  orden: number;
  tarea: string;
  tipo_registro: string;
  proceso_sugerido: string;
  proyectos_fuente: string;
  horas_observadas: string;
  frecuencia_historica: number | null;
}

interface CsvTemplateConfig {
  key: CsvTemplateKey;
  label: string;
  tipo: CsvTemplateType;
  producto: string | null;
}

interface CsvTemplateState {
  nombre_archivo: string;
  cargado_en: string;
  tareas: number;
}

interface CsvPreview {
  fileName: string;
  tasks: CsvTask[];
  ignored: number;
  errors: string[];
}

const CSV_TEMPLATES: CsvTemplateConfig[] = [
  { key: 'campuspack', label: 'Implementación Campuspack', tipo: 'implementacion', producto: 'Campuspack' },
  { key: 'schoolpack', label: 'Implementación Schoolpack', tipo: 'implementacion', producto: 'Schoolpack' },
  { key: 'language', label: 'Implementación Language', tipo: 'implementacion', producto: 'Language' },
  { key: 'soporte', label: 'Soporte', tipo: 'soporte', producto: null },
];

const IMPLEMENTATION_HEADERS = ['plantilla', 'producto', 'tipo_registro', 'proceso_sugerido', 'orden', 'tarea', 'proyectos_fuente', 'horas_observadas'];
const SUPPORT_HEADERS = ['plantilla', 'tipo_registro', 'proceso_sugerido', 'orden', 'tarea', 'proyectos_fuente', 'frecuencia_historica', 'horas_observadas'];

function CsvTemplatesTab({ isPMO }: { isPMO: boolean }) {
  const [templates, setTemplates] = useState<Partial<Record<CsvTemplateKey, CsvTemplateState>>>({});
  const [previews, setPreviews] = useState<Partial<Record<CsvTemplateKey, CsvPreview>>>({});
  const [saving, setSaving] = useState<CsvTemplateKey | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    const { data } = await supabase.from('plantillas_csv').select('tipo, producto, nombre_archivo, cargado_en, plantillas_csv_tareas(count)');
    const next: Partial<Record<CsvTemplateKey, CsvTemplateState>> = {};
    for (const row of (data ?? []) as unknown as Array<{ tipo: CsvTemplateType; producto: string | null; nombre_archivo: string; cargado_en: string; plantillas_csv_tareas: Array<{ count: number }> }>) {
      const key = row.tipo === 'soporte' ? 'soporte' : row.producto?.toLowerCase() as CsvTemplateKey;
      if (key) next[key] = { nombre_archivo: row.nombre_archivo, cargado_en: row.cargado_en, tareas: row.plantillas_csv_tareas?.[0]?.count ?? 0 };
    }
    setTemplates(next);
  }

  function parseCsv(config: CsvTemplateConfig, file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''),
      complete: (result) => {
        const headers = (result.meta.fields ?? []).map((header) => header.trim());
        const expected = config.tipo === 'soporte'
          ? SUPPORT_HEADERS
          : config.key === 'language'
            ? IMPLEMENTATION_HEADERS.filter((header) => header !== 'horas_observadas')
            : IMPLEMENTATION_HEADERS;
        const missing = expected.filter((header) => !headers.includes(header));
        const errors = result.errors.map((error) => `Fila ${error.row ?? '?'}: ${error.message}`);
        const detectedType = headers.includes('producto') ? 'implementacion' : headers.includes('frecuencia_historica') ? 'soporte' : null;
        if (detectedType !== config.tipo) errors.unshift('El encabezado no corresponde a esta plantilla.');
        if (config.key === 'language' && !headers.includes('horas_observadas') && !headers.includes('observacion')) {
          errors.unshift('Falta la columna "horas_observadas" o "observacion".');
        }
        if (missing.length > 0) errors.unshift(`Faltan columnas obligatorias: ${missing.join(', ')}`);
        if (headers.length === 0) errors.unshift('El archivo está vacío o no tiene encabezado.');

        let ignored = 0;
        const tasks: CsvTask[] = [];
        result.data.forEach((row, index) => {
          const tipoRegistro = (row.tipo_registro ?? '').trim();
          const tarea = row.tarea ?? '';
          if (tipoRegistro.toUpperCase() === 'INFO' || tarea.trim() === '') {
            ignored += 1;
            return;
          }
          const rawOrder = (row.orden ?? '').trim();
          const order = rawOrder === '' ? index + 1 : Number(rawOrder);
          if (!Number.isInteger(order)) {
            errors.push(`Fila ${index + 2}: "orden" debe ser un entero.`);
            return;
          }
          const frequency = (row.frecuencia_historica ?? '').trim();
          const parsedFrequency = frequency === '' ? null : Number(frequency);
          if (parsedFrequency !== null && !Number.isInteger(parsedFrequency)) {
            errors.push(`Fila ${index + 2}: "frecuencia_historica" debe ser un entero.`);
            return;
          }
          tasks.push({
            orden: order,
            tarea,
            tipo_registro: row.tipo_registro ?? '',
            proceso_sugerido: row.proceso_sugerido ?? '',
            proyectos_fuente: row.proyectos_fuente ?? '',
            horas_observadas: row.horas_observadas ?? '',
            frecuencia_historica: parsedFrequency,
          });
        });
        setPreviews((current) => ({ ...current, [config.key]: { fileName: file.name, tasks, ignored, errors } }));
      },
      error: (error) => setPreviews((current) => ({ ...current, [config.key]: { fileName: file.name, tasks: [], ignored: 0, errors: [error.message] } })),
    });
  }

  async function saveTemplate(config: CsvTemplateConfig) {
    const preview = previews[config.key];
    if (!preview || preview.errors.length > 0) return;
    setSaving(config.key);
    const { error } = await supabase.rpc('guardar_plantilla_csv', {
      p_tipo: config.tipo,
      p_producto: config.producto,
      p_nombre_archivo: preview.fileName,
      p_tareas: preview.tasks,
    });
    if (!error) {
      setPreviews((current) => ({ ...current, [config.key]: undefined }));
      await loadTemplates();
    } else {
      setPreviews((current) => ({ ...current, [config.key]: { ...preview, errors: [error.message] } }));
    }
    setSaving(null);
  }

  if (!isPMO) {
    return <p className="text-sm text-[var(--text-secondary)]">Las plantillas CSV solo pueden ser administradas por la PMO.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Plantillas CSV</h3>
        <p className="text-sm text-[var(--text-secondary)]">Carga una plantilla por línea de producto. Una nueva carga reemplaza la anterior.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CSV_TEMPLATES.map((config) => {
          const current = templates[config.key];
          const preview = previews[config.key];
          return (
            <div key={config.key} className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-[var(--text-primary)]">{config.label}</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {current ? `${current.tareas} tareas · última carga ${new Date(current.cargado_en).toLocaleDateString('es-MX')}` : 'Sin plantilla cargada'}
                  </p>
                </div>
                <FileSpreadsheet className="w-5 h-5 text-caribbean-green shrink-0" />
              </div>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) parseCsv(config, file);
                  event.currentTarget.value = '';
                }}
                className="block w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
              />
              {preview && (
                <div className="rounded-lg bg-[var(--bg-base)] p-3 text-sm space-y-2">
                  <p className="font-medium text-[var(--text-primary)]">{preview.fileName}</p>
                  <p className="text-[var(--text-secondary)]">{preview.tasks.length} tareas válidas · {preview.ignored} filas ignoradas</p>
                  {preview.tasks.length === 0 && preview.errors.length === 0 && <p className="text-info">Esta plantilla no tiene tareas predefinidas; el proyecto se creará sin tareas iniciales.</p>}
                  {preview.errors.map((message) => <p key={message} className="text-danger">{message}</p>)}
                  <button
                    onClick={() => saveTemplate(config)}
                    disabled={saving === config.key || preview.errors.length > 0}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    {saving === config.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {current ? 'Reemplazar CSV' : 'Confirmar carga'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImportTab() {
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ creados: number; actualizados: number; omitidos: number } | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [proyectosExistentes, setProyectosExistentes] = useState<{ nombre: string }[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | RowStatus>('all');
  const [messageFilter, setMessageFilter] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState<50 | 100 | 'all'>(50);
  const [page, setPage] = useState(1);
  const [attendeeResolutions, setAttendeeResolutions] = useState<Record<string, Record<string, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('usuarios').select('*').then(({ data }) => setUsuarios((data as Usuario[]) ?? []));
    supabase.from('proyectos').select('nombre').then(({ data }) => setProyectosExistentes((data as { nombre: string }[]) ?? []));
  }, []);

  type SheetDefinition = {
    label: string;
    nameFragment: string;
    primaryColumn: string;
    headers: Record<string, string>;
    maxColumn?: number;
  };

  // The labels deliberately exclude the leading emoji: workbooks generated by
  // different Excel versions can use subtly different Unicode emoji sequences.
  const SHEETS: SheetDefinition[] = [
    {
      label: 'Base de datos del proyecto',
      nameFragment: 'Base de datos del proyecto',
      primaryColumn: 'nombre',
      headers: {
        nombre: 'Nombre del proyecto', categoria: 'Categoria', estado: 'Estado', prioridad: 'Prioridad',
        linea_producto: 'Etiquetas personalizadas', fecha_inicio: 'Fecha de inicio', fecha_limite: 'Fecha límite',
        fecha_finalizacion: 'Fecha de finalización', asignado_a: 'Asignado a', colaboradores: 'Colaboradores',
        valor_estimado: 'Valor estimado', responsable: 'Responsable', a_cargo: 'A cargo',
        consultado: 'Consultado', informado: 'Informado',
      },
    },
    {
      label: 'Lista de Tareas',
      nameFragment: 'Lista de Tareas',
      primaryColumn: 'nombre_tarea',
      // Columns B–L only. O onward is Excel's filtered-view panel, not source data.
      maxColumn: 11,
      headers: {
        proyecto_nombre: 'Nombre del proyecto', nombre_tarea: 'Nombre de la tarea',
        tiempo_horas: 'Tiempo en horas', fecha_inicio: 'Fecha inicio', hecho: 'Hecho',
        fecha_finalizacion: 'Fecha de finalización', estado: 'Estado de la tarea',
        prioridad: 'Prioridad de tareas', propietario: 'Propietario de la tarea', notas: 'Notas de la tarea',
      },
    },
    {
      label: 'Lista de Equipo',
      nameFragment: 'Lista de Equipo',
      primaryColumn: 'nombre',
      headers: {
        nombre: 'Lista de miembros del equipo', rol: 'Rol',
        recuento_proyectos: 'Recuento de proyectos', conteo_tareas: 'Conteo de tareas',
      },
    },
    // These two tabs retain the existing import contract. Their headers are
    // also resolved by text and their row is detected instead of assumed.
    {
      label: 'Registro de reuniones',
      nameFragment: 'Registro de reuniones',
      primaryColumn: 'nombre',
      headers: {
        proyecto_nombre: 'Nombre del proyecto', fecha: 'Fecha de la reunión', nombre: 'Nombre de la reunión',
        tipo: 'Tipo de reunión', estado: 'Estado de la reunión', asistentes: 'Asistentes a la reunión',
        notas: 'Notas de la reunión',
      },
    },
    {
      label: 'Registro de comunicaciones',
      nameFragment: 'Registro de comunicaciones',
      primaryColumn: 'proyecto_nombre',
      headers: {
        proyecto_nombre: 'Nombre del proyecto', fecha: 'Fecha de comunicación',
        tipo: 'Tipo de comunicación', resultado: 'Resultado', notas: 'Notas de comunicación',
      },
    },
  ];

  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
  // All relationships use this one normalizer. It intentionally only removes
  // surrounding whitespace and normalizes case; it never guesses a name.
  const normalizeRelation = (value: string) => value.trim().toLocaleLowerCase();
  const normalizeMeetingType = (value: string | undefined) => {
    const normalized = normalize(value ?? '');
    if (normalized.includes('persona')) return 'presencial';
    if (normalized.includes('virtual')) return 'virtual';
    if (normalized.includes('convocatoria')) return 'convocatoria';
    return normalized || 'presencial';
  };
  const normalizeCommunicationType = (value: string | undefined) => {
    const normalized = normalize(value ?? '');
    if (normalized === 'email' || normalized === 'e-mail' || normalized === 'correo') return 'correo';
    if (normalized === 'texto' || normalized === 'mensaje') return 'mensaje';
    if (normalized === 'llamada') return 'llamada';
    return normalized || 'otro';
  };
  const sanitizeNumeric = (value: string | undefined) => {
    const cleaned = (value ?? '').replace(/[^0-9,.-]/g, '');
    if (!/[0-9]/.test(cleaned)) return null;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const separator = lastComma > lastDot ? ',' : '.';
    const separatorCount = [...cleaned].filter((character) => character === separator).length;
    const decimals = separatorCount === 1 ? cleaned.length - cleaned.lastIndexOf(separator) - 1 : 0;
    let normalized = cleaned;
    if (lastComma >= 0 && lastDot >= 0) {
      normalized = separator === ',' ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
    } else if (separatorCount === 1 && decimals > 0 && decimals <= 2) {
      normalized = cleaned.replace(separator, '.');
    } else {
      normalized = cleaned.replace(/[,.]/g, '');
    }
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  };

  const headerText = (value: unknown) => String(value ?? '').trim();

  function findHeaderRow(sheet: XLSX.WorkSheet, expectedHeaders: string[], maxColumn?: number): number {
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
    const lastColumn = Math.min(range.e.c, maxColumn ?? range.e.c);
    let bestRow = -1;
    let bestMatches = 0;
    for (let r = range.s.r; r <= Math.min(range.e.r, 29); r++) {
      const found = new Set<string>();
      for (let c = range.s.c; c <= lastColumn; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const text = headerText(cell?.v);
        if (expectedHeaders.includes(text)) found.add(text);
      }
      if (found.size > bestMatches) {
        bestRow = r;
        bestMatches = found.size;
      }
    }
    return bestMatches > 0 ? bestRow : -1;
  }

  function mapColumns(sheet: XLSX.WorkSheet, headerRow: number, definition: SheetDefinition): Record<string, number> {
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
    const lastColumn = Math.min(range.e.c, definition.maxColumn ?? range.e.c);
    const columns: Record<string, number> = {};
    for (const [field, expectedHeader] of Object.entries(definition.headers)) {
      for (let c = range.s.c; c <= lastColumn; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
        if (cell && headerText(cell.v) === expectedHeader) {
          columns[field] = c;
          break;
        }
      }
    }
    return columns;
  }

  function valueAt(sheet: XLSX.WorkSheet, row: number, column: number, field: string): string {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
    if (!cell || cell.v === null || cell.v === undefined) return '';
    if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
    if (cell.t === 'n' && ['fecha_inicio', 'fecha_limite', 'fecha_finalizacion'].includes(field)) {
      const date = XLSX.SSF.parse_date_code(cell.v);
      if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    return String(cell.v).trim();
  }

  function handleFile(file: File) {
    setAttendeeResolutions({});
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const allRows: ImportRow[] = [];
        const foundSheets = new Set<string>();

        for (const definition of SHEETS) {
          const sheetName = wb.SheetNames.find((name) => normalize(name).includes(normalize(definition.nameFragment)));
          if (!sheetName) {
            allRows.push({ id: `missing-sheet:${definition.label}`, hoja: definition.label, data: {}, status: 'error', message: 'No se encontró la hoja requerida' });
            continue;
          }
          foundSheets.add(definition.label);
          const sheet = wb.Sheets[sheetName];
          const headerRow = findHeaderRow(sheet, Object.values(definition.headers), definition.maxColumn);
          if (headerRow === -1) {
            allRows.push({ id: `missing-header-row:${sheetName}`, hoja: sheetName, data: {}, status: 'error', message: 'No se encontró ninguna fila de encabezados esperada en las primeras 30 filas' });
            continue;
          }
          const columns = mapColumns(sheet, headerRow, definition);
          const missingHeaders = Object.entries(definition.headers)
            .filter(([field]) => columns[field] === undefined)
            .map(([, header]) => `No se encontró la columna «${header}» en la hoja «${sheetName}»`);
          if (missingHeaders.length) {
            allRows.push({ id: `missing-columns:${sheetName}`, hoja: sheetName, data: {}, status: 'error', message: missingHeaders.join(' · ') });
            continue;
          }
          const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
          for (let r = headerRow + 1; r <= range.e.r; r++) {
            const rowData = Object.fromEntries(Object.entries(columns).map(([field, column]) => [field, valueAt(sheet, r, column, field)]));
            if (!rowData[definition.primaryColumn]) break;
            allRows.push({ id: `${definition.label}:${r + 1}`, hoja: definition.label, data: rowData, status: 'ok', message: `Fila ${r + 1}: lista para importar` });
          }
        }

        // The workbook's team tab has no email column. Its names still form
        // the authoritative list for validating owners before import.
        const sameName = (left: string, right: string) => normalizeRelation(left) === normalizeRelation(right);
        const teamMembers = allRows.filter((row) => row.hoja === 'Lista de Equipo')
          .map((row) => ({ nombre: row.data.nombre, email: row.data.email }))
          // A member already registered in the app is the same person, not an
          // ambiguous second match merely because the workbook lists them too.
          .filter((member) => !usuarios.some((user) => sameName(user.nombre, member.nombre)));
        const people = [...usuarios, ...teamMembers];
        for (const row of allRows) {
          if (row.status === 'error') continue;
          const errors: string[] = [];
          const warnings: string[] = [];
          const exactMatches = (name: string) => people.filter((person) => normalizeRelation(person.nombre) === normalizeRelation(name));
          if (row.hoja === 'Base de datos del proyecto') {
            if (!row.data.nombre) errors.push('Falta nombre del proyecto');
            const raciLabels: Record<string, string> = {
              responsable: 'Responsable', a_cargo: 'A cargo', consultado: 'Consultado', informado: 'Informado',
            };
            for (const field of ['responsable', 'a_cargo', 'consultado', 'informado']) {
              if (row.data[field] && exactMatches(row.data[field]).length !== 1) {
                errors.push(`${raciLabels[field]} no resuelto exactamente: ${row.data[field]}`);
              }
            }
            for (const field of ['asignado_a', 'colaboradores']) {
              for (const person of (row.data[field] ?? '').split(/[,;]/).map((name) => name.trim()).filter(Boolean)) {
                if (exactMatches(person).length !== 1) errors.push(`${field === 'asignado_a' ? 'Asignado a' : 'Colaborador'} no resuelto exactamente: ${person}`);
              }
            }
          }
          if (row.hoja === 'Lista de Tareas') {
            if (!row.data.nombre_tarea) errors.push('Falta nombre de tarea');
            if (!row.data.proyecto_nombre) errors.push('Falta nombre del proyecto');
            const projectNames = allRows
              .filter((candidate) => candidate.hoja === 'Base de datos del proyecto')
              .map((candidate) => candidate.data.nombre)
              .concat(proyectosExistentes.map((project) => project.nombre));
            if (row.data.proyecto_nombre && !projectNames.some((name) => normalizeRelation(name) === normalizeRelation(row.data.proyecto_nombre))) {
              errors.push(`Proyecto no encontrado: ${row.data.proyecto_nombre.trim()}`);
            }
            if (row.data.propietario && exactMatches(row.data.propietario).length !== 1) {
              errors.push(`Propietario no resuelto exactamente: ${row.data.propietario}`);
            }
          }
          if (row.hoja === 'Registro de reuniones' && row.data.asistentes) {
            for (const attendee of row.data.asistentes.split(',').map((name) => name.trim()).filter(Boolean)) {
              if (exactMatches(attendee).length !== 1) errors.push(`Asistente no resuelto exactamente: ${attendee}`);
            }
          }
          if (errors.length) { row.status = 'error'; row.message = errors.join(' · '); }
          else if (warnings.length) { row.status = 'warning'; row.message = warnings.join(' · '); }
        }

        if (!foundSheets.size) allRows.push({ id: 'unrecognized-file', hoja: 'Archivo', data: {}, status: 'error', message: 'No se reconoció ninguna hoja importable' });
        setRows(allRows);
        setPreviewFilter(allRows.some((row) => row.status === 'error') ? 'error' : 'all');
        setMessageFilter(null);
        setPage(1);
        setFileName(file.name);
        setStep('preview');
      } catch (error) {
        setRows([{ id: 'read-error', hoja: 'Archivo', data: {}, status: 'error', message: `No se pudo leer el Excel: ${error instanceof Error ? error.message : 'error desconocido'}` }]);
        setFileName(file.name);
        setStep('preview');
      }
    };
    reader.onerror = () => {
      setRows([{ id: 'file-read-error', hoja: 'Archivo', data: {}, status: 'error', message: 'No se pudo leer el archivo seleccionado' }]);
      setFileName(file.name);
      setStep('preview');
    };
    reader.readAsArrayBuffer(file);
  }

  const hasErrors = rows.some((r) => r.status === 'error');
  const projectOptions = useMemo(() => [...new Set(
    rows.filter((row) => row.hoja === 'Base de datos del proyecto').map((row) => row.data.nombre)
      .concat(proyectosExistentes.map((project) => project.nombre)).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b)), [rows, proyectosExistentes]);
  const attendeeOptions = usuarios;
  const attendeePeople = [
    ...usuarios.map((user) => user.nombre),
    ...rows.filter((row) => row.hoja === 'Lista de Equipo').map((row) => row.data.nombre)
      .filter((name) => !usuarios.some((user) => normalizeRelation(user.nombre) === normalizeRelation(name))),
  ];
  const exactAttendeeMatch = (name: string) => attendeePeople.filter((person) => normalizeRelation(person) === normalizeRelation(name)).length === 1;
  const unresolvedAttendees = (row: ImportRow) => {
    if (row.hoja !== 'Registro de reuniones') return [];
    const resolutions = attendeeResolutions[row.id] ?? {};
    return (row.data.asistentes ?? '').split(',').map((name) => name.trim()).filter(Boolean)
      .filter((name) => !exactAttendeeMatch(name) && !resolutions[name]);
  };
  const errorGroups = useMemo(() => {
    const groups = new Map<string, number>();
    rows.filter((row) => row.status === 'error').forEach((row) => {
      const group = row.message.split(':')[0].trim();
      groups.set(group, (groups.get(group) ?? 0) + 1);
    });
    return [...groups.entries()].map(([message, count]) => ({ message, count }));
  }, [rows]);
  const filteredRows = useMemo(() => rows.filter((row) =>
    (previewFilter === 'all' || row.status === previewFilter)
    && (!messageFilter || row.message.startsWith(messageFilter)),
  ), [rows, previewFilter, messageFilter]);
  const totalPages = rowsPerPage === 'all' ? 1 : Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const visibleRows = rowsPerPage === 'all'
    ? filteredRows
    : filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  function resolveProject(rowId: string, selectedProject: string) {
    setRows((currentRows) => currentRows.map((row) => {
      if (row.id !== rowId) return row;
      const createNew = selectedProject === '__create_new__';
      const projectName = createNew ? row.data.proyecto_nombre.trim() : selectedProject;
      const remainingMessages = row.message.split(' · ').filter((message) => !message.startsWith('Proyecto no encontrado:'));
      return {
        ...row,
        data: { ...row.data, proyecto_nombre: projectName, crear_proyecto: createNew ? 'true' : '' },
        status: remainingMessages.length ? 'error' : 'ok',
        message: remainingMessages.length ? remainingMessages.join(' · ') : `Proyecto resuelto manualmente: ${projectName}`,
      };
    }));
    setPage(1);
  }

  function resolveAttendee(rowId: string, attendee: string, resolution: string) {
    setAttendeeResolutions((current) => ({
      ...current,
      [rowId]: { ...current[rowId], [attendee]: resolution },
    }));
    setRows((currentRows) => currentRows.map((row) => {
      if (row.id !== rowId) return row;
      const resolutions = { ...(attendeeResolutions[rowId] ?? {}), [attendee]: resolution };
      const unresolved = (row.data.asistentes ?? '').split(',').map((name) => name.trim()).filter(Boolean)
        .filter((name) => !exactAttendeeMatch(name) && !resolutions[name]);
      const remainingMessages = row.message.split(' · ').filter((message) => !message.startsWith('Asistente no resuelto exactamente:'));
      if (unresolved.length) remainingMessages.push(...unresolved.map((name) => `Asistente no resuelto exactamente: ${name}`));
      return {
        ...row,
        status: remainingMessages.length ? 'error' : 'ok',
        message: remainingMessages.length ? remainingMessages.join(' · ') : 'Asistentes resueltos manualmente',
      };
    }));
    setPage(1);
  }

  async function confirmImport() {
    setImporting(true);
    const payload: Record<string, unknown[]> = { usuarios: [], proyectos: [], tareas: [], reuniones: [], comunicaciones: [] };
    const userDirectory = [
      ...usuarios,
      ...rows
        .filter((row) => row.hoja === 'Lista de Equipo')
        .map((row) => ({ nombre: row.data.nombre, email: row.data.email })),
    ];
    const importedProjectNames = new Set(proyectosExistentes.map((project) => normalizeRelation(project.nombre)));
    const ensureProject = (projectName: string) => {
      const normalizedName = normalizeRelation(projectName);
      if (!projectName || importedProjectNames.has(normalizedName)) return;
      payload.proyectos.push({
        nombre: projectName.trim(), descripcion: '', categoria: 'implementacion', estado: 'no_iniciado',
        prioridad: 'media', linea_producto: '', fecha_inicio: '', fecha_limite: '', valor_estimado: null,
        cliente: '', responsable_email: '',
      });
      importedProjectNames.add(normalizedName);
    };

    rows.forEach((r) => {
      if (r.status === 'error') return;
      if (r.hoja === 'Lista de Equipo' && r.data.email) {
        let rol = r.data.rol?.toLowerCase().replace(/\s+/g, '_') as RolUsuario;
        if (!ROLES.find((x) => x.value === rol)) rol = 'consultor_junior';
        payload.usuarios.push({
          nombre: r.data.nombre,
          email: r.data.email,
          rol,
          tarifa_hora: sanitizeNumeric(r.data.tarifa) ?? 0,
        });
      } else if (r.hoja === 'Base de datos del proyecto' && r.data.nombre) {
        let cat: string = r.data.categoria?.toLowerCase() ?? 'implementacion';
        if (cat.includes('implem')) cat = 'implementacion';
        else if (cat.includes('soport')) cat = 'soporte';
        else cat = 'implementacion';
        let estado = r.data.estado?.toLowerCase().replace(/\s+/g, '_') ?? 'no_iniciado';
        if (!['no_iniciado', 'en_progreso', 'en_espera', 'completado', 'cancelado'].includes(estado)) estado = 'no_iniciado';
        let prio = r.data.prioridad?.toLowerCase() ?? 'media';
        if (!['baja', 'media', 'alta', 'urgente'].includes(prio)) prio = 'media';
        const responsableEmail = userDirectory.find((u) => normalizeRelation(u.nombre) === normalizeRelation(r.data.responsable ?? ''))?.email;
        payload.proyectos.push({
          nombre: r.data.nombre,
          descripcion: '',
          categoria: cat,
          estado,
          prioridad: prio,
          linea_producto: r.data.linea_producto ?? '',
          fecha_inicio: r.data.fecha_inicio ?? '',
          fecha_limite: r.data.fecha_limite ?? '',
          valor_estimado: sanitizeNumeric(r.data.valor_estimado),
          cliente: '',
          responsable_email: responsableEmail ?? '',
        });
        importedProjectNames.add(normalizeRelation(r.data.nombre));
      } else if (r.hoja === 'Lista de Tareas' && r.data.nombre_tarea) {
        if (r.data.crear_proyecto === 'true') ensureProject(r.data.proyecto_nombre);
        const asignados = r.data.propietario ? [r.data.propietario] : [];
        const asignadosEmails = asignados.map((nombre) => userDirectory.find((u) => normalizeRelation(u.nombre) === normalizeRelation(nombre))?.email).filter(Boolean);
        payload.tareas.push({
          proyecto_nombre: r.data.proyecto_nombre,
          proyecto_cliente: '',
          nombre: r.data.nombre_tarea,
          descripcion: r.data.notas ?? '',
          estado: r.data.hecho?.toLowerCase() === 'sí' || r.data.hecho?.toLowerCase() === 'si' || r.data.hecho?.toLowerCase() === 'true' || r.data.estado?.toLowerCase().includes('complet') ? 'hecho' : r.data.estado?.toLowerCase().includes('progreso') ? 'en_progreso' : 'no_iniciado',
          prioridad: r.data.prioridad?.toLowerCase() === 'alta' ? 'alta' : r.data.prioridad?.toLowerCase() === 'urgente' ? 'urgente' : 'media',
          fecha_inicio: r.data.fecha_inicio ?? '',
          fecha_limite: r.data.fecha_finalizacion ?? '',
          tiempo_estimado_horas: sanitizeNumeric(r.data.tiempo_horas),
          asignados_emails: asignadosEmails,
        });
      } else if (r.hoja === 'Registro de reuniones' && r.data.nombre) {
        ensureProject(r.data.proyecto_nombre);
        const asistentes = r.data.asistentes ? r.data.asistentes.split(',').map((s) => s.trim()).filter(Boolean) : [];
        const asistentesEmails = asistentes.map((nombre) => {
          const resolution = attendeeResolutions[r.id]?.[nombre];
          if (resolution === '__ignore__') return undefined;
          const resolvedName = resolution || nombre;
          return userDirectory.find((u) => normalizeRelation(u.nombre) === normalizeRelation(resolvedName))?.email;
        }).filter(Boolean);
        payload.reuniones.push({
          proyecto_nombre: r.data.proyecto_nombre,
          proyecto_cliente: '',
          nombre: r.data.nombre,
          tipo: normalizeMeetingType(r.data.tipo),
          estado: r.data.estado?.toLowerCase() ?? 'programada',
          fecha: r.data.fecha ?? '',
          hora: '',
          notas: r.data.notas ?? '',
          asistentes_emails: asistentesEmails,
        });
      } else if (r.hoja === 'Registro de comunicaciones' && r.data.proyecto_nombre) {
        ensureProject(r.data.proyecto_nombre);
        payload.comunicaciones.push({
          proyecto_nombre: r.data.proyecto_nombre,
          proyecto_cliente: '',
          tipo: normalizeCommunicationType(r.data.tipo),
          fecha: r.data.fecha ?? '',
          resultado: r.data.resultado ?? '',
          notas: r.data.notas ?? '',
          usuario_email: '',
        });
      }
    });

    const importPayload: Record<string, unknown> = { ...payload, nombre_archivo: fileName };
    console.info('[Pulsesoft] Payload de importación', {
      archivo: fileName,
      usuarios: payload.usuarios.length,
      proyectos: payload.proyectos.length,
      tareas: payload.tareas.length,
      reuniones: payload.reuniones.length,
      comunicaciones: payload.comunicaciones.length,
    });
    const { data, error } = await supabase.rpc('importar_datos', { payload: importPayload });

    setImporting(false);
    if (error) {
      alert('Error al importar: ' + error.message);
      return;
    }
    setResult(data as { creados: number; actualizados: number; omitidos: number });
    setStep('done');
  }

  if (step === 'done' && result) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-success/15 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-success" />
        </div>
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Importación completada</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">{fileName}</p>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 rounded-xl bg-[var(--bg-base)]">
            <p className="text-2xl font-bold text-success">{result.creados}</p>
            <p className="text-xs text-[var(--text-secondary)]">Creadas</p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-base)]">
            <p className="text-2xl font-bold text-info">{result.actualizados}</p>
            <p className="text-xs text-[var(--text-secondary)]">Actualizadas</p>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-base)]">
            <p className="text-2xl font-bold text-danger">{result.omitidos}</p>
            <p className="text-xs text-[var(--text-secondary)]">Omitidas</p>
          </div>
        </div>
        <button onClick={() => { setStep('upload'); setRows([]); setResult(null); }} className="btn-primary text-sm">
          Importar otro archivo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step === 'upload' && (
        <div className="card p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-caribbean-green/10 flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet className="w-8 h-8 text-caribbean-green" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">Cargar datos desde Excel</h3>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-lg mx-auto">
              Sube el archivo .xlsx que usaban antes. El sistema lo lee en el navegador, valida cada fila
              y lo importa todo en una sola transacción. No se sube el archivo a ningún servidor.
            </p>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[var(--border)] rounded-2xl p-12 text-center cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-all"
          >
            <FileUp className="w-10 h-10 text-[var(--text-secondary)] mx-auto mb-3" />
            <p className="text-sm font-medium text-[var(--text-primary)]">Haz clic para seleccionar un archivo</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Formato .xlsx · Hojas: Base de datos del proyecto, Lista de Tareas, Lista de Equipo, Registro de reuniones, Registro de comunicaciones</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Vista previa: {fileName}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{rows.length} filas detectadas</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => { setStep('upload'); setRows([]); }} className="btn-secondary text-sm">Cancelar</button>
              <button
                onClick={confirmImport}
                disabled={hasErrors || importing}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</> : <><Upload className="w-4 h-4" /> Confirmar importación</>}
              </button>
            </div>
          </div>

          {hasErrors && (
            <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">
              <XCircle className="w-4 h-4 shrink-0" />
              Hay filas con errores que requieren resolución. Corrígelas o elimínalas antes de continuar.
            </div>
          )}

          {errorGroups.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Errores agrupados</p>
              <div className="flex flex-wrap gap-2">
                {errorGroups.map((group) => (
                  <button
                    key={group.message}
                    onClick={() => { setPreviewFilter('error'); setMessageFilter(group.message); setPage(1); }}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${messageFilter === group.message ? 'border-danger bg-danger/10 text-danger' : 'border-[var(--border)] text-[var(--text-secondary)]'}`}
                  >
                    {group.message}: {group.count} fila{group.count === 1 ? '' : 's'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--text-secondary)]" htmlFor="import-filter">Mostrar</label>
                <select
                  id="import-filter"
                  value={previewFilter}
                  onChange={(e) => { setPreviewFilter(e.target.value as 'all' | RowStatus); setMessageFilter(null); setPage(1); }}
                  className="input-field !py-1.5 text-xs"
                >
                  <option value="error">❌ Con error</option>
                  <option value="warning">⚠️ Necesitan dato</option>
                  <option value="ok">✅ Listas</option>
                  <option value="all">Todas</option>
                </select>
                {messageFilter && <button onClick={() => { setMessageFilter(null); setPage(1); }} className="text-xs text-[var(--accent)]">Quitar agrupación</button>}
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{filteredRows.length} de {rows.length} filas</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2 pr-3">Estado</th>
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2 pr-3">Hoja</th>
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2 pr-3">Datos</th>
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2">Mensaje</th>
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2">Resolver</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3">
                      {r.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-success" />}
                      {r.status === 'warning' && <AlertTriangle className="w-4 h-4 text-warning" />}
                      {r.status === 'error' && <XCircle className="w-4 h-4 text-danger" />}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--text-secondary)]">{r.hoja}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--text-primary)] max-w-md truncate">
                      {Object.entries(r.data).filter(([, v]) => v).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </td>
                    <td className="py-2 text-xs text-[var(--text-secondary)]">{r.message}</td>
                    <td className="py-2 text-xs min-w-52">
                      {r.hoja === 'Lista de Tareas' && r.message.includes('Proyecto no encontrado:') && (
                        <select
                          defaultValue=""
                          onChange={(e) => { if (e.target.value) resolveProject(r.id, e.target.value); }}
                          className="input-field !py-1.5 text-xs w-full"
                          aria-label={`Resolver proyecto de ${r.data.nombre_tarea}`}
                        >
                          <option value="" disabled>Elegir proyecto…</option>
                          {projectOptions.map((project) => <option key={project} value={project}>{project}</option>)}
                          <option value="__create_new__">Crear como proyecto nuevo</option>
                        </select>
                      )}
                      {r.hoja === 'Registro de reuniones' && unresolvedAttendees(r).map((attendee) => (
                        <label key={attendee} className="block mb-2 last:mb-0">
                          <span className="block mb-1 text-[var(--text-secondary)]">Resolver «{attendee}»</span>
                          <select
                            value={attendeeResolutions[r.id]?.[attendee] ?? ''}
                            onChange={(e) => { if (e.target.value) resolveAttendee(r.id, attendee, e.target.value); }}
                            className="input-field !py-1.5 text-xs w-full"
                            aria-label={`Resolver asistente ${attendee} de ${r.data.nombre}`}
                          >
                            <option value="" disabled>Elegir resolución…</option>
                            <option value="__ignore__">Ignorar este asistente (recomendado)</option>
                            {attendeeOptions.map((user) => <option key={user.id} value={user.nombre}>Asignar a {user.nombre}</option>)}
                          </select>
                        </label>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-xs text-[var(--text-secondary)]">
              <label className="flex items-center gap-2">Filas por página
                <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value) as 50 | 100); setPage(1); }} className="input-field !py-1.5 text-xs">
                  <option value="50">50</option><option value="100">100</option><option value="all">Todas</option>
                </select>
              </label>
              {rowsPerPage !== 'all' && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="btn-secondary !py-1 !px-2 disabled:opacity-50">Anterior</button>
                  <span>Página {page} de {totalPages}</span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={page}
                    onChange={(e) => setPage(Math.min(totalPages, Math.max(1, Number(e.target.value) || 1)))}
                    aria-label="Ir a página"
                    className="input-field !py-1 !px-2 text-xs w-14"
                  />
                  <button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="btn-secondary !py-1 !px-2 disabled:opacity-50">Siguiente</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
