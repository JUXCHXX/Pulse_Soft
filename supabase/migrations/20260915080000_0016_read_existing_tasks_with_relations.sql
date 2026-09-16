-- Read existing task rows through one relational contract.
-- This is read-only: it does not recreate or mutate imported tasks.
CREATE OR REPLACE FUNCTION listar_tareas_existentes(p_proyecto_id uuid DEFAULT NULL)
RETURNS SETOF jsonb AS $$
BEGIN
  IF auth_rol() NOT IN ('pmo', 'direccion') AND NOT EXISTS (
    SELECT 1
    FROM proyecto_roles AS acceso
    WHERE acceso.usuario_id = auth_usuario_id()
      AND (p_proyecto_id IS NULL OR acceso.proyecto_id = p_proyecto_id)
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para consultar estas tareas';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', tarea.id,
    'proyecto_id', tarea.proyecto_id,
    'plantilla_origen_id', tarea.plantilla_origen_id,
    'proceso_id', tarea.proceso_id,
    'nombre', tarea.nombre,
    'descripcion', tarea.descripcion,
    'estado', tarea.estado,
    'prioridad', tarea.prioridad,
    'fecha_inicio', tarea.fecha_inicio,
    'fecha_limite', tarea.fecha_limite,
    'fecha_finalizacion', tarea.fecha_finalizacion,
    'tiempo_estimado_horas', tarea.tiempo_estimado_horas,
    'orden', tarea.orden,
    'duracion_ideal_dias', tarea.duracion_ideal_dias,
    'rol_sugerido', tarea.rol_sugerido,
    'created_at', tarea.created_at,
    'updated_at', tarea.updated_at,
    'proyectos', CASE WHEN proyecto.id IS NULL THEN NULL ELSE jsonb_build_object('nombre', proyecto.nombre) END,
    'tarea_asignados', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'usuario_id', relacion.usuario_id,
        'usuarios', CASE WHEN asignado.id IS NULL THEN NULL ELSE jsonb_build_object('nombre', asignado.nombre) END
      ) ORDER BY asignado.nombre)
      FROM tarea_asignados AS relacion
      LEFT JOIN usuarios AS asignado ON asignado.id = relacion.usuario_id
      WHERE relacion.tarea_id = tarea.id
    ), '[]'::jsonb)
  )
  FROM tareas AS tarea
  LEFT JOIN proyectos AS proyecto ON proyecto.id = tarea.proyecto_id
  WHERE (p_proyecto_id IS NULL OR tarea.proyecto_id = p_proyecto_id)
    AND (
      auth_rol() IN ('pmo', 'direccion')
      OR EXISTS (
        SELECT 1
        FROM proyecto_roles AS acceso_tarea
        WHERE acceso_tarea.proyecto_id = tarea.proyecto_id
          AND acceso_tarea.usuario_id = auth_usuario_id()
      )
      OR EXISTS (
        SELECT 1
        FROM tarea_asignados AS asignacion_tarea
        WHERE asignacion_tarea.tarea_id = tarea.id
          AND asignacion_tarea.usuario_id = auth_usuario_id()
      )
    )
  ORDER BY tarea.fecha_limite NULLS LAST, tarea.created_at, tarea.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
