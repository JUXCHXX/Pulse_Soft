import { useEffect, useState } from 'react';
import { BarChart3, FileText, Download, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Badge, ProgressBar } from '@/components/Badge';
import { getRol } from '@/lib/constants';
import { formatCurrency, formatDate, formatHours } from '@/lib/format';
import type { VwProyectoResumen, VwCargaConsultor, Usuario, Importacion } from '@/lib/types';

export function Reportes() {
  const { usuario } = useAuth();
  const isPMO = usuario?.rol === 'pmo';
  const [proyectos, setProyectos] = useState<VwProyectoResumen[]>([]);
  const [carga, setCarga] = useState<VwCargaConsultor[]>([]);
  const [importaciones, setImportaciones] = useState<Importacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [resProy, resCarga, resImp] = await Promise.all([
      supabase.from('vw_proyecto_resumen').select('*').order('nombre'),
      supabase.from('vw_carga_consultor').select('*').order('nombre'),
      supabase.from('importaciones').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setProyectos((resProy.data as VwProyectoResumen[]) ?? []);
    setCarga((resCarga.data as VwCargaConsultor[]) ?? []);
    setImportaciones((resImp.data as Importacion[]) ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalEstimado = proyectos.reduce((s, p) => s + (p.valor_estimado ?? 0), 0);
  const totalReal = proyectos.reduce((s, p) => s + Number(p.costo_real_total), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Reportes</h2>
        <p className="text-sm text-[var(--text-secondary)]">Costos real vs. estimado y reportes semanales</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-sm text-[var(--text-secondary)]">Presupuesto total</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{formatCurrency(totalEstimado)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-[var(--text-secondary)]">Costo real total</p>
          <p className="text-2xl font-bold text-danger mt-1">{formatCurrency(totalReal)}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-[var(--text-secondary)]">Diferencia</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{formatCurrency(totalEstimado - totalReal)}</p>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Costo real vs. estimado por proyecto</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Proyecto</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Estimado</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Real</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Diferencia</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3">Progreso</th>
              </tr>
            </thead>
            <tbody>
              {proyectos.map((p) => {
                const diff = (p.valor_estimado ?? 0) - Number(p.costo_real_total);
                return (
                  <tr key={p.proyecto_id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-4 text-sm font-medium text-[var(--text-primary)]">{p.nombre}</td>
                    <td className="py-3 pr-4 text-right text-sm text-[var(--text-secondary)]">{formatCurrency(p.valor_estimado)}</td>
                    <td className="py-3 pr-4 text-right text-sm font-medium text-[var(--text-primary)]">{formatCurrency(p.costo_real_total)}</td>
                    <td className={`py-3 pr-4 text-sm ${diff < 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(diff)}</td>
                    <td className="py-3 pr-4 w-32">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={p.progreso_pct ?? 0} />
                        <span className="text-xs text-[var(--text-secondary)] w-10">{Math.round(p.progreso_pct ?? 0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {proyectos.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-[var(--text-secondary)]">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Carga por consultor</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Consultor</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Rol</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Tareas activas</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] pb-3 pr-4">Atrasadas</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] pb-3">Horas</th>
              </tr>
            </thead>
            <tbody>
              {carga.map((c) => (
                <tr key={c.usuario_id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.nombre} size="sm" />
                      <span className="text-sm font-medium text-[var(--text-primary)]">{c.nombre}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-sm text-[var(--text-secondary)]">{getRol(c.rol).label}</td>
                  <td className="py-3 pr-4 text-right text-sm text-[var(--text-primary)]">{c.tareas_asignadas_activas}</td>
                  <td className="py-3 pr-4 text-right text-sm">
                    {c.tareas_atrasadas > 0 ? <span className="text-danger">{c.tareas_atrasadas}</span> : <span className="text-[var(--text-secondary)]">0</span>}
                  </td>
                  <td className="py-3 text-right text-sm font-medium text-[var(--text-primary)]">{formatHours(c.horas_registradas_totales)}</td>
                </tr>
              ))}
              {carga.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-sm text-[var(--text-secondary)]">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isPMO && importaciones.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Historial de importaciones</h3>
          <div className="space-y-3">
            {importaciones.map((imp) => (
              <div key={imp.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-base)]">
                <div className="w-9 h-9 rounded-xl bg-caribbean-green/15 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-caribbean-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{imp.nombre_archivo}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{formatDate(imp.created_at)}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-success">{imp.filas_creadas} creadas</span>
                  <span className="text-info">{imp.filas_actualizadas} actualizadas</span>
                  {imp.filas_omitidas > 0 && <span className="text-danger">{imp.filas_omitidas} omitidas</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
