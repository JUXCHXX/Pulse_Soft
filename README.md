# Pulsesoft

Sistema interno de gestion de proyectos para una PMO. Pulsesoft reemplaza un
flujo operativo basado en Excel y centraliza proyectos, tareas, asignaciones,
tiempo registrado, costos, reuniones, comunicaciones y reportes.

Este documento describe el estado actual del sistema y esta pensado como
contexto tecnico para cualquier persona o inteligencia artificial que tenga
que mantenerlo o extenderlo.

## Resumen rapido

- Frontend: React 18 + TypeScript + Vite.
- Estilos: Tailwind CSS y variables CSS definidas en `src/index.css`.
- Navegacion: React Router.
- Backend y base de datos: Supabase Auth, PostgreSQL, RLS, vistas y funciones RPC.
- Graficas: Recharts.
- Lectura de Excel: SheetJS (`xlsx`) en el navegador.
- Asistente: Supabase Edge Function + Groq para LLM, speech-to-text y text-to-speech.
- Idioma funcional: espanol. Moneda mostrada: MXN.

## Como arrancar el proyecto

Requisitos: Node.js, pnpm y un proyecto Supabase configurado.

```bash
pnpm install
pnpm dev
```

Comandos disponibles:

```bash
pnpm build       # Compilacion de produccion
pnpm typecheck   # TypeScript sin emitir archivos
pnpm lint        # ESLint
pnpm preview     # Servir el build localmente
```

Variables de entorno del frontend (`.env`):

```env
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

La Edge Function necesita en Supabase:

```env
GROQ_API_KEY=<groq-key>
SUPABASE_URL=<supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

No se debe exponer `SUPABASE_SERVICE_ROLE_KEY` en el frontend.

## Arquitectura de ejecucion

El punto de entrada es `src/main.tsx`. Monta `App`, que envuelve la aplicacion
en este orden:

1. `ThemeProvider`: tema claro/oscuro.
2. `AuthProvider`: sesion de Supabase y perfil de `usuarios`.
3. `BrowserRouter`: rutas de la aplicacion.

`src/App.tsx` separa las rutas publicas y protegidas. Si no hay sesion, todo
lo que no sea `/login` redirige a login. Con sesion, las paginas se renderizan
dentro de `src/components/AppShell.tsx`, que contiene sidebar, topbar y el
`Outlet` principal.

El cliente de Supabase vive en `src/lib/supabase.ts` y usa:

- `persistSession: true`
- `autoRefreshToken: true`
- `detectSessionInUrl: true`

`src/context/AuthContext.tsx` obtiene la sesion con `getSession()`, escucha
`onAuthStateChange` y carga el registro de `usuarios` cuyo `auth_id` coincide
con `session.user.id`. El frontend usa ese perfil para mostrar el usuario y
decidir elementos de interfaz, pero la autorizacion real debe venir de RLS y
de las funciones SQL.

## Estructura del repositorio

```text
src/
	App.tsx                 Rutas y providers
	main.tsx                Punto de entrada React
	index.css               Tema y estilos globales
	components/             Shell, avatar, badges y componentes reutilizables
	context/                AuthContext y ThemeContext
	lib/
		constants.ts          Roles, estados, prioridades y etiquetas visuales
		format.ts             Formateo de fechas, moneda, horas y duraciones
		supabase.ts           Cliente Supabase
		types.ts              Interfaces TypeScript del dominio y vistas
	pages/                  Pantallas funcionales
supabase/
	migrations/             Esquema, RLS, funciones y correcciones incrementales
	functions/asistente-ia/ Edge Function del asistente
```

## Rutas y estado funcional

