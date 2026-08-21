/*
# Pulsesoft — Políticas RLS

## Resumen
Define las políticas de Row Level Security para todas las tablas de Pulsesoft.

## Modelo de permisos
- pmo: control total (lee, crea, edita, elimina, importa)
- direccion: visibilidad global de solo lectura. No crea/edita/elimina. No tiene acceso al Asistente de IA.
- project_manager: gestiona proyectos donde tiene rol RACI asignado
- consultor_senior / consultor_junior / desarrollo: ven y actualizan únicamente sus tareas asignadas; usan cronómetro
- administrativo: rol operativo básico, sin permisos especiales

## Notas
- 'direccion' se incluye en todas las políticas de SELECT (visibilidad global), pero nunca en INSERT/UPDATE/DELETE.
- Las políticas son idempotentes (DROP IF EXISTS antes de CREATE).
*/

-- USUARIOS
DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT
  TO authenticated USING (auth_rol() IN ('pmo','direccion') OR auth_id = auth.uid());
DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "usuarios_delete" ON usuarios;
CREATE POLICY "usuarios_delete" ON usuarios FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- TARIFAS HISTORIAL
DROP POLICY IF EXISTS "tarifas_select" ON tarifas_historial;
CREATE POLICY "tarifas_select" ON tarifas_historial FOR SELECT
  TO authenticated USING (auth_rol() IN ('pmo','direccion') OR usuario_id = auth_usuario_id());
DROP POLICY IF EXISTS "tarifas_insert" ON tarifas_historial;
CREATE POLICY "tarifas_insert" ON tarifas_historial FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "tarifas_update" ON tarifas_historial;
CREATE POLICY "tarifas_update" ON tarifas_historial FOR UPDATE TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "tarifas_delete" ON tarifas_historial;
CREATE POLICY "tarifas_delete" ON tarifas_historial FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- PROYECTOS
DROP POLICY IF EXISTS "proyectos_select" ON proyectos;
CREATE POLICY "proyectos_select" ON proyectos FOR SELECT
  TO authenticated USING (
    auth_rol() IN ('pmo','direccion') OR EXISTS (
      SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = proyectos.id AND pr.usuario_id = auth_usuario_id()
    )
  );
DROP POLICY IF EXISTS "proyectos_insert" ON proyectos;
CREATE POLICY "proyectos_insert" ON proyectos FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "proyectos_update" ON proyectos;
CREATE POLICY "proyectos_update" ON proyectos FOR UPDATE TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "proyectos_delete" ON proyectos;
CREATE POLICY "proyectos_delete" ON proyectos FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- PROYECTO ROLES
DROP POLICY IF EXISTS "proyecto_roles_select" ON proyecto_roles;
CREATE POLICY "proyecto_roles_select" ON proyecto_roles FOR SELECT
  TO authenticated USING (auth_rol() IN ('pmo','direccion') OR usuario_id = auth_usuario_id());
DROP POLICY IF EXISTS "proyecto_roles_insert" ON proyecto_roles;
CREATE POLICY "proyecto_roles_insert" ON proyecto_roles FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "proyecto_roles_update" ON proyecto_roles;
CREATE POLICY "proyecto_roles_update" ON proyecto_roles FOR UPDATE TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "proyecto_roles_delete" ON proyecto_roles;
CREATE POLICY "proyecto_roles_delete" ON proyecto_roles FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- PLANTILLAS TAREAS
DROP POLICY IF EXISTS "plantillas_select" ON plantillas_tareas;
CREATE POLICY "plantillas_select" ON plantillas_tareas FOR SELECT TO authenticated USING (auth_rol() IN ('pmo','direccion'));
DROP POLICY IF EXISTS "plantillas_insert" ON plantillas_tareas;
CREATE POLICY "plantillas_insert" ON plantillas_tareas FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "plantillas_update" ON plantillas_tareas;
CREATE POLICY "plantillas_update" ON plantillas_tareas FOR UPDATE TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "plantillas_delete" ON plantillas_tareas;
CREATE POLICY "plantillas_delete" ON plantillas_tareas FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- TAREAS
DROP POLICY IF EXISTS "tareas_select" ON tareas;
CREATE POLICY "tareas_select" ON tareas FOR SELECT
  TO authenticated USING (
    auth_rol() IN ('pmo','direccion')
    OR EXISTS (SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = tareas.proyecto_id AND pr.usuario_id = auth_usuario_id())
    OR EXISTS (SELECT 1 FROM tarea_asignados ta WHERE ta.tarea_id = tareas.id AND ta.usuario_id = auth_usuario_id())
  );
