/*
  Keep the import function consistent: every array loop below receives jsonb
  from jsonb_array_elements, so ->> is valid for every row variable.
  Error details include the import block before the atomic wrapper raises them.
*/

CREATE OR REPLACE FUNCTION public.importar_datos_interno(payload jsonb)
RETURNS jsonb AS $$
DECLARE
  v_importacion_id uuid;
  v_realizado_por uuid := auth_usuario_id();
  v_creados int := 0;
  v_actualizados int := 0;
  v_omitidos int := 0;
  v_errores jsonb := '[]'::jsonb;
  v_usuario_rec jsonb;
  v_usuario_id uuid;
  v_proyecto_rec jsonb;
  v_proyecto_id uuid;
  v_tarea_rec jsonb;
  v_tarea_id uuid;
  v_reunion_rec jsonb;
  v_reunion_id uuid;
  v_com_rec jsonb;
  v_email text;
  v_responsable_id uuid;
  v_asignado_id uuid;
  v_asistente_id uuid;
  v_categoria categoria_proyecto;
  v_estado estado_proyecto;
  v_prioridad prioridad_nivel;
  v_estado_t estado_tarea;
  v_prioridad_t prioridad_nivel;
  v_tipo_r tipo_reunion;
  v_tipo_c tipo_comunicacion;
