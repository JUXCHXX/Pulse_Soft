-- Functional controls for existing assignments, profiles, and time tracking.
-- Reuses tarea_asignados and registros_tiempo; no historical rows are recreated.
ALTER TABLE registros_tiempo
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'finalizado',
  ADD COLUMN IF NOT EXISTS tiempo_acumulado_segundos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pausado_en timestamptz;

CREATE INDEX IF NOT EXISTS idx_registros_tiempo_estado ON registros_tiempo(estado);

CREATE OR REPLACE VIEW vw_cronometros_activos AS
SELECT
  registro.id AS registro_id,
  usuario.id AS usuario_id,
  usuario.nombre AS consultor,
  tarea.id AS tarea_id,
  tarea.nombre AS tarea,
  proyecto.id AS proyecto_id,
  proyecto.nombre AS proyecto,
  registro.inicio,
  registro.tiempo_acumulado_segundos
    + CASE WHEN registro.estado = 'en_curso' THEN extract(epoch FROM (now() - registro.inicio))::integer ELSE 0 END AS segundos_transcurridos,
  registro.estado,
  tarea.tiempo_estimado_horas AS tiempo_ideal_horas,
  registro.tiempo_acumulado_segundos
FROM registros_tiempo AS registro
JOIN usuarios AS usuario ON usuario.id = registro.usuario_id
JOIN tareas AS tarea ON tarea.id = registro.tarea_id
JOIN proyectos AS proyecto ON proyecto.id = tarea.proyecto_id
WHERE registro.fin IS NULL AND registro.estado IN ('en_curso', 'pausado');

DROP POLICY IF EXISTS "tarea_asignados_update" ON tarea_asignados;
CREATE POLICY "tarea_asignados_update" ON tarea_asignados FOR UPDATE
  TO authenticated USING (auth_rol() = 'pmo') WITH CHECK (auth_rol() = 'pmo');

CREATE OR REPLACE FUNCTION actualizar_usuario_perfil(
  p_usuario_id uuid,
  p_nombre text,
  p_email text,
  p_rol text,
  p_tarifa numeric,
  p_activo boolean
)
RETURNS usuarios AS $$
DECLARE
  v_usuario usuarios;
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede editar perfiles';
  END IF;

  UPDATE usuarios AS perfil
  SET nombre = NULLIF(trim(p_nombre), ''),
      email = lower(NULLIF(trim(p_email), '')),
      rol = p_rol::rol_usuario,
      tarifa_hora = COALESCE(p_tarifa, 0),
      activo = COALESCE(p_activo, true)
  WHERE perfil.id = p_usuario_id
  RETURNING perfil.* INTO v_usuario;

  IF v_usuario.id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  IF v_usuario.auth_id IS NOT NULL THEN
    UPDATE auth.users AS cuenta
    SET email = v_usuario.email,
        raw_user_meta_data = COALESCE(cuenta.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nombre', v_usuario.nombre),
        updated_at = now()
    WHERE cuenta.id = v_usuario.auth_id;
  END IF;

  RETURN v_usuario;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

CREATE OR REPLACE FUNCTION asignar_tarea_a_usuarios(p_tarea_id uuid, p_usuario_ids uuid[])
RETURNS void AS $$
BEGIN
  IF auth_rol() <> 'pmo' THEN RAISE EXCEPTION 'Solo la PMO puede asignar tareas'; END IF;
  DELETE FROM tarea_asignados WHERE tarea_id = p_tarea_id;
  INSERT INTO tarea_asignados (tarea_id, usuario_id)
  SELECT p_tarea_id, asignacion.usuario_id
  FROM unnest(COALESCE(p_usuario_ids, '{}'::uuid[])) AS asignacion(usuario_id)
  ON CONFLICT (tarea_id, usuario_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION iniciar_cronometro_tarea(p_tarea_id uuid)
RETURNS registros_tiempo AS $$
DECLARE
  v_usuario_id uuid := auth_usuario_id();
  v_registro registros_tiempo;
BEGIN
  IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'Perfil de usuario no encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tarea_asignados WHERE tarea_id = p_tarea_id AND usuario_id = v_usuario_id) AND auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'La tarea no esta asignada a este usuario';
  END IF;
  IF EXISTS (SELECT 1 FROM registros_tiempo WHERE usuario_id = v_usuario_id AND fin IS NULL AND estado IN ('en_curso','pausado')) THEN
    RAISE EXCEPTION 'Ya existe un cronometro activo para este usuario';
  END IF;
  INSERT INTO registros_tiempo (tarea_id, usuario_id, inicio, estado, tiempo_acumulado_segundos)
  VALUES (p_tarea_id, v_usuario_id, now(), 'en_curso', 0)
  RETURNING * INTO v_registro;
  RETURN v_registro;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION pausar_cronometro(p_registro_id uuid)
RETURNS registros_tiempo AS $$
DECLARE v_registro registros_tiempo;
BEGIN
  UPDATE registros_tiempo AS registro
  SET tiempo_acumulado_segundos = registro.tiempo_acumulado_segundos + extract(epoch FROM (now() - registro.inicio))::integer,
      pausado_en = now(), estado = 'pausado'
  WHERE registro.id = p_registro_id AND registro.usuario_id = auth_usuario_id() AND registro.fin IS NULL AND registro.estado = 'en_curso'
  RETURNING registro.* INTO v_registro;
  IF v_registro.id IS NULL THEN RAISE EXCEPTION 'Cronometro no encontrado o no pertenece al usuario'; END IF;
  RETURN v_registro;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION continuar_cronometro(p_registro_id uuid)
RETURNS registros_tiempo AS $$
DECLARE v_registro registros_tiempo;
BEGIN
  UPDATE registros_tiempo AS registro
  SET inicio = now(), pausado_en = NULL, estado = 'en_curso'
  WHERE registro.id = p_registro_id AND registro.usuario_id = auth_usuario_id() AND registro.fin IS NULL AND registro.estado = 'pausado'
  RETURNING registro.* INTO v_registro;
  IF v_registro.id IS NULL THEN RAISE EXCEPTION 'Cronometro pausado no encontrado'; END IF;
  RETURN v_registro;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION finalizar_cronometro(p_registro_id uuid)
RETURNS registros_tiempo AS $$
DECLARE v_registro registros_tiempo;
BEGIN
  UPDATE registros_tiempo AS registro
  SET tiempo_acumulado_segundos = CASE WHEN registro.estado = 'en_curso' THEN registro.tiempo_acumulado_segundos + extract(epoch FROM (now() - registro.inicio))::integer ELSE registro.tiempo_acumulado_segundos END,
      fin = now(), estado = 'finalizado'
  WHERE registro.id = p_registro_id AND registro.usuario_id = auth_usuario_id() AND registro.fin IS NULL
  RETURNING registro.* INTO v_registro;
  IF v_registro.id IS NULL THEN RAISE EXCEPTION 'Cronometro no encontrado o no pertenece al usuario'; END IF;
  RETURN v_registro;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'registros_tiempo'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE registros_tiempo;
  END IF;
END;
$$;