| Ruta | Pantalla | Fuente principal de datos |
| --- | --- | --- |
| `/login` | Inicio de sesion | Supabase Auth |
| `/dashboard` | Indicadores generales | `vw_proyecto_resumen`, `vw_carga_consultor`, `vw_cronometros_activos` y tareas |
| `/proyectos` | Lista y filtros de proyectos | `vw_proyecto_resumen` |
| `/proyectos/:id` | Detalle, tareas y RACI | `proyectos`, `tareas`, `proyecto_roles`, `vw_proyecto_resumen` |
| `/tareas` | Tareas, filtros y cronometro | `tareas`, `tarea_asignados`, `registros_tiempo` |
| `/calendario` | Tareas vencimiento y reuniones por mes | `tareas`, `reuniones` |
| `/tiempo` | Historial de tiempo del usuario | `registros_tiempo`, `vw_cronometros_activos` |
| `/equipo` | Usuarios y carga | `usuarios`, `vw_carga_consultor` |
| `/reportes` | Costos, carga e importaciones | `vw_proyecto_resumen`, `vw_carga_consultor`, `importaciones` |
| `/mensajes` | Mensajes | Revisar la implementacion antes de extenderla |
| `/configuracion` | Plantillas, importacion y tema | `plantillas_tareas` y RPC `importar_datos` |
| `/asistente` | Chat y voz para PMO | Edge Function `asistente-ia` |

La mayoria de las paginas carga datos en `useEffect`, mantiene el resultado en
estado local y vuelve a consultar despues de una mutacion. No existe una capa
global de cache ni un repositorio frontend separado.

## Modelo de datos de Supabase

El esquema se crea principalmente en
`supabase/migrations/20260821071356_0001_pulsesoft_schema.sql`.

### Tablas principales

- `usuarios`: perfil interno vinculado a `auth.users` mediante `auth_id`, con
	rol, tarifa por hora y estado activo.
- `tarifas_historial`: historial de tarifas por usuario.
- `proyectos`: nombre, cliente, categoria, estado, prioridad, fechas y valor
	estimado.
- `proyecto_roles`: relacion RACI entre proyectos y usuarios.
- `plantillas_tareas`: tareas reutilizables por categoria.
- `tareas`: tareas de un proyecto, estado, prioridad, fechas y estimacion.
- `tarea_asignados`: asignacion multiple de usuarios a tareas.
- `registros_tiempo`: sesiones del cronometro. `fin = null` significa activa.
- `reportes_semanales` y `reportes_semanales_detalle`: reportes por consultor.
- `reuniones` y `reunion_asistentes`: agenda y asistentes.
- `comunicaciones`: llamadas, correos y mensajes asociados a proyectos.
- `importaciones`: auditoria de cargas, conteos y errores.

Relaciones importantes:

```text
usuarios 1---N proyectos (created_by)
usuarios N---N proyectos (proyecto_roles, RACI)
proyectos 1---N tareas
usuarios N---N tareas (tarea_asignados)
tareas 1---N registros_tiempo
proyectos 1---N reuniones
reuniones N---N usuarios (reunion_asistentes)
proyectos 1---N comunicaciones
```

### Vistas calculadas

El frontend consume estas vistas para no recalcular indicadores complejos:

- `vw_tarea_costo`: horas reales y costo por tarea. El costo usa la tarifa
	actual del usuario asociado al registro de tiempo.
- `vw_proyecto_resumen`: total de tareas, completadas, atrasadas, porcentaje
	de progreso y costo real por proyecto.
- `vw_carga_consultor`: tareas activas, atrasadas y horas registradas por
	usuario.
- `vw_cronometros_activos`: cronometros sin `fin` y segundos transcurridos.

`registros_tiempo` tiene un indice unico parcial que impide mas de un
cronometro activo por usuario.

## Roles y seguridad

Los roles definidos son: `pmo`, `direccion`, `project_manager`,
`consultor_senior`, `consultor_junior`, `desarrollo` y `administrativo`.

Las politicas RLS estan en
`supabase/migrations/20260821071452_0002_pulsesoft_rls_policies.sql`.

- `pmo`: control global, puede crear usuarios, proyectos, importar y operar
	las entidades administrativas.
- `direccion`: lectura global, sin escritura.
- `project_manager`: acceso a proyectos donde aparece en `proyecto_roles` y
	puede gestionar tareas de sus proyectos.
- Consultores y desarrollo: ven o modifican tareas segun asignacion/rol y
	registran su propio tiempo.
- `administrativo`: rol definido en el dominio, sin privilegios especiales.

