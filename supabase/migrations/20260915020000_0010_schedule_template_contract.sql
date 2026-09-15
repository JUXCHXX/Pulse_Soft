-- Canonical schedule-template contract. Historical CSV fields are not part of this model.
ALTER TABLE plantillas_csv_procesos
  ADD COLUMN IF NOT EXISTS process_key text,
  ADD COLUMN IF NOT EXISTS parent_proceso_id uuid REFERENCES plantillas_csv_procesos(id) ON DELETE CASCADE;

ALTER TABLE proyecto_procesos
  ADD COLUMN IF NOT EXISTS parent_proceso_id uuid REFERENCES proyecto_procesos(id) ON DELETE CASCADE;

UPDATE plantillas_csv_procesos
SET process_key = lower(regexp_replace(nombre, '[^a-zA-Z0-9]+', '_', 'g')) || '_' || substr(id::text, 1, 8)
WHERE process_key IS NULL;

ALTER TABLE plantillas_csv_procesos ALTER COLUMN process_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_process_key
  ON plantillas_csv_procesos(plantilla_id, process_key);

ALTER TABLE plantillas_csv_tareas
  ADD COLUMN IF NOT EXISTS activity_key text,
  ADD COLUMN IF NOT EXISTS parent_activity_id uuid REFERENCES plantillas_csv_tareas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS start_offset_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_priority prioridad_nivel NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

UPDATE plantillas_csv_tareas
SET activity_key = lower(regexp_replace(tarea, '[^a-zA-Z0-9]+', '_', 'g')) || '_' || orden || '_' || substr(id::text, 1, 8)
WHERE activity_key IS NULL;
ALTER TABLE plantillas_csv_tareas ALTER COLUMN activity_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_activity_key
  ON plantillas_csv_tareas(plantilla_id, activity_key);

