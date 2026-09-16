-- Repair metadata on already imported projects using preserved master rows.
-- This does not insert, delete, or re-import operational records.
UPDATE proyectos AS proyecto
SET
  linea_producto = COALESCE(
    NULLIF(proyecto.linea_producto, ''),
    NULLIF(registro.datos->'raw_data'->>'product_label', ''),
    NULLIF(registro.datos->>'linea_producto', '')
  ),
  template_key = COALESCE(
    NULLIF(proyecto.template_key, ''),
    NULLIF(registro.datos->'raw_data'->>'project_template_key', ''),
    NULLIF(registro.datos->>'template_key', ''),
    CASE
      WHEN lower(COALESCE(registro.datos->'raw_data'->>'project_type', registro.datos->>'categoria', '')) LIKE '%soport%'
        THEN 'support'
      WHEN NULLIF(registro.datos->'raw_data'->>'product_label', '') IS NOT NULL
        THEN 'implementation_' || lower(regexp_replace(registro.datos->'raw_data'->>'product_label', '[^a-zA-Z0-9]+', '_', 'g'))
      ELSE NULL
    END
  )
FROM importaciones_registros_maestros AS registro
WHERE registro.entidad = 'proyecto'
  AND COALESCE(
    NULLIF(registro.datos->'raw_data'->>'project_name', ''),
    NULLIF(registro.datos->'raw_data'->>'project_name_raw', ''),
    NULLIF(registro.datos->>'nombre', '')
  ) = proyecto.nombre;

CREATE OR REPLACE FUNCTION reparar_metadatos_proyectos_existentes()
RETURNS integer AS $$
DECLARE
  v_actualizados integer;
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede reparar metadatos de proyectos';
  END IF;

  UPDATE proyectos AS proyecto
  SET
    linea_producto = COALESCE(
      NULLIF(proyecto.linea_producto, ''),
      NULLIF(registro.datos->'raw_data'->>'product_label', ''),
      NULLIF(registro.datos->>'linea_producto', '')
    ),
    template_key = COALESCE(
      NULLIF(proyecto.template_key, ''),
      NULLIF(registro.datos->'raw_data'->>'project_template_key', ''),
      NULLIF(registro.datos->>'template_key', ''),
      CASE
        WHEN lower(COALESCE(registro.datos->'raw_data'->>'project_type', registro.datos->>'categoria', '')) LIKE '%soport%'
          THEN 'support'
        WHEN NULLIF(registro.datos->'raw_data'->>'product_label', '') IS NOT NULL
          THEN 'implementation_' || lower(regexp_replace(registro.datos->'raw_data'->>'product_label', '[^a-zA-Z0-9]+', '_', 'g'))
        ELSE NULL
      END
    )
  FROM importaciones_registros_maestros AS registro
  WHERE registro.entidad = 'proyecto'
    AND COALESCE(
      NULLIF(registro.datos->'raw_data'->>'project_name', ''),
      NULLIF(registro.datos->'raw_data'->>'project_name_raw', ''),
      NULLIF(registro.datos->>'nombre', '')
    ) = proyecto.nombre;

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  RETURN v_actualizados;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