DROP POLICY IF EXISTS "tareas_insert" ON tareas;
CREATE POLICY "tareas_insert" ON tareas FOR INSERT
  TO authenticated WITH CHECK (
    auth_rol() = 'pmo'
    OR EXISTS (SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = tareas.proyecto_id AND pr.usuario_id = auth_usuario_id() AND pr.tipo_raci = 'responsable')
  );
DROP POLICY IF EXISTS "tareas_update" ON tareas;
CREATE POLICY "tareas_update" ON tareas FOR UPDATE
  TO authenticated USING (
    auth_rol() = 'pmo'
    OR EXISTS (SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = tareas.proyecto_id AND pr.usuario_id = auth_usuario_id())
    OR EXISTS (SELECT 1 FROM tarea_asignados ta WHERE ta.tarea_id = tareas.id AND ta.usuario_id = auth_usuario_id())
  ) WITH CHECK (true);
DROP POLICY IF EXISTS "tareas_delete" ON tareas;
CREATE POLICY "tareas_delete" ON tareas FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- TAREA ASIGNADOS
DROP POLICY IF EXISTS "tarea_asignados_select" ON tarea_asignados;
CREATE POLICY "tarea_asignados_select" ON tarea_asignados FOR SELECT
  TO authenticated USING (
    auth_rol() IN ('pmo','direccion')
    OR usuario_id = auth_usuario_id()
    OR EXISTS (SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = (SELECT t.proyecto_id FROM tareas t WHERE t.id = tarea_asignados.tarea_id) AND pr.usuario_id = auth_usuario_id())
  );
DROP POLICY IF EXISTS "tarea_asignados_insert" ON tarea_asignados;
CREATE POLICY "tarea_asignados_insert" ON tarea_asignados FOR INSERT
  TO authenticated WITH CHECK (
    auth_rol() = 'pmo'
    OR EXISTS (SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = (SELECT t.proyecto_id FROM tareas t WHERE t.id = tarea_asignados.tarea_id) AND pr.usuario_id = auth_usuario_id() AND pr.tipo_raci = 'responsable')
  );
DROP POLICY IF EXISTS "tarea_asignados_delete" ON tarea_asignados;
CREATE POLICY "tarea_asignados_delete" ON tarea_asignados FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- REGISTROS TIEMPO
DROP POLICY IF EXISTS "registros_tiempo_select" ON registros_tiempo;
CREATE POLICY "registros_tiempo_select" ON registros_tiempo FOR SELECT
  TO authenticated USING (auth_rol() IN ('pmo','direccion') OR usuario_id = auth_usuario_id());
DROP POLICY IF EXISTS "registros_tiempo_insert" ON registros_tiempo;
CREATE POLICY "registros_tiempo_insert" ON registros_tiempo FOR INSERT TO authenticated WITH CHECK (usuario_id = auth_usuario_id());
DROP POLICY IF EXISTS "registros_tiempo_update" ON registros_tiempo;
CREATE POLICY "registros_tiempo_update" ON registros_tiempo FOR UPDATE TO authenticated USING (usuario_id = auth_usuario_id());
DROP POLICY IF EXISTS "registros_tiempo_delete" ON registros_tiempo;
CREATE POLICY "registros_tiempo_delete" ON registros_tiempo FOR DELETE TO authenticated USING (auth_rol() = 'pmo' OR usuario_id = auth_usuario_id());

-- REPORTES SEMANALES
DROP POLICY IF EXISTS "reportes_select" ON reportes_semanales;
CREATE POLICY "reportes_select" ON reportes_semanales FOR SELECT
  TO authenticated USING (auth_rol() IN ('pmo','direccion') OR usuario_id = auth_usuario_id());
