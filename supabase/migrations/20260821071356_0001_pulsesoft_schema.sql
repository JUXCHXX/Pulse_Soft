/*
# Pulsesoft — Esquema de base de datos (Supabase / PostgreSQL)

## Resumen
Crea el esquema completo de Pulsesoft: un sistema de gestión de proyectos para una PMO.
Reemplaza un Excel manual. Usuarios internos con login.

## Tipos ENUM
- rol_usuario: pmo, direccion, project_manager, consultor_senior, consultor_junior, desarrollo, administrativo
- categoria_proyecto: implementacion, soporte
- estado_proyecto: no_iniciado, en_progreso, en_espera, completado, cancelado
- prioridad_nivel: baja, media, alta, urgente
- estado_tarea: no_iniciado, en_progreso, en_espera, hecho
- tipo_raci: responsable, aprueba, consultado, informado
- tipo_reunion: kickoff, seguimiento, cierre, interna, con_cliente, otra
- tipo_comunicacion: llamada, correo, mensaje, otro

## Tablas
1. usuarios — perfil de cada miembro del equipo, vinculado a auth.users por auth_id
2. tarifas_historial — historial de tarifas/hora por usuario
3. proyectos — proyectos con categoría, estado, prioridad, fechas, valor estimado
4. proyecto_roles — asignación RACI (multi-responsable) de usuarios a proyectos
5. plantillas_tareas — plantillas de tareas por categoría (se copian al crear proyecto)
6. tareas — tareas de cada proyecto
7. tarea_asignados — asignación multi-usuario de tareas
8. registros_tiempo — sesiones de cronómetro (una fila por sesión)
9. reportes_semanales — resumen semanal por consultor
10. reportes_semanales_detalle — detalle de tareas por reporte
11. reuniones — reuniones de proyecto
12. reunion_asistentes — asistentes a reuniones
13. comunicaciones — registro de comunicaciones con clientes
14. importaciones — auditoría de cargas desde Excel

## Vistas
- vw_tarea_costo — horas reales y costo real por tarea
- vw_proyecto_resumen — resumen de progreso, atrasos y costo por proyecto
- vw_carga_consultor — carga de trabajo y horas por consultor
- vw_cronometros_activos — cronómetros activos en tiempo real

## Triggers
- set_updated_at() — actualiza updated_at en usuarios, proyectos, tareas

## Seguridad
- RLS habilitado en: proyectos, tareas, registros_tiempo, reportes_semanales, importaciones
- Políticas se aplican en migración separada (0002)
- Funciones helper auth_rol() y auth_usuario_id() (security definer) para políticas

## Notas
- El índice único idx_un_solo_cronometro_activo garantiza un solo cronómetro activo por usuario
- Las vistas se usan SIEMPRE para dashboards, nunca recalcular en frontend
- duracion_segundos y pct_cumplimiento son columnas generadas (computed)
*/