Las funciones SQL `auth_rol()` y `auth_usuario_id()` relacionan el usuario de
Supabase Auth con `usuarios`. Las comprobaciones de rol del frontend son solo
de UX; no sustituyen las politicas de base de datos.

## Flujo actual de carga de datos desde Excel

La carga se inicia en `Configuracion` y solo se muestra a la PMO.

### 1. Lectura local y deteccion

1. El usuario selecciona un `.xlsx` o `.xls`.
2. `src/pages/Configuracion.tsx` usa `FileReader` y `XLSX.read` en el
	 navegador. El archivo no se envia como binario a Supabase.
3. Se buscan estas hojas por fragmento de nombre:
	 - `Base de datos del proyecto`
	 - `Lista de Tareas`
	 - `Lista de Equipo`
	 - `Registro de reuniones`
	 - `Registro de comunicaciones`
4. La fila de encabezados se detecta entre las primeras 30 filas y las
	 columnas se resuelven por el texto exacto del encabezado.
5. Las fechas Excel se convierten a `YYYY-MM-DD`; numeros con moneda,
	 separadores de miles o coma decimal pasan por `sanitizeNumeric`.

### 2. Prevalidacion y resolucion

Antes de enviar datos se construye una vista previa por fila con estado
`ok`, `warning` o `error`.

- Se validan hojas, encabezados obligatorios y nombres principales.
- Las relaciones por persona se resuelven por nombre normalizado: trim y
	minusculas, sin hacer coincidencias aproximadas.
- Los responsables, propietarios y asistentes deben coincidir exactamente con
	un usuario existente o con la lista de equipo leida del libro.
- Las tareas deben apuntar a un proyecto existente o a uno marcado para crear.
- La interfaz permite resolver manualmente proyecto y asistentes antes de
	confirmar.
- Si queda una fila en estado `error`, no debe enviarse la importacion.

### 3. Payload enviado a Supabase

La UI construye un objeto con esta forma general:

```json
{
	"nombre_archivo": "datos.xlsx",
	"usuarios": [],
	"proyectos": [],
	"tareas": [],
	"reuniones": [],
	"comunicaciones": []
}
```

Los objetos usan nombres y correos para resolver relaciones. La UI traduce
estados, categorias, prioridades y tipos del Excel a los valores del dominio.
Las tareas importadas usan `fecha_finalizacion` del Excel como fecha limite
del sistema.

### 4. Escritura transaccional en PostgreSQL

La UI ejecuta:

```ts
supabase.rpc('importar_datos', { payload: importPayload })
```

El procesamiento ocurre en este orden:

1. Usuarios.
2. Proyectos.
3. Roles RACI de proyectos.
4. Tareas.
5. Asignaciones de tareas.
6. Reuniones y asistentes.
7. Comunicaciones.
8. Auditoria en `importaciones`.

La funcion busca coincidencias por:

- usuario: `email`;
- proyecto: `nombre + cliente`;
- tarea: `proyecto_id + nombre`.

Los registros existentes se actualizan y los nuevos se insertan. La migracion
`0005_make_excel_import_atomic.sql` envuelve la implementacion interna:
si el resultado contiene errores, lanza una excepcion y PostgreSQL revierte
toda la llamada. Por tanto, una importacion con errores no debe dejar solo
una parte de los datos guardada.

La migracion `0006_fix_import_jsonb_and_context.sql` corrige el tratamiento de
elementos JSONB y normaliza numeros, fechas, tipos de reunion y tipos de
comunicacion en la capa SQL. La UI ya hace normalizaciones equivalentes para
mostrar errores antes de la RPC.

### 5. Resultado y auditoria

Una importacion exitosa devuelve `importacion_id`, `creados`, `actualizados`,
`omitidos` y `errores`. La pantalla muestra los conteos y `Reportes` consulta
las ultimas importaciones de `importaciones` para usuarios PMO.

## Mutaciones principales desde el frontend

- Crear usuario: RPC `crear_usuario_auth` desde `Equipo`.
- Crear proyecto: `insert` en `proyectos`; despues puede llamar a
	`copiar_plantilla_tareas` para generar tareas de su categoria.
