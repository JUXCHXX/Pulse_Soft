-- CSV task templates replace the legacy templates for new project creation.
CREATE TABLE IF NOT EXISTS plantillas_csv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('implementacion', 'soporte')),
  producto text NULL CHECK (producto IN ('Campuspack', 'Schoolpack', 'Language')),
  nombre_archivo text NOT NULL,
  cargado_por uuid REFERENCES usuarios(id),
  cargado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plantillas_csv_producto_tipo_check CHECK (
    (tipo = 'implementacion' AND producto IS NOT NULL)
    OR (tipo = 'soporte' AND producto IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plantillas_csv_tipo_producto
  ON plantillas_csv (tipo, producto) WHERE producto IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantillas_csv_soporte
  ON plantillas_csv (tipo) WHERE tipo = 'soporte';

CREATE TABLE IF NOT EXISTS plantillas_csv_tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id uuid NOT NULL REFERENCES plantillas_csv(id) ON DELETE CASCADE,
  orden integer NOT NULL,
  tarea text NOT NULL,
  tipo_registro text,
  proceso_sugerido text,
  proyectos_fuente text,
  horas_observadas text,
  frecuencia_historica integer
);
CREATE INDEX IF NOT EXISTS idx_plantillas_csv_tareas_orden
  ON plantillas_csv_tareas(plantilla_id, orden);

ALTER TABLE plantillas_csv ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_csv_tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plantillas_csv_select" ON plantillas_csv;
CREATE POLICY "plantillas_csv_select" ON plantillas_csv FOR SELECT
  TO authenticated USING (auth_rol() IN ('pmo', 'direccion'));
DROP POLICY IF EXISTS "plantillas_csv_insert" ON plantillas_csv;
CREATE POLICY "plantillas_csv_insert" ON plantillas_csv FOR INSERT
  TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "plantillas_csv_update" ON plantillas_csv;
CREATE POLICY "plantillas_csv_update" ON plantillas_csv FOR UPDATE
  TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "plantillas_csv_delete" ON plantillas_csv;
CREATE POLICY "plantillas_csv_delete" ON plantillas_csv FOR DELETE
  TO authenticated USING (auth_rol() = 'pmo');

DROP POLICY IF EXISTS "plantillas_csv_tareas_select" ON plantillas_csv_tareas;
CREATE POLICY "plantillas_csv_tareas_select" ON plantillas_csv_tareas FOR SELECT
  TO authenticated USING (auth_rol() IN ('pmo', 'direccion'));
DROP POLICY IF EXISTS "plantillas_csv_tareas_insert" ON plantillas_csv_tareas;
CREATE POLICY "plantillas_csv_tareas_insert" ON plantillas_csv_tareas FOR INSERT
  TO authenticated WITH CHECK (auth_rol() = 'pmo');
DROP POLICY IF EXISTS "plantillas_csv_tareas_delete" ON plantillas_csv_tareas;
CREATE POLICY "plantillas_csv_tareas_delete" ON plantillas_csv_tareas FOR DELETE
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

  DELETE FROM plantillas_csv
  WHERE tipo = p_tipo
    AND plantillas_csv.producto IS NOT DISTINCT FROM p_producto;

  INSERT INTO plantillas_csv (tipo, producto, nombre_archivo, cargado_por)
  VALUES (p_tipo, p_producto, p_nombre_archivo, auth_usuario_id())
  RETURNING id INTO v_plantilla_id;

  INSERT INTO plantillas_csv_tareas (
    plantilla_id, orden, tarea, tipo_registro, proceso_sugerido,
    proyectos_fuente, horas_observadas, frecuencia_historica
  )
  SELECT
    v_plantilla_id, item.orden, item.tarea, item.tipo_registro,
    item.proceso_sugerido, item.proyectos_fuente, item.horas_observadas,
    item.frecuencia_historica
  FROM jsonb_to_recordset(coalesce(p_tareas, '[]'::jsonb)) AS item(
    orden integer,
    tarea text,
    tipo_registro text,
    proceso_sugerido text,
    proyectos_fuente text,
    horas_observadas text,
    frecuencia_historica integer
  );

  SELECT count(*) INTO v_count
  FROM plantillas_csv_tareas WHERE plantilla_id = v_plantilla_id;

  RETURN jsonb_build_object('plantilla_id', v_plantilla_id, 'tareas', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION copiar_plantilla_csv_tareas(
  p_proyecto_id uuid,
  p_tipo text,
  p_producto text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
  v_plantilla_id uuid;
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede copiar plantillas CSV';
  END IF;

  SELECT id INTO v_plantilla_id
  FROM plantillas_csv
  WHERE tipo = p_tipo
    AND producto IS NOT DISTINCT FROM p_producto;

  IF v_plantilla_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO tareas (proyecto_id, nombre)
  SELECT p_proyecto_id, tarea
  FROM plantillas_csv_tareas
  WHERE plantilla_id = v_plantilla_id
  ORDER BY orden, id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
