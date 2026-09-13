import { useState, useEffect, useRef } from 'react';
import {
  Settings,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileUp,
  Loader2,
  Plus,
  Trash2,
  Palette,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/Badge';
import { CATEGORIAS, getRol, ROLES } from '@/lib/constants';
import type { CategoriaProyecto, PlantillaTarea, Usuario, RolUsuario } from '@/lib/types';

type Step = 'upload' | 'preview' | 'done';
type RowStatus = 'ok' | 'warning' | 'error';

interface ImportRow {
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
  const [plantillas, setPlantillas] = useState<PlantillaTarea[]>([]);
  const [loadingPlantillas, setLoadingPlantillas] = useState(true);

  useEffect(() => {
    if (tab === 'plantillas') loadPlantillas();
  }, [tab]);

  async function loadPlantillas() {
    setLoadingPlantillas(true);
    const { data } = await supabase.from('plantillas_tareas').select('*').order('categoria, orden');
    setPlantillas((data as PlantillaTarea[]) ?? []);
    setLoadingPlantillas(false);
  }

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
        <PlantillasTab plantillas={plantillas} loading={loadingPlantillas} isPMO={isPMO} onReload={loadPlantillas} />
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

function PlantillasTab({
  plantillas,
  loading,
  isPMO,
  onReload,
}: {
  plantillas: PlantillaTarea[];
  loading: boolean;
  isPMO: boolean;
  onReload: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [newTarea, setNewTarea] = useState({ nombre: '', descripcion: '', categoria: 'implementacion' as CategoriaProyecto, orden: 0 });

  async function addPlantilla() {
    if (!newTarea.nombre) return;
    await supabase.from('plantillas_tareas').insert({
      nombre_tarea: newTarea.nombre,
      descripcion: newTarea.descripcion || null,
      categoria: newTarea.categoria,
      orden: newTarea.orden,
    });
    setNewTarea({ nombre: '', descripcion: '', categoria: 'implementacion', orden: 0 });
    setShowNew(false);
    onReload();
  }

  async function deletePlantilla(id: string) {
    await supabase.from('plantillas_tareas').delete().eq('id', id);
    onReload();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Plantillas por categoría</h3>
        {isPMO && (
          <button onClick={() => setShowNew(!showNew)} className="btn-primary text-xs flex items-center gap-1 !py-2">
            <Plus className="w-3.5 h-3.5" /> Nueva
          </button>
        )}
      </div>

      {showNew && isPMO && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 p-4 rounded-xl bg-[var(--bg-base)]">
          <input placeholder="Nombre tarea" value={newTarea.nombre} onChange={(e) => setNewTarea({ ...newTarea, nombre: e.target.value })} className="input-field text-sm" />
          <input placeholder="Descripción" value={newTarea.descripcion} onChange={(e) => setNewTarea({ ...newTarea, descripcion: e.target.value })} className="input-field text-sm" />
          <select value={newTarea.categoria} onChange={(e) => setNewTarea({ ...newTarea, categoria: e.target.value as CategoriaProyecto })} className="input-field text-sm">
            {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <button onClick={addPlantilla} className="btn-primary text-sm">Agregar</button>
        </div>
      )}

      <div className="space-y-4">
        {CATEGORIAS.map((cat) => (
          <div key={cat.value}>
            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">{cat.label}</h4>
            <div className="space-y-1">
              {plantillas.filter((p) => p.categoria === cat.value).map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--bg-base)]">
                  <span className="text-xs text-[var(--text-secondary)] w-6">{p.orden}</span>
                  <span className="text-sm text-[var(--text-primary)] flex-1">{p.nombre_tarea}</span>
                  {p.descripcion && <span className="text-xs text-[var(--text-secondary)] truncate hidden sm:inline">{p.descripcion}</span>}
                  {isPMO && (
                    <button onClick={() => deletePlantilla(p.id)} className="text-[var(--text-secondary)] hover:text-danger transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {plantillas.filter((p) => p.categoria === cat.value).length === 0 && (
                <p className="text-xs text-[var(--text-secondary)] py-2">Sin plantillas</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportTab() {
  const { usuario } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ creados: number; actualizados: number; omitidos: number } | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('usuarios').select('*').then(({ data }) => setUsuarios((data as Usuario[]) ?? []));
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
            allRows.push({ hoja: definition.label, data: {}, status: 'error', message: 'No se encontró la hoja requerida' });
            continue;
          }
          foundSheets.add(definition.label);
          const sheet = wb.Sheets[sheetName];
          const headerRow = findHeaderRow(sheet, Object.values(definition.headers), definition.maxColumn);
          if (headerRow === -1) {
            allRows.push({ hoja: sheetName, data: {}, status: 'error', message: 'No se encontró ninguna fila de encabezados esperada en las primeras 30 filas' });
            continue;
          }
          const columns = mapColumns(sheet, headerRow, definition);
          const missingHeaders = Object.entries(definition.headers)
            .filter(([field]) => columns[field] === undefined)
            .map(([, header]) => `No se encontró la columna «${header}» en la hoja «${sheetName}»`);
          if (missingHeaders.length) {
            allRows.push({ hoja: sheetName, data: {}, status: 'error', message: missingHeaders.join(' · ') });
            continue;
          }
          const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
          for (let r = headerRow + 1; r <= range.e.r; r++) {
            const rowData = Object.fromEntries(Object.entries(columns).map(([field, column]) => [field, valueAt(sheet, r, column, field)]));
            if (!rowData[definition.primaryColumn]) break;
            allRows.push({ hoja: definition.label, data: rowData, status: 'ok', message: `Fila ${r + 1}: lista para importar` });
          }
        }

        // The workbook's team tab has no email column. Its names still form
        // the authoritative list for validating owners before import.
        const sameName = (left: string, right: string) => left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
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
          const exactName = (name: string) => name.trim().toLocaleLowerCase();
          const exactMatches = (name: string) => people.filter((person) => exactName(person.nombre) === exactName(name));
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
          }
          if (row.hoja === 'Lista de Tareas') {
            if (!row.data.nombre_tarea) errors.push('Falta nombre de tarea');
            if (!row.data.proyecto_nombre) errors.push('Falta nombre del proyecto');
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

        if (!foundSheets.size) allRows.push({ hoja: 'Archivo', data: {}, status: 'error', message: 'No se reconoció ninguna hoja importable' });
        setRows(allRows);
        setFileName(file.name);
        setStep('preview');
      } catch (error) {
        setRows([{ hoja: 'Archivo', data: {}, status: 'error', message: `No se pudo leer el Excel: ${error instanceof Error ? error.message : 'error desconocido'}` }]);
        setFileName(file.name);
        setStep('preview');
      }
    };
    reader.onerror = () => {
      setRows([{ hoja: 'Archivo', data: {}, status: 'error', message: 'No se pudo leer el archivo seleccionado' }]);
      setFileName(file.name);
      setStep('preview');
    };
    reader.readAsArrayBuffer(file);
  }

  const isPMO = usuario?.rol === 'pmo';
  const hasErrors = rows.some((r) => r.status === 'error');

  async function confirmImport() {
    setImporting(true);
    const payload: Record<string, unknown[]> = { usuarios: [], proyectos: [], tareas: [], reuniones: [], comunicaciones: [] };
    const userDirectory = [
      ...usuarios,
      ...rows
        .filter((row) => row.hoja === 'Lista de Equipo')
        .map((row) => ({ nombre: row.data.nombre, email: row.data.email })),
    ];

    rows.forEach((r) => {
      if (r.status === 'error') return;
      if (r.hoja === 'Lista de Equipo' && r.data.email) {
        let rol = r.data.rol?.toLowerCase().replace(/\s+/g, '_') as RolUsuario;
        if (!ROLES.find((x) => x.value === rol)) rol = 'consultor_junior';
        payload.usuarios.push({
          nombre: r.data.nombre,
          email: r.data.email,
          rol,
          tarifa_hora: r.data.tarifa ? Number(r.data.tarifa) : 0,
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
        const responsableEmail = userDirectory.find((u) => normalize(u.nombre) === normalize(r.data.responsable ?? ''))?.email;
        payload.proyectos.push({
          nombre: r.data.nombre,
          descripcion: '',
          categoria: cat,
          estado,
          prioridad: prio,
          linea_producto: r.data.linea_producto ?? '',
          fecha_inicio: r.data.fecha_inicio ?? '',
          fecha_limite: r.data.fecha_limite ?? '',
          valor_estimado: r.data.valor_estimado ?? '',
          cliente: '',
          responsable_email: responsableEmail ?? '',
        });
      } else if (r.hoja === 'Lista de Tareas' && r.data.nombre_tarea) {
        const asignados = r.data.propietario ? [r.data.propietario] : [];
        const asignadosEmails = asignados.map((nombre) => userDirectory.find((u) => normalize(u.nombre) === normalize(nombre))?.email).filter(Boolean);
        payload.tareas.push({
          proyecto_nombre: r.data.proyecto_nombre,
          proyecto_cliente: '',
          nombre: r.data.nombre_tarea,
          descripcion: r.data.notas ?? '',
          estado: r.data.hecho?.toLowerCase() === 'sí' || r.data.hecho?.toLowerCase() === 'si' || r.data.hecho?.toLowerCase() === 'true' || r.data.estado?.toLowerCase().includes('complet') ? 'hecho' : r.data.estado?.toLowerCase().includes('progreso') ? 'en_progreso' : 'no_iniciado',
          prioridad: r.data.prioridad?.toLowerCase() === 'alta' ? 'alta' : r.data.prioridad?.toLowerCase() === 'urgente' ? 'urgente' : 'media',
          fecha_inicio: r.data.fecha_inicio ?? '',
          fecha_limite: r.data.fecha_finalizacion ?? '',
          tiempo_estimado_horas: r.data.tiempo_horas ?? '',
          asignados_emails: asignadosEmails,
        });
      } else if (r.hoja === 'Registro de reuniones' && r.data.nombre) {
        const asistentes = r.data.asistentes ? r.data.asistentes.split(',').map((s) => s.trim()).filter(Boolean) : [];
        const asistentesEmails = asistentes.map((nombre) => userDirectory.find((u) => normalize(u.nombre) === normalize(nombre))?.email).filter(Boolean);
        payload.reuniones.push({
          proyecto_nombre: r.data.proyecto_nombre,
          proyecto_cliente: '',
          nombre: r.data.nombre,
          tipo: r.data.tipo?.toLowerCase() ?? 'seguimiento',
          estado: r.data.estado?.toLowerCase() ?? 'programada',
          fecha: r.data.fecha ?? '',
          hora: '',
          notas: r.data.notas ?? '',
          asistentes_emails: asistentesEmails,
        });
      } else if (r.hoja === 'Registro de comunicaciones' && r.data.proyecto_nombre) {
        payload.comunicaciones.push({
          proyecto_nombre: r.data.proyecto_nombre,
          proyecto_cliente: '',
          tipo: r.data.tipo?.toLowerCase() ?? 'otro',
          fecha: r.data.fecha ?? '',
          resultado: r.data.resultado ?? '',
          notas: r.data.notas ?? '',
          usuario_email: '',
        });
      }
    });

    const { data, error } = await supabase.rpc('importar_datos', {
      payload: { ...payload, nombre_archivo: fileName },
    });

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

          <div className="card p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2 pr-3">Estado</th>
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2 pr-3">Hoja</th>
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2 pr-3">Datos</th>
                  <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-2">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
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
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <p className="text-xs text-[var(--text-secondary)] text-center mt-3">Mostrando 50 de {rows.length} filas</p>}
          </div>
        </div>
      )}
    </div>
  );
}
