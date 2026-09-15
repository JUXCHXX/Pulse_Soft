-- Schedule templates are immutable molds. Project schedules are copied instances.
ALTER TABLE plantillas_csv ADD COLUMN IF NOT EXISTS template_key text;

UPDATE plantillas_csv
SET template_key = CASE
  WHEN tipo = 'soporte' THEN 'support'
  ELSE 'implementation_' || lower(producto)
END
WHERE template_key IS NULL;

ALTER TABLE plantillas_csv ALTER COLUMN template_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantillas_csv_template_key ON plantillas_csv(template_key);

CREATE TABLE IF NOT EXISTS plantillas_csv_procesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id uuid NOT NULL REFERENCES plantillas_csv(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  UNIQUE (plantilla_id, nombre)
);

ALTER TABLE plantillas_csv_tareas
  ADD COLUMN IF NOT EXISTS proceso_id uuid REFERENCES plantillas_csv_procesos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duracion_ideal_dias integer,
  ADD COLUMN IF NOT EXISTS rol_sugerido text;

-- These columns belonged to the historical CSV shape, not to a schedule mold.
ALTER TABLE plantillas_csv_tareas
  DROP COLUMN IF EXISTS proyectos_fuente,
  DROP COLUMN IF EXISTS horas_observadas,
  DROP COLUMN IF EXISTS frecuencia_historica;

CREATE TABLE IF NOT EXISTS proyecto_procesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proyecto_id, nombre)
);

ALTER TABLE tareas
  ADD COLUMN IF NOT EXISTS proceso_id uuid REFERENCES proyecto_procesos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS orden integer,
  ADD COLUMN IF NOT EXISTS duracion_ideal_dias integer,
  ADD COLUMN IF NOT EXISTS rol_sugerido text;

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS template_key text;
CREATE INDEX IF NOT EXISTS idx_proyecto_procesos_proyecto ON proyecto_procesos(proyecto_id, orden);
CREATE INDEX IF NOT EXISTS idx_tareas_proceso ON tareas(proceso_id, orden);

ALTER TABLE plantillas_csv_procesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto_procesos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plantillas_csv_procesos_select" ON plantillas_csv_procesos;
CREATE POLICY "plantillas_csv_procesos_select" ON plantillas_csv_procesos FOR SELECT
  TO authenticated USING (auth_rol() IN ('pmo', 'direccion'));
DROP POLICY IF EXISTS "plantillas_csv_procesos_insert" ON plantillas_csv_procesos;
CREATE POLICY "plantillas_csv_procesos_insert" ON plantillas_csv_procesos FOR INSERT
  TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "plantillas_csv_procesos_delete" ON plantillas_csv_procesos;
CREATE POLICY "plantillas_csv_procesos_delete" ON plantillas_csv_procesos FOR DELETE
  TO authenticated USING (auth_rol() = 'pmo');

DROP POLICY IF EXISTS "proyecto_procesos_select" ON proyecto_procesos;
CREATE POLICY "proyecto_procesos_select" ON proyecto_procesos FOR SELECT
  TO authenticated USING (
    auth_rol() IN ('pmo', 'direccion') OR EXISTS (
      SELECT 1 FROM proyecto_roles pr
      WHERE pr.proyecto_id = proyecto_procesos.proyecto_id
        AND pr.usuario_id = auth_usuario_id()
    )
  );
DROP POLICY IF EXISTS "proyecto_procesos_insert" ON proyecto_procesos;
CREATE POLICY "proyecto_procesos_insert" ON proyecto_procesos FOR INSERT
  TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "proyecto_procesos_update" ON proyecto_procesos;
CREATE POLICY "proyecto_procesos_update" ON proyecto_procesos FOR UPDATE
  TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "proyecto_procesos_delete" ON proyecto_procesos;