CREATE OR REPLACE FUNCTION guardar_plantilla_csv(
  p_tipo text,
  p_producto text,
  p_nombre_archivo text,
  p_tareas jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_plantilla_id uuid;
  v_template_key text;
  v_count integer;
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede cargar plantillas de cronograma';
  END IF;
  IF p_tipo NOT IN ('implementacion', 'soporte') THEN
    RAISE EXCEPTION 'Tipo de plantilla no valido';
  END IF;
  IF (p_tipo = 'implementacion' AND p_producto IS NULL)
    OR (p_tipo = 'soporte' AND p_producto IS NOT NULL) THEN
    RAISE EXCEPTION 'La combinacion de tipo y producto no es valida';
  END IF;

  v_template_key := CASE WHEN p_tipo = 'soporte'
    THEN 'support' ELSE 'implementation_' || lower(p_producto) END;

  DELETE FROM plantillas_csv WHERE template_key = v_template_key;
  INSERT INTO plantillas_csv (tipo, producto, template_key, nombre_archivo, cargado_por)
  VALUES (p_tipo, p_producto, v_template_key, p_nombre_archivo, auth_usuario_id())
  RETURNING id INTO v_plantilla_id;

  INSERT INTO plantillas_csv_procesos (plantilla_id, process_key, nombre, orden)
  SELECT v_plantilla_id, item.process_key, item.process_name, min(item.sort_order)
  FROM jsonb_to_recordset(coalesce(p_tareas, '[]'::jsonb)) AS item(
    process_key text, process_name text, sort_order integer
  )
  WHERE nullif(trim(item.process_key), '') IS NOT NULL
    AND nullif(trim(item.process_name), '') IS NOT NULL
  GROUP BY item.process_key, item.process_name;

  INSERT INTO plantillas_csv_tareas (
    plantilla_id, proceso_id, activity_key, tarea, orden, tipo_registro,
    duracion_ideal_dias, start_offset_days, default_priority, rol_sugerido, is_optional
  )
  SELECT v_plantilla_id, p.id, item.activity_key, item.activity_name, item.sort_order,
    'Actividad', item.duration_days, coalesce(item.start_offset_days, 0),
    coalesce(nullif(item.default_priority, '')::prioridad_nivel, 'media'),
    nullif(item.suggested_role, ''), coalesce(item.is_optional, false)
  FROM jsonb_to_recordset(coalesce(p_tareas, '[]'::jsonb)) AS item(
    process_key text, process_name text, activity_key text, activity_name text,
    parent_process_key text, sort_order integer, duration_days integer,
    start_offset_days integer, default_priority text, suggested_role text,
    is_optional boolean
  )
  JOIN plantillas_csv_procesos p
    ON p.plantilla_id = v_plantilla_id AND p.process_key = item.process_key
  WHERE nullif(trim(item.activity_key), '') IS NOT NULL
    AND nullif(trim(item.activity_name), '') IS NOT NULL;

  UPDATE plantillas_csv_procesos child
  SET parent_proceso_id = parent.id
  FROM jsonb_to_recordset(coalesce(p_tareas, '[]'::jsonb)) AS item(
    process_key text, process_name text, activity_key text, activity_name text,
    parent_process_key text, sort_order integer, duration_days integer,
    start_offset_days integer, default_priority text, suggested_role text,
    is_optional boolean
  )
  JOIN plantillas_csv_procesos parent
    ON parent.plantilla_id = v_plantilla_id AND parent.process_key = item.parent_process_key
  WHERE child.plantilla_id = v_plantilla_id
    AND child.process_key = item.process_key
    AND nullif(trim(item.parent_process_key), '') IS NOT NULL;

  SELECT count(*) INTO v_count FROM plantillas_csv_tareas WHERE plantilla_id = v_plantilla_id;
  RETURN jsonb_build_object('plantilla_id', v_plantilla_id, 'template_key', v_template_key, 'tareas', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION obtener_plantilla_csv_resumen(p_tipo text, p_producto text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_template_key text := CASE WHEN p_tipo = 'soporte' THEN 'support' ELSE 'implementation_' || lower(p_producto) END;
  v_plantilla_id uuid;
BEGIN
  SELECT id INTO v_plantilla_id FROM plantillas_csv WHERE template_key = v_template_key;
  IF v_plantilla_id IS NULL THEN
    RETURN jsonb_build_object('exists', false, 'template_key', v_template_key, 'tasks', 0, 'processes', 0, 'structure', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'exists', true,
    'template_key', v_template_key,
    'tasks', (SELECT count(*) FROM plantillas_csv_tareas WHERE plantilla_id = v_plantilla_id),
    'processes', (SELECT count(*) FROM plantillas_csv_procesos WHERE plantilla_id = v_plantilla_id),
    'structure', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'process_key', p.process_key,
        'nombre', p.nombre,
        'parent_process_key', parent.process_key,
        'actividades', (SELECT count(*) FROM plantillas_csv_tareas t WHERE t.proceso_id = p.id)
      ) ORDER BY p.orden, p.id)
      FROM plantillas_csv_procesos p
      LEFT JOIN plantillas_csv_procesos parent ON parent.id = p.parent_proceso_id
      WHERE p.plantilla_id = v_plantilla_id
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION copiar_plantilla_csv_tareas(
  p_proyecto_id uuid, p_tipo text, p_producto text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  v_template_key text := CASE WHEN p_tipo = 'soporte' THEN 'support' ELSE 'implementation_' || lower(p_producto) END;
  v_plantilla_id uuid;
  v_count integer := 0;
  v_fecha_inicio date;
BEGIN
  IF auth_rol() <> 'pmo' THEN RAISE EXCEPTION 'Solo la PMO puede generar cronogramas'; END IF;
  SELECT id INTO v_plantilla_id FROM plantillas_csv WHERE template_key = v_template_key;
  IF v_plantilla_id IS NULL THEN RETURN 0; END IF;

  SELECT fecha_inicio INTO v_fecha_inicio FROM proyectos WHERE id = p_proyecto_id;
  UPDATE proyectos SET template_key = v_template_key WHERE id = p_proyecto_id;

  INSERT INTO proyecto_procesos (proyecto_id, nombre, orden)
  SELECT p_proyecto_id, nombre, orden
  FROM plantillas_csv_procesos
  WHERE plantilla_id = v_plantilla_id
  ORDER BY orden, id;

  UPDATE proyecto_procesos child
  SET parent_proceso_id = parent.id
  FROM plantillas_csv_procesos template_child
  JOIN plantillas_csv_procesos template_parent ON template_parent.id = template_child.parent_proceso_id
  JOIN proyecto_procesos parent ON parent.proyecto_id = p_proyecto_id AND parent.nombre = template_parent.nombre
  WHERE child.proyecto_id = p_proyecto_id
    AND child.nombre = template_child.nombre
    AND template_child.plantilla_id = v_plantilla_id;

  INSERT INTO tareas (
    proyecto_id, proceso_id, orden, nombre, prioridad, fecha_inicio, fecha_limite,
    duracion_ideal_dias, rol_sugerido
  )
  SELECT p_proyecto_id, pp.id, t.orden, t.tarea, t.default_priority,
    CASE WHEN v_fecha_inicio IS NULL THEN NULL ELSE v_fecha_inicio + t.start_offset_days END,
    CASE WHEN v_fecha_inicio IS NULL OR t.duracion_ideal_dias IS NULL THEN NULL
      ELSE v_fecha_inicio + t.start_offset_days + greatest(t.duracion_ideal_dias - 1, 0) END,
    t.duracion_ideal_dias, t.rol_sugerido
  FROM plantillas_csv_tareas t
  JOIN plantillas_csv_procesos tp ON tp.id = t.proceso_id
  JOIN proyecto_procesos pp ON pp.proyecto_id = p_proyecto_id AND pp.nombre = tp.nombre
  WHERE t.plantilla_id = v_plantilla_id
  ORDER BY t.orden, t.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION limpiar_plantillas_csv()
RETURNS void AS $$
BEGIN
  IF auth_rol() <> 'pmo' THEN RAISE EXCEPTION 'Solo la PMO puede limpiar plantillas'; END IF;
  DELETE FROM plantillas_csv WHERE true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