DROP POLICY IF EXISTS "reportes_insert" ON reportes_semanales;
CREATE POLICY "reportes_insert" ON reportes_semanales FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "reportes_update" ON reportes_semanales;
CREATE POLICY "reportes_update" ON reportes_semanales FOR UPDATE TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "reportes_delete" ON reportes_semanales;
CREATE POLICY "reportes_delete" ON reportes_semanales FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- REPORTES SEMANALES DETALLE
DROP POLICY IF EXISTS "reportes_detalle_select" ON reportes_semanales_detalle;
CREATE POLICY "reportes_detalle_select" ON reportes_semanales_detalle FOR SELECT
  TO authenticated USING (
    auth_rol() IN ('pmo','direccion')
    OR EXISTS (SELECT 1 FROM reportes_semanales rs WHERE rs.id = reportes_semanales_detalle.reporte_id AND rs.usuario_id = auth_usuario_id())
  );
DROP POLICY IF EXISTS "reportes_detalle_insert" ON reportes_semanales_detalle;
CREATE POLICY "reportes_detalle_insert" ON reportes_semanales_detalle FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "reportes_detalle_delete" ON reportes_semanales_detalle;
CREATE POLICY "reportes_detalle_delete" ON reportes_semanales_detalle FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- REUNIONES
DROP POLICY IF EXISTS "reuniones_select" ON reuniones;
CREATE POLICY "reuniones_select" ON reuniones FOR SELECT
  TO authenticated USING (
    auth_rol() IN ('pmo','direccion')
    OR EXISTS (SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = reuniones.proyecto_id AND pr.usuario_id = auth_usuario_id())
    OR EXISTS (SELECT 1 FROM reunion_asistentes ra WHERE ra.reunion_id = reuniones.id AND ra.usuario_id = auth_usuario_id())
  );
DROP POLICY IF EXISTS "reuniones_insert" ON reuniones;
CREATE POLICY "reuniones_insert" ON reuniones FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "reuniones_update" ON reuniones;
CREATE POLICY "reuniones_update" ON reuniones FOR UPDATE TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "reuniones_delete" ON reuniones;
CREATE POLICY "reuniones_delete" ON reuniones FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- REUNION ASISTENTES
DROP POLICY IF EXISTS "reunion_asistentes_select" ON reunion_asistentes;
CREATE POLICY "reunion_asistentes_select" ON reunion_asistentes FOR SELECT
  TO authenticated USING (
    auth_rol() IN ('pmo','direccion')
    OR usuario_id = auth_usuario_id()
    OR EXISTS (SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = (SELECT r.proyecto_id FROM reuniones r WHERE r.id = reunion_asistentes.reunion_id) AND pr.usuario_id = auth_usuario_id())
  );
DROP POLICY IF EXISTS "reunion_asistentes_insert" ON reunion_asistentes;
CREATE POLICY "reunion_asistentes_insert" ON reunion_asistentes FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "reunion_asistentes_delete" ON reunion_asistentes;
CREATE POLICY "reunion_asistentes_delete" ON reunion_asistentes FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- COMUNICACIONES
DROP POLICY IF EXISTS "comunicaciones_select" ON comunicaciones;
CREATE POLICY "comunicaciones_select" ON comunicaciones FOR SELECT
  TO authenticated USING (
    auth_rol() IN ('pmo','direccion')
    OR EXISTS (SELECT 1 FROM proyecto_roles pr WHERE pr.proyecto_id = comunicaciones.proyecto_id AND pr.usuario_id = auth_usuario_id())
    OR usuario_id = auth_usuario_id()
  );
DROP POLICY IF EXISTS "comunicaciones_insert" ON comunicaciones;
CREATE POLICY "comunicaciones_insert" ON comunicaciones FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo' OR usuario_id = auth_usuario_id());
DROP POLICY IF EXISTS "comunicaciones_update" ON comunicaciones;
CREATE POLICY "comunicaciones_update" ON comunicaciones FOR UPDATE TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "comunicaciones_delete" ON comunicaciones;
CREATE POLICY "comunicaciones_delete" ON comunicaciones FOR DELETE TO authenticated USING (auth_rol() = 'pmo');

-- IMPORTACIONES
DROP POLICY IF EXISTS "importaciones_select" ON importaciones;
CREATE POLICY "importaciones_select" ON importaciones FOR SELECT TO authenticated USING (auth_rol() IN ('pmo','direccion'));
DROP POLICY IF EXISTS "importaciones_insert" ON importaciones;
CREATE POLICY "importaciones_insert" ON importaciones FOR INSERT TO authenticated WITH CHECK (auth_rol() = 'pmo');
