-- Operational reset and CSV-master import support.
-- Template tables and administrative users are intentionally excluded.
CREATE OR REPLACE FUNCTION limpiar_datos_operativos()
RETURNS void AS $$
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede limpiar datos operativos';
  END IF;

  DELETE FROM reportes_semanales_detalle WHERE true;
  DELETE FROM reunion_asistentes WHERE true;
  DELETE FROM tarea_asignados WHERE true;
  DELETE FROM registros_tiempo WHERE true;
  DELETE FROM reportes_semanales WHERE true;
  DELETE FROM comunicaciones WHERE true;
  DELETE FROM reuniones WHERE true;
  DELETE FROM proyecto_roles WHERE true;
  DELETE FROM tareas WHERE true;
  DELETE FROM proyecto_procesos WHERE true;
  DELETE FROM proyectos WHERE true;
  DELETE FROM importaciones WHERE true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION importar_datos_csv(p_payload jsonb)
RETURNS jsonb AS $$
DECLARE
  item jsonb;
  project_id uuid;
  task_id uuid;
  user_id uuid;
  meeting_id uuid;
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede importar el CSV maestro';
  END IF;
  PERFORM importar_datos(p_payload);

  -- The legacy relational routine creates the operational rows; this bridge
  -- preserves the historical project's template classification separately.
  UPDATE proyectos p
  SET template_key = nullif(project_row->>'template_key', '')
  FROM jsonb_array_elements(coalesce(p_payload->'proyectos', '[]'::jsonb)) AS project_row
  WHERE p.nombre = project_row->>'nombre'
    AND coalesce(p.cliente, '') = coalesce(project_row->>'cliente', '')
    AND nullif(project_row->>'template_key', '') IS NOT NULL;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'roles_proyecto', '[]'::jsonb)) AS elements(value) LOOP
    SELECT id INTO project_id FROM proyectos WHERE nombre = item->>'proyecto_nombre' AND coalesce(cliente, '') = coalesce(item->>'proyecto_cliente', '');
    SELECT id INTO user_id FROM usuarios WHERE email = item->>'usuario_email';
    IF project_id IS NULL OR user_id IS NULL THEN RAISE EXCEPTION 'Relacion de rol de proyecto no resuelta'; END IF;
    INSERT INTO proyecto_roles (proyecto_id, usuario_id, tipo_raci)
    VALUES (project_id, user_id, (item->>'tipo_raci')::tipo_raci)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'asignaciones_tarea', '[]'::jsonb)) AS elements(value) LOOP
    SELECT p.id INTO project_id FROM proyectos p WHERE p.nombre = item->>'proyecto_nombre' AND coalesce(p.cliente, '') = coalesce(item->>'proyecto_cliente', '');
    SELECT t.id INTO task_id FROM tareas t WHERE t.proyecto_id = project_id AND t.nombre = item->>'tarea_nombre';
    SELECT id INTO user_id FROM usuarios WHERE email = item->>'usuario_email';
    IF task_id IS NULL OR user_id IS NULL THEN RAISE EXCEPTION 'Asignacion de tarea no resuelta'; END IF;
    INSERT INTO tarea_asignados (tarea_id, usuario_id) VALUES (task_id, user_id) ON CONFLICT DO NOTHING;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'asistentes_reunion', '[]'::jsonb)) AS elements(value) LOOP
    SELECT p.id INTO project_id FROM proyectos p WHERE p.nombre = item->>'proyecto_nombre' AND coalesce(p.cliente, '') = coalesce(item->>'proyecto_cliente', '');
    SELECT r.id INTO meeting_id FROM reuniones r WHERE r.proyecto_id = project_id AND r.nombre = item->>'reunion_nombre';
    SELECT id INTO user_id FROM usuarios WHERE email = item->>'usuario_email';
    IF meeting_id IS NULL OR user_id IS NULL THEN RAISE EXCEPTION 'Asistente de reunion no resuelto'; END IF;
    INSERT INTO reunion_asistentes (reunion_id, usuario_id) VALUES (meeting_id, user_id) ON CONFLICT DO NOTHING;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_payload->'registros_tiempo', '[]'::jsonb)) AS elements(value) LOOP
    SELECT p.id INTO project_id FROM proyectos p WHERE p.nombre = item->>'proyecto_nombre' AND coalesce(p.cliente, '') = coalesce(item->>'proyecto_cliente', '');
    SELECT t.id INTO task_id FROM tareas t WHERE t.proyecto_id = project_id AND t.nombre = item->>'tarea_nombre';
    SELECT id INTO user_id FROM usuarios WHERE email = item->>'usuario_email';
    IF task_id IS NULL OR user_id IS NULL THEN RAISE EXCEPTION 'Registro de tiempo no resuelto'; END IF;
    INSERT INTO registros_tiempo (tarea_id, usuario_id, inicio, fin)
    VALUES (task_id, user_id, (item->>'inicio')::timestamptz, nullif(item->>'fin', '')::timestamptz);
  END LOOP;

  RETURN jsonb_build_object('estado', 'ok');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
