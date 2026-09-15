-- Preserve incomplete master-CSV rows for PMO completion.
-- These rows are not discarded and do not create fabricated operational data.
CREATE TABLE IF NOT EXISTS importaciones_pendientes (
  id uuid primary key default gen_random_uuid(),
  entidad text not null,
  source_record_id text not null,
  datos jsonb not null,
  proyecto_id_externo text,
  proyecto_nombre text,
  tarea_id_externo text,
  tarea_nombre text,
  estado text not null default 'pendiente',
  mensaje text not null default 'Datos pendientes de completar',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entidad, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_importaciones_pendientes_estado
  ON importaciones_pendientes(estado);

ALTER TABLE importaciones_pendientes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS importaciones_registros_maestros (
  id uuid primary key default gen_random_uuid(),
  entidad text not null,
  source_record_id text not null,
  datos jsonb not null,
  tiene_pendientes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entidad, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_importaciones_registros_maestros_record
  ON importaciones_registros_maestros(source_record_id);

ALTER TABLE importaciones_registros_maestros ENABLE ROW LEVEL SECURITY;

ALTER TABLE reuniones ALTER COLUMN fecha DROP NOT NULL;
ALTER TABLE comunicaciones ALTER COLUMN fecha DROP NOT NULL;

CREATE OR REPLACE FUNCTION importar_datos_pendientes_csv(p_payload jsonb)
RETURNS void AS $$
DECLARE
  group_name text;
  item jsonb;
  v_source_record_id text;
  entity_name text;
  marker_found boolean;
  project_name text;
  task_name text;
  pending_message text;
  relation_missing boolean;
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede conservar registros pendientes';
  END IF;

  FOR group_name IN SELECT unnest(ARRAY['usuarios', 'proyectos', 'tareas', 'reuniones', 'comunicaciones', 'roles_proyecto', 'asignaciones_tarea', 'asistentes_reunion', 'registros_tiempo']) LOOP
    FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->group_name, '[]'::jsonb)) AS elements(value) LOOP
      entity_name := CASE group_name
        WHEN 'usuarios' THEN 'usuario'
        WHEN 'proyectos' THEN 'proyecto'
        WHEN 'tareas' THEN 'tarea'
        WHEN 'reuniones' THEN 'reunion'
        WHEN 'comunicaciones' THEN 'comunicacion'
        WHEN 'roles_proyecto' THEN 'rol_proyecto'
        WHEN 'asignaciones_tarea' THEN 'asignacion_tarea'
        WHEN 'asistentes_reunion' THEN 'asistente_reunion'
        ELSE 'registro_tiempo'
      END;
      v_source_record_id := nullif(trim(coalesce(item->>'source_record_id', '')), '');
      IF v_source_record_id IS NULL THEN CONTINUE; END IF;

      SELECT bool_or(upper(value) LIKE '%DATO FALTANTE%') INTO marker_found
      FROM jsonb_each_text(item);
      marker_found := coalesce(marker_found, false) OR coalesce((item->>'pending_marker')::boolean, false);
      project_name := nullif(trim(coalesce(item->>'proyecto_nombre', item->>'nombre', '')), '');
      task_name := nullif(trim(coalesce(item->>'nombre', item->>'tarea_nombre', '')), '');
      relation_missing := false;
      IF entity_name IN ('tarea', 'reunion', 'comunicacion', 'rol_proyecto', 'asignacion_tarea', 'asistente_reunion', 'registro_tiempo') THEN
        SELECT NOT EXISTS (
          SELECT 1 FROM proyectos p
          WHERE p.nombre = item->>'proyecto_nombre'
            AND coalesce(p.cliente, '') = coalesce(item->>'proyecto_cliente', '')
        ) AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'proyectos', '[]'::jsonb)) AS project_row
          WHERE project_row->>'nombre' = item->>'proyecto_nombre'
            AND coalesce(project_row->>'cliente', '') = coalesce(item->>'proyecto_cliente', '')
        ) INTO relation_missing;
      END IF;
      pending_message := CASE
        WHEN marker_found THEN 'Contiene marcadores DATO FALTANTE; completar desde la interfaz'
        ELSE 'Relación o dato pendiente de completar desde la interfaz'
      END;

      INSERT INTO importaciones_registros_maestros AS maestro (entidad, source_record_id, datos, tiene_pendientes, updated_at)
      VALUES (entity_name, v_source_record_id, item, marker_found OR relation_missing OR (entity_name = 'tarea' AND (project_name IS NULL OR task_name IS NULL)), now())
      ON CONFLICT (entidad, source_record_id) DO UPDATE SET
        datos = EXCLUDED.datos,
        tiene_pendientes = EXCLUDED.tiene_pendientes,
        updated_at = now();

      IF marker_found OR relation_missing OR (entity_name = 'tarea' AND (project_name IS NULL OR task_name IS NULL)) THEN
        INSERT INTO importaciones_pendientes AS pendiente (
          entidad, source_record_id, datos, proyecto_id_externo, proyecto_nombre,
          tarea_id_externo, tarea_nombre, mensaje, updated_at
        ) VALUES (
          entity_name, v_source_record_id, item,
          nullif(coalesce(item->>'proyecto_id_externo', item->>'project_id'), ''), project_name,
          nullif(item->>'source_task_id', ''), task_name,
          pending_message, now()
        )
        ON CONFLICT (entidad, source_record_id) DO UPDATE SET
          datos = EXCLUDED.datos,
          proyecto_id_externo = EXCLUDED.proyecto_id_externo,
          proyecto_nombre = EXCLUDED.proyecto_nombre,
          tarea_id_externo = EXCLUDED.tarea_id_externo,
          tarea_nombre = EXCLUDED.tarea_nombre,
          mensaje = EXCLUDED.mensaje,
          estado = 'pendiente',
          updated_at = now();
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION listar_importaciones_pendientes()
RETURNS SETOF importaciones_pendientes AS $$
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede consultar registros pendientes';
  END IF;
  RETURN QUERY
  SELECT pendiente.*
  FROM importaciones_pendientes AS pendiente
  WHERE pendiente.estado = 'pendiente'
  ORDER BY pendiente.created_at, pendiente.entidad, pendiente.source_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION editar_importacion_pendiente(p_id uuid, p_datos jsonb)
RETURNS void AS $$
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede editar registros pendientes';
  END IF;
  UPDATE importaciones_pendientes
  SET datos = p_datos,
      proyecto_nombre = nullif(trim(coalesce(p_datos->>'proyecto_nombre', p_datos->>'project_name', '')), ''),
      tarea_nombre = nullif(trim(coalesce(p_datos->>'tarea_nombre', p_datos->>'task_name', p_datos->>'nombre', '')), ''),
      mensaje = 'Editado por la PMO; pendiente de completar o reimportar',
      updated_at = now()
  WHERE id = p_id AND estado = 'pendiente';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION limpiar_importaciones_pendientes()
RETURNS void AS $$
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede limpiar registros pendientes';
  END IF;
  DELETE FROM importaciones_pendientes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION limpiar_registros_maestros()
RETURNS void AS $$
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede limpiar registros maestros';
  END IF;
  DELETE FROM importaciones_registros_maestros;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;