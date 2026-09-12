/*
# La importación desde Excel debe ser atómica

La versión inicial de importar_datos captura errores por fila para incluirlos
en el resultado. Eso deja los inserts correctos persistidos y contradice la
promesa de "todo o nada". Conservamos el detalle producido por la función
original, pero lo convertimos en una excepción antes de devolver la RPC; al
elevarla, PostgreSQL revierte toda la transacción de la llamada.
*/

ALTER FUNCTION public.importar_datos(jsonb) RENAME TO importar_datos_interno;

CREATE OR REPLACE FUNCTION public.importar_datos(payload jsonb)
RETURNS jsonb AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.importar_datos_interno(payload);

  IF jsonb_array_length(COALESCE(v_resultado->'errores', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'La importación contiene errores y fue revertida por completo: %', v_resultado->'errores';
  END IF;

  RETURN v_resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