- Cambiar estado de tarea: `update` en `tareas`.
- Iniciar cronometro: `insert` en `registros_tiempo`.
- Detener cronometro: `update` de `fin` en `registros_tiempo`.
- Crear/eliminar plantilla: `insert` o `delete` en `plantillas_tareas`.
- Generar reporte semanal: RPC `generar_reporte_semanal` disponible en SQL,
	aunque la pantalla de reportes actual se enfoca en vistas agregadas e
	historial de importaciones.

## Asistente de IA

El asistente solo se muestra a la PMO. El navegador envia texto o audio a:

```text
POST <VITE_SUPABASE_URL>/functions/v1/asistente-ia
```

La Edge Function:

1. Valida el bearer token y obtiene el usuario autenticado.
2. Comprueba que su perfil tenga rol `pmo`.
3. Si recibe audio, usa Groq Whisper para transcribirlo.
4. Usa `llama-3.3-70b-versatile` con llamadas de herramientas.
5. Consulta o modifica Supabase con el cliente de service role asociado al
	 bearer token.
6. Intenta convertir la respuesta a audio con Groq TTS.

Herramientas disponibles: consultar estado de consultor, consultar estado de
proyecto, listar tareas atrasadas, listar pendientes por registrar, crear tarea
y actualizar estado de tarea. El frontend conserva el historial solo en el
estado React de la pantalla; no hay persistencia de conversaciones.

## Convenciones para modificar el proyecto

- Reutilizar los tipos de `src/lib/types.ts` y las constantes de
	`src/lib/constants.ts` antes de crear valores nuevos.
- Para dashboards y totales usar las vistas SQL existentes. No duplicar en
	React la logica de costo, progreso o carga.
- Cualquier nueva tabla o cambio de contrato debe incluir una nueva migracion
	incremental en `supabase/migrations/`.
- Las mutaciones deben respetar RLS y, si requieren privilegios elevados,
	implementarse como una RPC `SECURITY DEFINER` con validacion explicita de rol.
- Mantener las relaciones por UUID en base de datos; nombres y correos solo
	sirven como claves de resolucion durante la importacion.
- Despues de cambiar TypeScript ejecutar `pnpm typecheck`, `pnpm lint` y,
	cuando corresponda, `pnpm build`.

## Limites y detalles conocidos del estado actual

- El buscador visible del `AppShell` es una interfaz sin flujo global de
	busqueda conectado.
- Algunas pestañas o acciones del detalle de proyecto y de otras pantallas
	son presentacionales y no tienen todavia una mutacion completa.
- El modulo de mensajes no debe asumirse como un sistema de mensajeria
	persistente sin revisar su implementacion actual.
- La fuente de verdad de permisos es SQL/RLS, aunque algunas pantallas usen
	`usuario.rol` para ocultar botones.
- La creacion automatica de usuarios durante importaciones usa la funcion
	interna definida en las migraciones; cualquier cambio de credenciales o
	onboarding debe revisarse antes de reutilizar ese camino.
- Las vistas dependen de la estructura exacta de las tablas y de las politicas
	RLS. Si se cambia un nombre de columna o relacion, hay que actualizar SQL,
	tipos TypeScript, consultas y payloads de importacion juntos.

## Fuente de verdad por tema

| Tema | Archivo o carpeta |
| --- | --- |
| Rutas y providers | `src/App.tsx` |
| Sesion y perfil | `src/context/AuthContext.tsx` |
| Cliente Supabase | `src/lib/supabase.ts` |
| Tipos de dominio | `src/lib/types.ts` |
| Importacion Excel | `src/pages/Configuracion.tsx` |
| Esquema, vistas y triggers | `supabase/migrations/20260821071356_0001_pulsesoft_schema.sql` |
| Permisos RLS | `supabase/migrations/20260821071452_0002_pulsesoft_rls_policies.sql` |
| RPC de negocio | `supabase/migrations/20260821071609_0003_pulsesoft_functions.sql` y migraciones posteriores |
| Asistente IA | `supabase/functions/asistente-ia/index.ts` |
