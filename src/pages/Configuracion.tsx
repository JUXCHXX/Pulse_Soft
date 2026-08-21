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

  const SHEET_MAP: Record<string, string[]> = {
    'Base de datos del proyecto': ['Nombre', 'Categoría', 'Responsable', 'Estado', 'Prioridad', 'Fecha inicio', 'Fecha límite', 'Valor estimado', 'Cliente'],
    'Lista de Tareas': ['Tarea', 'Proyecto', 'Asignado', 'Estado', 'Prioridad', 'Fecha límite', 'Tiempo en horas'],
    'Lista de Equipo': ['Nombre', 'Email', 'Rol', 'Tarifa'],
    'Registro de reuniones': ['Reunión', 'Proyecto', 'Tipo', 'Fecha', 'Hora', 'Asistentes', 'Notas'],
    'Registro de comunicaciones': ['Proyecto', 'Tipo', 'Fecha', 'Resultado', 'Notas', 'Responsable'],
  };

  function findHeaderRow(sheet: XLSX.WorkSheet, expectedHeaders: string[]): number {
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:Z100');
    for (let r = range.s.r; r <= Math.min(range.e.r, 30); r++) {
      const cells: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v) cells.push(String(cell.v).trim().toLowerCase());
      }
      const matches = expectedHeaders.filter((h) => cells.includes(h.toLowerCase()));
      if (matches.length >= Math.ceil(expectedHeaders.length / 2)) return r;
    }
    return -1;
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const allRows: ImportRow[] = [];

      wb.SheetNames.forEach((sheetName) => {
        const expected = SHEET_MAP[sheetName];
        if (!expected) return;
        const sheet = wb.Sheets[sheetName];
        const headerRow = findHeaderRow(sheet, expected);
        if (headerRow === -1) return;

        const json = XLSX.utils.sheet_to_json(sheet, { range: headerRow, defval: '' }) as Record<string, unknown>[];
        json.forEach((rawRow) => {
          const rowData: Record<string, string> = {};
          Object.entries(rawRow).forEach(([k, v]) => { rowData[k] = String(v ?? '').trim(); });

          let status: RowStatus = 'ok';
          let message = 'Lista para importar';

          if (sheetName === 'Lista de Equipo') {
            if (!rowData['Email']) { status = 'error'; message = 'Falta email'; }
            else if (!rowData['Rol']) { status = 'warning'; message = 'Falta rol (default: consultor_junior)'; }
            else if (!rowData['Tarifa'] && isPMO) { status = 'warning'; message = 'Falta tarifa/hora'; }
          } else if (sheetName === 'Base de datos del proyecto') {
            if (!rowData['Nombre']) { status = 'error'; message = 'Falta nombre del proyecto'; }
            if (rowData['Categoría'] && !['implementacion', 'soporte', 'Implementación', 'Soporte'].includes(rowData['Categoría'])) {
              status = 'warning'; message = 'Categoría no reconocida';
            }
          } else if (sheetName === 'Lista de Tareas') {
            if (!rowData['Tarea']) { status = 'error'; message = 'Falta nombre de tarea'; }
            if (!rowData['Proyecto']) { status = 'error'; message = 'Falta proyecto'; }
          }

          allRows.push({ hoja: sheetName, data: rowData, status, message });
        });
      });

      setRows(allRows);
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

    rows.forEach((r) => {
      if (r.hoja === 'Lista de Equipo' && r.data['Email']) {
        let rol = r.data['Rol']?.toLowerCase().replace(/\s+/g, '_') as RolUsuario;
        if (!ROLES.find((x) => x.value === rol)) rol = 'consultor_junior';
        payload.usuarios.push({
          nombre: r.data['Nombre'],
          email: r.data['Email'],
          rol,
          tarifa_hora: r.data['Tarifa'] ? Number(r.data['Tarifa']) : 0,
        });
      } else if (r.hoja === 'Base de datos del proyecto' && r.data['Nombre']) {
        let cat: string = r.data['Categoría']?.toLowerCase() ?? 'implementacion';
        if (cat.includes('implem')) cat = 'implementacion';
        else if (cat.includes('soport')) cat = 'soporte';
        else cat = 'implementacion';
        let estado = r.data['Estado']?.toLowerCase() ?? 'no_iniciado';
        if (!['no_iniciado', 'en_progreso', 'en_espera', 'completado', 'cancelado'].includes(estado)) estado = 'no_iniciado';
        let prio = r.data['Prioridad']?.toLowerCase() ?? 'media';
        if (!['baja', 'media', 'alta', 'urgente'].includes(prio)) prio = 'media';
        const responsableEmail = usuarios.find((u) => u.nombre.toLowerCase() === r.data['Responsable']?.toLowerCase())?.email;
        payload.proyectos.push({
          nombre: r.data['Nombre'],
          descripcion: r.data['Descripción'] ?? '',
          categoria: cat,
          estado,
          prioridad: prio,
          fecha_inicio: r.data['Fecha inicio'] ?? '',
          fecha_limite: r.data['Fecha límite'] ?? '',
          valor_estimado: r.data['Valor estimado'] ?? '',
          cliente: r.data['Cliente'] ?? '',
          responsable_email: responsableEmail ?? '',
        });
      } else if (r.hoja === 'Lista de Tareas' && r.data['Tarea']) {
        const asignados = r.data['Asignado'] ? r.data['Asignado'].split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
        const asignadosEmails = asignados.map((nombre) => usuarios.find((u) => u.nombre.toLowerCase() === nombre.toLowerCase())?.email).filter(Boolean);
        payload.tareas.push({
          proyecto_nombre: r.data['Proyecto'],
          proyecto_cliente: '',
          nombre: r.data['Tarea'],
          descripcion: '',
          estado: r.data['Estado']?.toLowerCase().includes('complet') ? 'hecho' : r.data['Estado']?.toLowerCase().includes('progreso') ? 'en_progreso' : 'no_iniciado',
          prioridad: r.data['Prioridad']?.toLowerCase() === 'alta' ? 'alta' : r.data['Prioridad']?.toLowerCase() === 'urgente' ? 'urgente' : 'media',
          fecha_limite: r.data['Fecha límite'] ?? '',
          tiempo_estimado_horas: r.data['Tiempo en horas'] ?? '',
          asignados_emails: asignadosEmails,
        });
      } else if (r.hoja === 'Registro de reuniones' && r.data['Reunión']) {
        const asistentes = r.data['Asistentes'] ? r.data['Asistentes'].split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
        const asistentesEmails = asistentes.map((nombre) => usuarios.find((u) => u.nombre.toLowerCase() === nombre.toLowerCase())?.email).filter(Boolean);
        payload.reuniones.push({
          proyecto_nombre: r.data['Proyecto'],
          proyecto_cliente: '',
          nombre: r.data['Reunión'],
          tipo: r.data['Tipo']?.toLowerCase() ?? 'seguimiento',
          fecha: r.data['Fecha'] ?? '',
          hora: r.data['Hora'] ?? '',
          notas: r.data['Notas'] ?? '',
          asistentes_emails: asistentesEmails,
        });
      } else if (r.hoja === 'Registro de comunicaciones' && r.data['Proyecto']) {
        payload.comunicaciones.push({
          proyecto_nombre: r.data['Proyecto'],
          proyecto_cliente: '',
          tipo: r.data['Tipo']?.toLowerCase() ?? 'otro',
          fecha: r.data['Fecha'] ?? '',
          resultado: r.data['Resultado'] ?? '',
          notas: r.data['Notas'] ?? '',
          usuario_email: usuarios.find((u) => u.nombre.toLowerCase() === r.data['Responsable']?.toLowerCase())?.email ?? '',
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