-- ============================================================================
-- 1. TIPOS ENUM
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE rol_usuario AS ENUM ('pmo','direccion','project_manager','consultor_senior','consultor_junior','desarrollo','administrativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE categoria_proyecto AS ENUM ('implementacion','soporte');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_proyecto AS ENUM ('no_iniciado','en_progreso','en_espera','completado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prioridad_nivel AS ENUM ('baja','media','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_tarea AS ENUM ('no_iniciado','en_progreso','en_espera','hecho');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_raci AS ENUM ('responsable','aprueba','consultado','informado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_reunion AS ENUM ('kickoff','seguimiento','cierre','interna','con_cliente','otra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_comunicacion AS ENUM ('llamada','correo','mensaje','otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. USUARIOS / EQUIPO
-- ============================================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete set null,
  nombre text not null,
  email text unique not null,
  rol rol_usuario not null,
  tarifa_hora numeric(10,2) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);

CREATE TABLE IF NOT EXISTS tarifas_historial (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tarifa_hora numeric(10,2) not null,
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  created_by uuid references usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_tarifas_usuario ON tarifas_historial(usuario_id, vigente_desde);

-- ============================================================================
-- 3. PROYECTOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  categoria categoria_proyecto not null,
  linea_producto text,
  estado estado_proyecto not null default 'no_iniciado',
  prioridad prioridad_nivel not null default 'media',
  fecha_inicio date,
  fecha_limite date,
  fecha_fin date,
  valor_estimado numeric(12,2),
  cliente text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_proyectos_estado ON proyectos(estado);
CREATE INDEX IF NOT EXISTS idx_proyectos_categoria ON proyectos(categoria);
CREATE INDEX IF NOT EXISTS idx_proyectos_prioridad ON proyectos(prioridad);

CREATE TABLE IF NOT EXISTS proyecto_roles (
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo_raci tipo_raci not null,
  primary key (proyecto_id, usuario_id, tipo_raci)
);
CREATE INDEX IF NOT EXISTS idx_proyecto_roles_usuario ON proyecto_roles(usuario_id);

-- ============================================================================
-- 4. PLANTILLAS DE TAREAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS plantillas_tareas (
  id uuid primary key default gen_random_uuid(),
  categoria categoria_proyecto not null,
  nombre_tarea text not null,
  descripcion text,
  orden integer not null default 0,
  activo boolean not null default true
);
CREATE INDEX IF NOT EXISTS idx_plantillas_categoria ON plantillas_tareas(categoria, orden);

-- ============================================================================
-- 5. TAREAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS tareas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  plantilla_origen_id uuid references plantillas_tareas(id) on delete set null,
  nombre text not null,
  descripcion text,
  estado estado_tarea not null default 'no_iniciado',
  prioridad prioridad_nivel not null default 'media',
  fecha_inicio date,
  fecha_limite date,
  fecha_finalizacion date,
  tiempo_estimado_horas numeric(6,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_tareas_proyecto ON tareas(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas(estado);
CREATE INDEX IF NOT EXISTS idx_tareas_fecha_limite ON tareas(fecha_limite);

CREATE TABLE IF NOT EXISTS tarea_asignados (
  tarea_id uuid not null references tareas(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  primary key (tarea_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_tarea_asignados_usuario ON tarea_asignados(usuario_id);

-- ============================================================================
-- 6. CRONÓMETRO — REGISTROS DE TIEMPO
-- ============================================================================
CREATE TABLE IF NOT EXISTS registros_tiempo (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  inicio timestamptz not null default now(),
  fin timestamptz,
  duracion_segundos integer generated always as (
    case when fin is not null then extract(epoch from (fin - inicio))::integer else null end
  ) stored,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_registros_tarea ON registros_tiempo(tarea_id);
CREATE INDEX IF NOT EXISTS idx_registros_usuario ON registros_tiempo(usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_un_solo_cronometro_activo ON registros_tiempo(usuario_id) WHERE fin is null;

-- ============================================================================
-- 7. REPORTES SEMANALES
-- ============================================================================
CREATE TABLE IF NOT EXISTS reportes_semanales (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  semana_inicio date not null,
  semana_fin date not null,
  tareas_asignadas integer not null default 0,
  tareas_completadas integer not null default 0,
  pct_cumplimiento numeric(5,2) generated always as (
    case when tareas_asignadas = 0 then 0
    else round((tareas_completadas::numeric / tareas_asignadas) * 100, 2) end
  ) stored,
  generado_at timestamptz not null default now(),
  unique (usuario_id, semana_inicio)
);
CREATE INDEX IF NOT EXISTS idx_reportes_usuario ON reportes_semanales(usuario_id, semana_inicio);

CREATE TABLE IF NOT EXISTS reportes_semanales_detalle (
  reporte_id uuid not null references reportes_semanales(id) on delete cascade,
  tarea_id uuid not null references tareas(id) on delete cascade,
  estaba_completada boolean not null default false,
  primary key (reporte_id, tarea_id)
);

-- ============================================================================
-- 8. REUNIONES
-- ============================================================================
CREATE TABLE IF NOT EXISTS reuniones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  nombre text not null,
  tipo tipo_reunion not null default 'seguimiento',
  estado text not null default 'programada',
  fecha date not null,
  hora time,
  notas text,
  created_by uuid references usuarios(id),
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_reuniones_proyecto ON reuniones(proyecto_id, fecha);

CREATE TABLE IF NOT EXISTS reunion_asistentes (
  reunion_id uuid not null references reuniones(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  primary key (reunion_id, usuario_id)
);

-- ============================================================================
-- 9. COMUNICACIONES
-- ============================================================================
CREATE TABLE IF NOT EXISTS comunicaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  usuario_id uuid references usuarios(id),
  tipo tipo_comunicacion not null,
  fecha date not null default current_date,
  resultado text,
  notas text,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_proyecto ON comunicaciones(proyecto_id, fecha);

-- ============================================================================
-- 10. IMPORTACIONES
-- ============================================================================
CREATE TABLE IF NOT EXISTS importaciones (
  id uuid primary key default gen_random_uuid(),
  realizado_por uuid not null references usuarios(id),
  nombre_archivo text not null,
  filas_creadas integer not null default 0,
  filas_actualizadas integer not null default 0,
  filas_omitidas integer not null default 0,
  detalle_errores jsonb,
  estado text not null default 'completado',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 11. VISTAS
-- ============================================================================
CREATE OR REPLACE VIEW vw_tarea_costo AS
SELECT t.id AS tarea_id, t.proyecto_id, t.nombre, t.estado, t.tiempo_estimado_horas,
  COALESCE(sum(rt.duracion_segundos), 0) / 3600.0 AS horas_reales,
  COALESCE(sum(rt.duracion_segundos * u.tarifa_hora / 3600.0), 0) AS costo_real
FROM tareas t
LEFT JOIN registros_tiempo rt ON rt.tarea_id = t.id AND rt.fin IS NOT NULL
LEFT JOIN usuarios u ON u.id = rt.usuario_id
GROUP BY t.id, t.proyecto_id, t.nombre, t.estado, t.tiempo_estimado_horas;

CREATE OR REPLACE VIEW vw_proyecto_resumen AS
SELECT p.id AS proyecto_id, p.nombre, p.estado, p.prioridad, p.valor_estimado,
  count(t.id) AS total_tareas,
  count(t.id) FILTER (WHERE t.estado = 'hecho') AS tareas_completadas,
  count(t.id) FILTER (WHERE t.fecha_limite < current_date AND t.estado <> 'hecho') AS tareas_atrasadas,
  round((count(t.id) FILTER (WHERE t.estado = 'hecho')::numeric / nullif(count(t.id), 0)) * 100, 2) AS progreso_pct,
  COALESCE(sum(vtc.costo_real), 0) AS costo_real_total
FROM proyectos p
LEFT JOIN tareas t ON t.proyecto_id = p.id
LEFT JOIN vw_tarea_costo vtc ON vtc.tarea_id = t.id
GROUP BY p.id, p.nombre, p.estado, p.prioridad, p.valor_estimado;

CREATE OR REPLACE VIEW vw_carga_consultor AS
SELECT u.id AS usuario_id, u.nombre, u.rol,
  count(ta.tarea_id) AS tareas_asignadas_activas,
  count(ta.tarea_id) FILTER (WHERE t.fecha_limite < current_date AND t.estado <> 'hecho') AS tareas_atrasadas,
  COALESCE(sum(rt.duracion_segundos), 0) / 3600.0 AS horas_registradas_totales
FROM usuarios u
LEFT JOIN tarea_asignados ta ON ta.usuario_id = u.id
LEFT JOIN tareas t ON t.id = ta.tarea_id AND t.estado <> 'hecho'
LEFT JOIN registros_tiempo rt ON rt.usuario_id = u.id
GROUP BY u.id, u.nombre, u.rol;

CREATE OR REPLACE VIEW vw_cronometros_activos AS
SELECT rt.id AS registro_id, u.id AS usuario_id, u.nombre AS consultor,
  t.id AS tarea_id, t.nombre AS tarea, p.id AS proyecto_id, p.nombre AS proyecto,
  rt.inicio, extract(epoch from (now() - rt.inicio))::integer AS segundos_transcurridos
FROM registros_tiempo rt
JOIN usuarios u ON u.id = rt.usuario_id
JOIN tareas t ON t.id = rt.tarea_id
JOIN proyectos p ON p.id = t.proyecto_id
WHERE rt.fin IS NULL;

-- ============================================================================
-- 12. ROW LEVEL SECURITY (enable; policies in 0002)
-- ============================================================================
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_tiempo ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_semanales ENABLE ROW LEVEL SECURITY;
ALTER TABLE importaciones ENABLE ROW LEVEL SECURITY;

-- Also enable RLS on the remaining tables for defense in depth
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarifas_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarea_asignados ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_semanales_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE reuniones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reunion_asistentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicaciones ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 13. HELPER FUNCTIONS (security definer, used by policies)
-- ============================================================================
CREATE OR REPLACE FUNCTION auth_rol() RETURNS rol_usuario AS $$
  SELECT rol FROM usuarios WHERE auth_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_usuario_id() RETURNS uuid AS $$
  SELECT id FROM usuarios WHERE auth_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- 14. TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN new.updated_at = now(); RETURN new; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_updated ON usuarios;
CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_proyectos_updated ON proyectos;
CREATE TRIGGER trg_proyectos_updated BEFORE UPDATE ON proyectos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tareas_updated ON tareas;
CREATE TRIGGER trg_tareas_updated BEFORE UPDATE ON tareas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
