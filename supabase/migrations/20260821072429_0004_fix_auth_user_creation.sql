/*
# Fix crear_usuario_auth functions — generate UUID explicitly

The auth.users table doesn't have a default UUID in some Supabase versions,
so we need to generate one explicitly with gen_random_uuid().

Also, the legacy password helpers rely on pgcrypto; ensure the extension is
enabled before calling gen_salt() or crypt().
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop and recreate both functions
DROP FUNCTION IF EXISTS crear_usuario_auth(text, text, text, text, numeric);
DROP FUNCTION IF EXISTS crear_usuario_auth_interno(text, text, text, numeric);

CREATE OR REPLACE FUNCTION crear_usuario_auth_interno(
  p_nombre text, p_email text, p_rol text, p_tarifa numeric
) RETURNS uuid AS $$
DECLARE
  v_auth_id uuid := gen_random_uuid();
  v_usuario_id uuid;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_auth_id,
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    p_email, crypt('Pulsesoft2026!', gen_salt('bf')), now(),
    jsonb_build_object('provider','email','providers',to_jsonb(array['email'])),
    jsonb_build_object('nombre', p_nombre), now(), now()
  );

  INSERT INTO usuarios (auth_id, nombre, email, rol, tarifa_hora)
  VALUES (v_auth_id, p_nombre, p_email, p_rol::rol_usuario, COALESCE(p_tarifa, 0))
  RETURNING id INTO v_usuario_id;

  RETURN v_usuario_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crear_usuario_auth(
  p_nombre text, p_email text, p_password text, p_rol text, p_tarifa numeric DEFAULT 0
) RETURNS uuid AS $$
DECLARE
  v_auth_id uuid := gen_random_uuid();
  v_usuario_id uuid;
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede crear usuarios';
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_auth_id,
    '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    p_email, crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider','email','providers',to_jsonb(array['email'])),
    jsonb_build_object('nombre', p_nombre), now(), now()
  );

  INSERT INTO usuarios (auth_id, nombre, email, rol, tarifa_hora)
  VALUES (v_auth_id, p_nombre, p_email, p_rol::rol_usuario, p_tarifa)
  RETURNING id INTO v_usuario_id;

  RETURN v_usuario_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
