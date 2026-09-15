-- Historical imports create business profiles only.
-- Authentication remains separate in auth.users and is created only by the
-- explicit user-creation flow with a real password supplied by the PMO.
CREATE OR REPLACE FUNCTION crear_usuario_auth_interno(
  p_nombre text, p_email text, p_rol text, p_tarifa numeric
) RETURNS uuid AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  INSERT INTO usuarios (auth_id, nombre, email, rol, tarifa_hora)
  VALUES (
    NULL,
    COALESCE(NULLIF(trim(p_nombre), ''), 'USUARIO PENDIENTE - FALTA NOMBRE'),
    p_email,
    COALESCE(NULLIF(p_rol, '')::rol_usuario, 'consultor_junior'),
    COALESCE(p_tarifa, 0)
  )
  RETURNING id INTO v_usuario_id;

  RETURN v_usuario_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