CREATE POLICY "proyecto_procesos_delete" ON proyecto_procesos FOR DELETE
  TO authenticated USING (auth_rol() = 'pmo');

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
    RAISE EXCEPTION 'Solo la PMO puede cargar plantillas CSV';
  END IF;
  IF p_tipo NOT IN ('implementacion', 'soporte') THEN
    RAISE EXCEPTION 'Tipo de plantilla CSV no valido';
  END IF;
  IF (p_tipo = 'implementacion' AND p_producto IS NULL)
    OR (p_tipo = 'soporte' AND p_producto IS NOT NULL) THEN
    RAISE EXCEPTION 'La combinacion de tipo y producto no es valida';
  END IF;

  v_template_key := CASE
    WHEN p_tipo = 'soporte' THEN 'support'
    ELSE 'implementation_' || lower(p_producto)
  END;

  DELETE FROM plantillas_csv WHERE template_key = v_template_key;
  INSERT INTO plantillas_csv (tipo, producto, template_key, nombre_archivo, cargado_por)
  VALUES (p_tipo, p_producto, v_template_key, p_nombre_archivo, auth_usuario_id())
  RETURNING id INTO v_plantilla_id;

  INSERT INTO plantillas_csv_tareas (
    plantilla_id, orden, tarea, tipo_registro, proceso_sugerido
  )
  SELECT v_plantilla_id, item.orden, item.tarea, item.tipo_registro,
    item.proceso_sugerido
  FROM jsonb_to_recordset(coalesce(p_tareas, '[]'::jsonb)) AS item(
    orden integer, tarea text, tipo_registro text, proceso_sugerido text
  );

  INSERT INTO plantillas_csv_procesos (plantilla_id, nombre, orden)
  SELECT v_plantilla_id, proceso_sugerido, min(orden)
  FROM plantillas_csv_tareas
  WHERE plantilla_id = v_plantilla_id AND nullif(trim(proceso_sugerido), '') IS NOT NULL
  GROUP BY proceso_sugerido;

  UPDATE plantillas_csv_tareas t
  SET proceso_id = p.id
  FROM plantillas_csv_procesos p
  WHERE p.plantilla_id = t.plantilla_id
    AND p.nombre = t.proceso_sugerido
    AND t.plantilla_id = v_plantilla_id;

  SELECT count(*) INTO v_count FROM plantillas_csv_tareas WHERE plantilla_id = v_plantilla_id;
  RETURN jsonb_build_object('plantilla_id', v_plantilla_id, 'template_key', v_template_key, 'tareas', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION obtener_plantilla_csv_resumen(p_tipo text, p_producto text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_template_key text := CASE WHEN p_tipo = 'soporte' THEN 'support' ELSE 'implementation_' || lower(p_producto) END;
  v_plantilla_id uuid;
  v_tasks integer;
  v_processes integer;
BEGIN
  SELECT id INTO v_plantilla_id FROM plantillas_csv WHERE template_key = v_template_key;
  IF v_plantilla_id IS NULL THEN
    RETURN jsonb_build_object('exists', false, 'template_key', v_template_key, 'tasks', 0, 'processes', 0);
  END IF;
  SELECT count(*) INTO v_tasks FROM plantillas_csv_tareas WHERE plantilla_id = v_plantilla_id;
  SELECT count(*) INTO v_processes FROM plantillas_csv_procesos WHERE plantilla_id = v_plantilla_id;
  RETURN jsonb_build_object(
    'exists', true,
    'template_key', v_template_key,
    'tasks', v_tasks,
    'processes', v_processes,
    'structure', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'nombre', p.nombre,
        'actividades', (SELECT count(*) FROM plantillas_csv_tareas t WHERE t.proceso_id = p.id)
      ) ORDER BY p.orden, p.id)
      FROM plantillas_csv_procesos p
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
BEGIN
  IF auth_rol() <> 'pmo' THEN RAISE EXCEPTION 'Solo la PMO puede copiar plantillas CSV'; END IF;
  SELECT id INTO v_plantilla_id FROM plantillas_csv WHERE template_key = v_template_key;
  IF v_plantilla_id IS NULL THEN RETURN 0; END IF;

  UPDATE proyectos SET template_key = v_template_key WHERE id = p_proyecto_id;

  INSERT INTO proyecto_procesos (proyecto_id, nombre, orden)
  SELECT p_proyecto_id, nombre, orden
  FROM plantillas_csv_procesos
  WHERE plantilla_id = v_plantilla_id
  ORDER BY orden, id;

  INSERT INTO tareas (proyecto_id, proceso_id, orden, nombre, duracion_ideal_dias, rol_sugerido)
  SELECT p_proyecto_id, pp.id, t.orden, t.tarea, t.duracion_ideal_dias, t.rol_sugerido
  FROM plantillas_csv_tareas t
  LEFT JOIN plantillas_csv_procesos tp ON tp.id = t.proceso_id
  LEFT JOIN proyecto_procesos pp ON pp.proyecto_id = p_proyecto_id AND pp.nombre = tp.nombre
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
  DELETE FROM plantillas_tareas WHERE true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