BEGIN
  IF auth_rol() <> 'pmo' THEN
    RAISE EXCEPTION 'Solo la PMO puede importar datos';
  END IF;

  INSERT INTO importaciones (realizado_por, nombre_archivo, estado)
  VALUES (v_realizado_por, COALESCE(payload->>'nombre_archivo', 'sin_nombre.xlsx'), 'completado')
  RETURNING id INTO v_importacion_id;

  -- USUARIOS
  IF payload ? 'usuarios' THEN
    FOR v_usuario_rec IN SELECT value FROM jsonb_array_elements(payload->'usuarios') AS elements(value)
    LOOP
      BEGIN
        SELECT id INTO v_usuario_id FROM usuarios WHERE email = v_usuario_rec->>'email';
        IF v_usuario_id IS NULL THEN
          v_usuario_id := crear_usuario_auth_interno(
            v_usuario_rec->>'nombre', v_usuario_rec->>'email', v_usuario_rec->>'rol',
            (v_usuario_rec->>'tarifa_hora')::numeric
          );
          v_creados := v_creados + 1;
        ELSE
          UPDATE usuarios SET
            nombre = COALESCE(v_usuario_rec->>'nombre', nombre),
            rol = COALESCE((v_usuario_rec->>'rol')::rol_usuario, rol),
            tarifa_hora = COALESCE((v_usuario_rec->>'tarifa_hora')::numeric, tarifa_hora)
          WHERE id = v_usuario_id;
          v_actualizados := v_actualizados + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_omitidos := v_omitidos + 1;
        v_errores := v_errores || jsonb_build_object(
          'tabla', 'usuarios', 'bloque', 'usuarios', 'email', v_usuario_rec->>'email',
          'error', format('Error insertando en usuarios: %s', SQLERRM)
        );
      END;
    END LOOP;
  END IF;

  -- PROYECTOS Y ROLES RACI
  IF payload ? 'proyectos' THEN
    FOR v_proyecto_rec IN SELECT value FROM jsonb_array_elements(payload->'proyectos') AS elements(value)
    LOOP
      BEGIN
        v_categoria := COALESCE((v_proyecto_rec->>'categoria')::categoria_proyecto, 'implementacion');
        v_estado := COALESCE((v_proyecto_rec->>'estado')::estado_proyecto, 'no_iniciado');
        v_prioridad := COALESCE((v_proyecto_rec->>'prioridad')::prioridad_nivel, 'media');

        SELECT id INTO v_proyecto_id FROM proyectos
        WHERE nombre = v_proyecto_rec->>'nombre'
          AND COALESCE(cliente, '') = COALESCE(v_proyecto_rec->>'cliente', '');

        IF v_proyecto_id IS NULL THEN
          INSERT INTO proyectos (
            nombre, descripcion, categoria, linea_producto, estado, prioridad,
            fecha_inicio, fecha_limite, valor_estimado, cliente, created_by
          ) VALUES (
            v_proyecto_rec->>'nombre', v_proyecto_rec->>'descripcion', v_categoria,
            v_proyecto_rec->>'linea_producto', v_estado, v_prioridad,
            NULLIF(v_proyecto_rec->>'fecha_inicio', '')::date,
            NULLIF(v_proyecto_rec->>'fecha_limite', '')::date,
            NULLIF(v_proyecto_rec->>'valor_estimado', '')::numeric,
            v_proyecto_rec->>'cliente', v_realizado_por
          ) RETURNING id INTO v_proyecto_id;
          v_creados := v_creados + 1;
        ELSE
          UPDATE proyectos SET
            descripcion = COALESCE(v_proyecto_rec->>'descripcion', descripcion),
            categoria = v_categoria, estado = v_estado, prioridad = v_prioridad,
            fecha_inicio = COALESCE(NULLIF(v_proyecto_rec->>'fecha_inicio', '')::date, fecha_inicio),
            fecha_limite = COALESCE(NULLIF(v_proyecto_rec->>'fecha_limite', '')::date, fecha_limite),
            valor_estimado = COALESCE(NULLIF(v_proyecto_rec->>'valor_estimado', '')::numeric, valor_estimado)
          WHERE id = v_proyecto_id;
          v_actualizados := v_actualizados + 1;
        END IF;

        IF v_proyecto_rec ? 'responsable_email' AND v_proyecto_rec->>'responsable_email' <> '' THEN
          SELECT id INTO v_responsable_id FROM usuarios WHERE email = v_proyecto_rec->>'responsable_email';
          IF v_responsable_id IS NOT NULL THEN
            INSERT INTO proyecto_roles (proyecto_id, usuario_id, tipo_raci)
            VALUES (v_proyecto_id, v_responsable_id, 'responsable')
            ON CONFLICT (proyecto_id, usuario_id, tipo_raci) DO NOTHING;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_omitidos := v_omitidos + 1;
        v_errores := v_errores || jsonb_build_object(
          'tabla', 'proyectos', 'bloque', 'proyectos/proyecto_roles', 'nombre', v_proyecto_rec->>'nombre',
          'error', format('Error insertando en proyectos/proyecto_roles: %s', SQLERRM)
        );
      END;
    END LOOP;
  END IF;

  -- TAREAS Y ASIGNACIONES
  IF payload ? 'tareas' THEN
    FOR v_tarea_rec IN SELECT value FROM jsonb_array_elements(payload->'tareas') AS elements(value)
    LOOP
      BEGIN
        v_estado_t := COALESCE((v_tarea_rec->>'estado')::estado_tarea, 'no_iniciado');
        v_prioridad_t := COALESCE((v_tarea_rec->>'prioridad')::prioridad_nivel, 'media');

        SELECT id INTO v_proyecto_id FROM proyectos
        WHERE nombre = v_tarea_rec->>'proyecto_nombre'
          AND COALESCE(cliente, '') = COALESCE(v_tarea_rec->>'proyecto_cliente', '');

        IF v_proyecto_id IS NULL THEN
          v_omitidos := v_omitidos + 1;
          v_errores := v_errores || jsonb_build_object(
            'tabla', 'tareas', 'bloque', 'tareas', 'nombre', v_tarea_rec->>'nombre',
            'error', 'Error insertando en tareas: Proyecto no encontrado'
          );
          CONTINUE;
        END IF;

        SELECT id INTO v_tarea_id FROM tareas
        WHERE proyecto_id = v_proyecto_id AND nombre = v_tarea_rec->>'nombre';

        IF v_tarea_id IS NULL THEN
          INSERT INTO tareas (
            proyecto_id, nombre, descripcion, estado, prioridad,
            fecha_inicio, fecha_limite, tiempo_estimado_horas
          ) VALUES (
            v_proyecto_id, v_tarea_rec->>'nombre', v_tarea_rec->>'descripcion',
            v_estado_t, v_prioridad_t,
            NULLIF(v_tarea_rec->>'fecha_inicio', '')::date,
            NULLIF(v_tarea_rec->>'fecha_limite', '')::date,
            NULLIF(v_tarea_rec->>'tiempo_estimado_horas', '')::numeric
          ) RETURNING id INTO v_tarea_id;
          v_creados := v_creados + 1;
        ELSE
          UPDATE tareas SET
            descripcion = COALESCE(v_tarea_rec->>'descripcion', descripcion),
            estado = v_estado_t, prioridad = v_prioridad_t,
            fecha_limite = COALESCE(NULLIF(v_tarea_rec->>'fecha_limite', '')::date, fecha_limite),
            tiempo_estimado_horas = COALESCE(NULLIF(v_tarea_rec->>'tiempo_estimado_horas', '')::numeric, tiempo_estimado_horas)
          WHERE id = v_tarea_id;
          v_actualizados := v_actualizados + 1;
        END IF;

        IF v_tarea_rec ? 'asignados_emails' THEN
          FOR v_email IN SELECT jsonb_array_elements_text(v_tarea_rec->'asignados_emails')
          LOOP
            SELECT id INTO v_asignado_id FROM usuarios WHERE email = v_email;
            IF v_asignado_id IS NOT NULL THEN
              INSERT INTO tarea_asignados (tarea_id, usuario_id)
              VALUES (v_tarea_id, v_asignado_id)
              ON CONFLICT (tarea_id, usuario_id) DO NOTHING;
            END IF;
          END LOOP;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_omitidos := v_omitidos + 1;
        v_errores := v_errores || jsonb_build_object(
          'tabla', 'tareas', 'bloque', 'tareas/tarea_asignados', 'nombre', v_tarea_rec->>'nombre',
          'error', format('Error insertando en tareas/tarea_asignados: %s', SQLERRM)
        );
      END;
    END LOOP;
  END IF;

  -- REUNIONES Y ASISTENTES
  IF payload ? 'reuniones' THEN
    FOR v_reunion_rec IN SELECT value FROM jsonb_array_elements(payload->'reuniones') AS elements(value)
    LOOP
      BEGIN
        v_tipo_r := COALESCE((v_reunion_rec->>'tipo')::tipo_reunion, 'seguimiento');

        SELECT id INTO v_proyecto_id FROM proyectos
        WHERE nombre = v_reunion_rec->>'proyecto_nombre'
          AND COALESCE(cliente, '') = COALESCE(v_reunion_rec->>'proyecto_cliente', '');

        IF v_proyecto_id IS NULL THEN
          v_omitidos := v_omitidos + 1;
          v_errores := v_errores || jsonb_build_object(
            'tabla', 'reuniones', 'bloque', 'reuniones', 'nombre', v_reunion_rec->>'nombre',
            'error', 'Error insertando en reuniones: Proyecto no encontrado'
          );
          CONTINUE;
        END IF;

        INSERT INTO reuniones (proyecto_id, nombre, tipo, estado, fecha, hora, notas, created_by)
        VALUES (
          v_proyecto_id, v_reunion_rec->>'nombre', v_tipo_r,
          COALESCE(v_reunion_rec->>'estado', 'programada'),
          NULLIF(v_reunion_rec->>'fecha', '')::date,
          NULLIF(v_reunion_rec->>'hora', '')::time,
          v_reunion_rec->>'notas', v_realizado_por
        ) RETURNING id INTO v_reunion_id;
        v_creados := v_creados + 1;

        IF v_reunion_rec ? 'asistentes_emails' THEN
          FOR v_email IN SELECT jsonb_array_elements_text(v_reunion_rec->'asistentes_emails')
          LOOP
            SELECT id INTO v_asistente_id FROM usuarios WHERE email = v_email;
            IF v_asistente_id IS NOT NULL THEN
              INSERT INTO reunion_asistentes (reunion_id, usuario_id)
              VALUES (v_reunion_id, v_asistente_id)
              ON CONFLICT (reunion_id, usuario_id) DO NOTHING;
            END IF;
          END LOOP;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_omitidos := v_omitidos + 1;
        v_errores := v_errores || jsonb_build_object(
          'tabla', 'reuniones', 'bloque', 'reuniones/reunion_asistentes', 'nombre', v_reunion_rec->>'nombre',
          'error', format('Error insertando en reuniones/reunion_asistentes: %s', SQLERRM)
        );
      END;
    END LOOP;
  END IF;

  -- COMUNICACIONES
  IF payload ? 'comunicaciones' THEN
    FOR v_com_rec IN SELECT value FROM jsonb_array_elements(payload->'comunicaciones') AS elements(value)
    LOOP
      BEGIN
        v_tipo_c := COALESCE((v_com_rec->>'tipo')::tipo_comunicacion, 'otro');

        SELECT id INTO v_proyecto_id FROM proyectos
        WHERE nombre = v_com_rec->>'proyecto_nombre'
          AND COALESCE(cliente, '') = COALESCE(v_com_rec->>'proyecto_cliente', '');

        IF v_proyecto_id IS NULL THEN
          v_omitidos := v_omitidos + 1;
          v_errores := v_errores || jsonb_build_object(
            'tabla', 'comunicaciones', 'bloque', 'comunicaciones',
            'error', 'Error insertando en comunicaciones: Proyecto no encontrado'
          );
          CONTINUE;
        END IF;

        SELECT id INTO v_usuario_id FROM usuarios WHERE email = v_com_rec->>'usuario_email';

        INSERT INTO comunicaciones (proyecto_id, usuario_id, tipo, fecha, resultado, notas)
        VALUES (
          v_proyecto_id, v_usuario_id, v_tipo_c,
          COALESCE(NULLIF(v_com_rec->>'fecha', '')::date, current_date),
          v_com_rec->>'resultado', v_com_rec->>'notas'
        );
        v_creados := v_creados + 1;
      EXCEPTION WHEN OTHERS THEN
        v_omitidos := v_omitidos + 1;
        v_errores := v_errores || jsonb_build_object(
          'tabla', 'comunicaciones', 'bloque', 'comunicaciones',
          'error', format('Error insertando en comunicaciones: %s', SQLERRM)
        );
      END;
    END LOOP;
  END IF;

  UPDATE importaciones SET
    filas_creadas = v_creados,
    filas_actualizadas = v_actualizados,
    filas_omitidas = v_omitidos,
    detalle_errores = v_errores
  WHERE id = v_importacion_id;

  RETURN jsonb_build_object(
    'importacion_id', v_importacion_id,
    'creados', v_creados,
    'actualizados', v_actualizados,
    'omitidos', v_omitidos,
    'errores', v_errores
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
