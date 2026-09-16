-- Read-model corrections for data already imported.
-- No rows are inserted, deleted, or re-imported.
CREATE OR REPLACE VIEW vw_carga_consultor AS
SELECT
  u.id AS usuario_id,
  u.nombre,
  u.rol,
  count(t.id) FILTER (WHERE t.estado <> 'hecho') AS tareas_asignadas_activas,
  count(t.id) FILTER (WHERE t.estado <> 'hecho' AND t.fecha_limite < current_date) AS tareas_atrasadas,
  COALESCE((
    SELECT sum(rt.duracion_segundos) / 3600.0
    FROM registros_tiempo rt
    WHERE rt.usuario_id = u.id
  ), 0) AS horas_registradas_totales
FROM usuarios u
LEFT JOIN tarea_asignados ta ON ta.usuario_id = u.id
LEFT JOIN tareas t ON t.id = ta.tarea_id
GROUP BY u.id, u.nombre, u.rol;

CREATE OR REPLACE VIEW vw_proyecto_resumen AS
SELECT
  p.id AS proyecto_id,
  p.nombre,
  p.estado,
  p.prioridad,
  p.valor_estimado,
  count(t.id) AS total_tareas,
  count(t.id) FILTER (WHERE t.estado = 'hecho') AS tareas_completadas,
  count(t.id) FILTER (WHERE t.fecha_limite < current_date AND t.estado <> 'hecho') AS tareas_atrasadas,
  round((count(t.id) FILTER (WHERE t.estado = 'hecho')::numeric / nullif(count(t.id), 0)) * 100, 2) AS progreso_pct,
  COALESCE(sum(vtc.costo_real), 0) AS costo_real_total,
  p.linea_producto,
  p.template_key
FROM proyectos p
LEFT JOIN tareas t ON t.proyecto_id = p.id
LEFT JOIN vw_tarea_costo vtc ON vtc.tarea_id = t.id
GROUP BY p.id, p.nombre, p.estado, p.prioridad, p.valor_estimado, p.linea_producto, p.template_key;
