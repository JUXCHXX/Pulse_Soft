import type {
  EstadoProyecto,
  EstadoTarea,
  PrioridadNivel,
  RolUsuario,
  TipoReunion,
  TipoComunicacion,
  CategoriaProyecto,
} from './types';

export const ESTADOS_PROYECTO: { value: EstadoProyecto; label: string; color: string }[] = [
  { value: 'no_iniciado', label: 'No iniciado', color: 'bg-stone-400/20 text-stone-400' },
  { value: 'en_progreso', label: 'En progreso', color: 'bg-caribbean-green/20 text-caribbean-green' },
  { value: 'en_espera', label: 'En espera', color: 'bg-warning/20 text-warning' },
  { value: 'completado', label: 'Completado', color: 'bg-success/20 text-success' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-danger/20 text-danger' },
];

export const ESTADOS_TAREA: { value: EstadoTarea; label: string; color: string }[] = [
  { value: 'no_iniciado', label: 'No iniciado', color: 'bg-stone-400/20 text-stone-400' },
  { value: 'en_progreso', label: 'En progreso', color: 'bg-caribbean-green/20 text-caribbean-green' },
  { value: 'en_espera', label: 'En espera', color: 'bg-warning/20 text-warning' },
  { value: 'hecho', label: 'Completado', color: 'bg-success/20 text-success' },
];

export const PRIORIDADES: { value: PrioridadNivel; label: string; color: string }[] = [
  { value: 'baja', label: 'Baja', color: 'bg-stone-400/20 text-stone-400' },
  { value: 'media', label: 'Media', color: 'bg-info/20 text-info' },
  { value: 'alta', label: 'Alta', color: 'bg-warning/20 text-warning' },
  { value: 'urgente', label: 'Urgente', color: 'bg-danger/20 text-danger' },
];

export const CATEGORIAS: { value: CategoriaProyecto; label: string }[] = [
  { value: 'implementacion', label: 'Implementación' },
  { value: 'soporte', label: 'Soporte' },
];

export const ROLES: { value: RolUsuario; label: string }[] = [
  { value: 'pmo', label: 'PMO' },
  { value: 'direccion', label: 'Dirección' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'consultor_senior', label: 'Consultor Senior' },
  { value: 'consultor_junior', label: 'Consultor Junior' },
  { value: 'desarrollo', label: 'Desarrollo' },
  { value: 'administrativo', label: 'Administrativo' },
];

export const TIPOS_REUNION: { value: TipoReunion; label: string }[] = [
  { value: 'kickoff', label: 'Kickoff' },
  { value: 'seguimiento', label: 'Seguimiento' },
  { value: 'cierre', label: 'Cierre' },
  { value: 'interna', label: 'Interna' },
  { value: 'con_cliente', label: 'Con cliente' },
  { value: 'otra', label: 'Otra' },
];

export const TIPOS_COMUNICACION: { value: TipoComunicacion; label: string }[] = [
  { value: 'llamada', label: 'Llamada' },
  { value: 'correo', label: 'Correo' },
  { value: 'mensaje', label: 'Mensaje' },
  { value: 'otro', label: 'Otro' },
];

export function getEstadoProyecto(value: string) {
  return ESTADOS_PROYECTO.find((e) => e.value === value) ?? ESTADOS_PROYECTO[0];
}

export function getEstadoTarea(value: string) {
  return ESTADOS_TAREA.find((e) => e.value === value) ?? ESTADOS_TAREA[0];
}

export function getPrioridad(value: string) {
  return PRIORIDADES.find((p) => p.value === value) ?? PRIORIDADES[1];
}

export function getRol(value: string) {
  return ROLES.find((r) => r.value === value) ?? ROLES[6];
}

export function getCategoria(value: string) {
  return CATEGORIAS.find((c) => c.value === value) ?? CATEGORIAS[0];
}
