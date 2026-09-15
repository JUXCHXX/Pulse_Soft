export type RolUsuario =
  | 'pmo'
  | 'direccion'
  | 'project_manager'
  | 'consultor_senior'
  | 'consultor_junior'
  | 'desarrollo'
  | 'administrativo';

export type CategoriaProyecto = 'implementacion' | 'soporte';
export type EstadoProyecto =
  | 'no_iniciado'
  | 'en_progreso'
  | 'en_espera'
  | 'completado'
  | 'cancelado';
export type PrioridadNivel = 'baja' | 'media' | 'alta' | 'urgente';
export type EstadoTarea = 'no_iniciado' | 'en_progreso' | 'en_espera' | 'hecho';
export type TipoRaci = 'responsable' | 'aprueba' | 'consultado' | 'informado';
export type TipoReunion = string;
export type TipoComunicacion = string;

export interface Usuario {
  id: string;
  auth_id: string | null;
  nombre: string;
  email: string;
  rol: RolUsuario;
  tarifa_hora: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: CategoriaProyecto;
  linea_producto: string | null;
  estado: EstadoProyecto;
  prioridad: PrioridadNivel;
  fecha_inicio: string | null;
  fecha_limite: string | null;
  fecha_fin: string | null;
  valor_estimado: number | null;
  cliente: string | null;
  template_key?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tarea {
  id: string;
  proyecto_id: string;
  plantilla_origen_id: string | null;
  proceso_id?: string | null;
  nombre: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: PrioridadNivel;
  fecha_inicio: string | null;
  fecha_limite: string | null;
  fecha_finalizacion: string | null;
  tiempo_estimado_horas: number | null;
  orden?: number | null;
  duracion_ideal_dias?: number | null;
  rol_sugerido?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistroTiempo {
  id: string;
  tarea_id: string;
  usuario_id: string;
  inicio: string;
  fin: string | null;
  duracion_segundos: number | null;
  created_at: string;
}

export interface ProyectoRol {
  proyecto_id: string;
  usuario_id: string;
  tipo_raci: TipoRaci;
}

export interface PlantillaTarea {
  id: string;
  categoria: CategoriaProyecto;
  nombre_tarea: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
}

export interface Reunion {
  id: string;
  proyecto_id: string;
  nombre: string;
  tipo: TipoReunion;
  estado: string;
  fecha: string;
  hora: string | null;
  notas: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Comunicacion {
  id: string;
  proyecto_id: string;
  usuario_id: string | null;
  tipo: TipoComunicacion;
  fecha: string;
  resultado: string | null;
  notas: string | null;
  created_at: string;
}

export interface Importacion {
  id: string;
  realizado_por: string;
  nombre_archivo: string;
  filas_creadas: number;
  filas_actualizadas: number;
  filas_omitidas: number;
  detalle_errores: unknown;
  estado: string;
  created_at: string;
}

// View types
export interface VwProyectoResumen {
  proyecto_id: string;
  nombre: string;
  estado: EstadoProyecto;
  prioridad: PrioridadNivel;
  valor_estimado: number | null;
  total_tareas: number;
  tareas_completadas: number;
  tareas_atrasadas: number;
  progreso_pct: number | null;
  costo_real_total: number;
}

export interface VwCargaConsultor {
  usuario_id: string;
  nombre: string;
  rol: RolUsuario;
  tareas_asignadas_activas: number;
  tareas_atrasadas: number;
  horas_registradas_totales: number;
}

export interface VwCronometroActivo {
  registro_id: string;
  usuario_id: string;
  consultor: string;
  tarea_id: string;
  tarea: string;
  proyecto_id: string;
  proyecto: string;
  inicio: string;
  segundos_transcurridos: number;
}

export interface VwTareaCosto {
  tarea_id: string;
  proyecto_id: string;
  nombre: string;
  estado: EstadoTarea;
  tiempo_estimado_horas: number | null;
  horas_reales: number;
  costo_real: number;
}

// Tarea with joined data
export interface TareaWithAsignados extends Tarea {
  tarea_asignados?: { usuario_id: string; usuarios: { nombre: string; email: string } }[];
  proyectos?: { nombre: string; cliente: string | null };
}
