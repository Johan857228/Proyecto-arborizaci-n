# Backend — Inventario Arbóreo Escolar

API en **FastAPI** conectada a **Supabase** (PostgreSQL + RLS + Storage).

```
React  →  FastAPI (este proyecto)  →  Supabase
```

- Los datos del usuario se leen y escriben **con su propio token**, así el RLS de Supabase decide qué puede ver y editar.
- La lógica (validaciones, biomasa, CO₂, O₂, estadísticas) vive en Python.

## Estructura

```
backend/
├── main.py            ← app, árboles, fotos de registro, catálogos y estadísticas
├── routers/           ← endpoints de los módulos (inspecciones, intervenciones, cursos…)
├── servicios/         ← lógica sin base de datos: calificación, recomendaciones,
│                        indicadores, gamificación, presupuesto y escenarios
├── datos.py           ← lecturas que comparten varios módulos
├── comun.py           ← fechas (hora de Colombia), consultas paginadas y fotos
├── db.py              ← conexiones a Supabase (admin, de usuario, anónima)
├── auth.py            ← token del encabezado Authorization y perfil (rol) de quien llama
├── schemas.py         ← modelos Pydantic compartidos
├── calculos.py        ← biomasa, carbono, CO2, O2 y área de copa
├── sql/               ← migraciones para Supabase (se aplican en orden)
├── tests/             ← pruebas automáticas (no necesitan Supabase)
├── pytest.ini
├── requerimientos.txt ← dependencias (requirements.txt es una copia idéntica)
├── .env               ← claves (NO se sube a Git)
└── .env.example       ← plantilla sin valores (sí se sube)
```

## Instalación

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requerimientos.txt
```

## Migraciones de la base de datos

Los módulos de inspecciones, revisión, intervenciones, cursos, presupuestos, configuración,
gamificación, reportes, metas y escenarios necesitan tablas nuevas en Supabase. Se crean con
estos archivos, que se pegan completos en **Supabase → SQL Editor → Run**, en este orden:

1. `sql/001_fase1_modulos.sql`
2. `sql/002_fase2_metas_escenarios.sql`
3. `sql/003_validaciones.sql`
4. `sql/004_agentes_bioticos.sql`
5. `sql/005_privacidad.sql` (autorización del acudiente, solicitudes de datos, alias y nombres protegidos en rankings)
6. `sql/006_dane.sql` (código DANE, DIVIPOLA y municipio de cada sede)
7. `sql/007_sin_conexion.sql` (registros hechos sin señal: no se duplican al reenviarse)
8. `sql/008_riesgo_caida.sql` (tamizaje de riesgo de caída, alertas y contactos de emergencia de cada sede)
9. `sql/009_servicio_social.sql` (grado de cada curso, bitácora de servicio social, meta de horas y certificados)

No borran datos: a cada árbol ya registrado le crean su inspección de registro (con los
hallazgos que tenía) y a cada usuario de Supabase Auth su perfil. Se pueden ejecutar más de
una vez. Al final del primero hay un ejemplo para volver administrador a tu cuenta:

```sql
update public.perfiles set rol = 'administrador', institucion_id = 'sj'
 where correo = 'tu-correo@institucion.edu.co';
```

La 003 agrega reglas `CHECK` en `arboles` e `inspecciones` con los mismos límites de
`schemas.py`: DAP mayor que 0 y hasta 500 cm, altura hasta 25 m, copa mayor que 0 y hasta 40 m,
coordenadas dentro de Colombia (en una inspección, latitud y longitud van juntas o ninguna) y
textos de "Otra" de 3 a 120 caracteres. Así ningún dato fuera de rango entra aunque alguien use
la API de Supabase directamente con su token.

Las reglas se crean `NOT VALID`: se exigen desde ese momento a todo registro nuevo o editado y
luego se validan los datos que ya existían. Si algún registro anterior no cumple una regla, el
script no falla: la deja activa para lo nuevo y muestra un aviso (`NOTICE`) con la consulta para
encontrar esos registros. Se corrigen y se vuelve a ejecutar el archivo para validarla. Como las
medidas actuales de un árbol salen de su última inspección, un valor mal registrado se corrige en
`arboles` y también en su inspección de registro (`origen = 'registro'`). Para ver qué reglas
siguen pendientes de validar:

```sql
select conrelid::regclass as tabla, conname as regla
  from pg_constraint
 where conname ~ '(rango|colombia|largo)$' and not convalidated;
```

La 004 agrega a `inspecciones` las variables de agentes bióticos de la tabla FB-01 a FB-06. Se
registran en cada visita (la primera es la del registro del árbol), igual que los hallazgos:

| Variable | Columnas | Valores |
|---|---|---|
| FB-01 Insectos | `insectos`, `insectos_parte`, `insectos_sev` | defoliadores, chupadores, escamas, arrieras, minadores, agalladores; parte afectada; severidad 0 a 4 |
| FB-02 Enfermedad | `enfermedad`, `enfermedad_parte`, `enfermedad_sev` | fungica, bacteriana, viral, indeterminada; parte afectada; severidad 0 a 4 |
| FB-03 Muestra de laboratorio | `muestra_lab`, `cod_muestra_lab` | sí o no; código de 3 a 40 letras, números, guiones o guion bajo |
| FB-04 Hemiparásitas | `hemiparasitas`, `pct_hemiparasitas` | pajarito (Loranthaceae) o cuscuta; porcentaje de la copa, mayor que 0 y hasta 100 |
| FB-05 Bejucos | `bejucos` | 0 a 4 según la porción del individuo cubierta |
| FB-06 Epífitas | `epifitas` (lista) | bromelias, orquideas, helechos, liquenes, musgos |

Las partes del árbol son `hojas`, `ramas`, `tronco`, `raiz` y `flores_frutos`. Las reglas exigen
que un insecto o una enfermedad vengan con su parte y su severidad, que la muestra tenga código y
que la hemiparásita tenga porcentaje; si no se marca el agente, esos datos quedan vacíos. Las
inspecciones anteriores quedan sin agentes registrados. Las reglas se vuelven a crear cada vez que
se ejecuta el archivo. Los agentes no cambian el puntaje de riesgo: el estado del árbol sigue
saliendo de los hallazgos.

Sin las migraciones, los endpoints nuevos responden 503 con el mensaje "Falta una tabla en la
base de datos: aplica las migraciones de backend/sql".

Variables del `.env`:

```
SUPABASE_URL=https://TU_ID.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_KEY=sb_secret_...
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

`CORS_ORIGINS` son las direcciones del frontend que pueden llamar a la API.

Opcional: `URL_PUBLICA_API=https://tu-backend.up.railway.app` es la dirección pública de la API
que lleva el QR de los certificados de servicio social (`/verificar/<código>`). Si no está, se
toma de la petición (encabezados `X-Forwarded-Proto` y `X-Forwarded-Host` detrás de un proxy).

## Ejecutar

```powershell
uvicorn main:app --reload
```

Documentación interactiva: http://127.0.0.1:8000/docs

## Pruebas

```powershell
python -m pytest -q
```

Usan un cliente de Supabase falso: comprueban las validaciones, los permisos, las fórmulas y las estadísticas sin tocar tu base de datos.

## Roles

Cada usuario de Supabase Auth tiene un perfil (`perfiles`) con rol, institución y curso.

| Rol | Puede |
|---|---|
| `estudiante` (por defecto) | Registrar árboles e inspecciones, consultar inventario, reportes, metas, cursos y rankings |
| `docente` | Lo anterior + revisar (confirmar o anular) inspecciones, registrar intervenciones y gestionar cursos **de su institución**; consultar presupuestos, escenarios y configuración |
| `administrador` | Todo, en todas las instituciones: configuración del método, parámetros, costos, presupuestos, metas, escenarios y usuarios |

Los permisos se validan dos veces: en Python (para responder con un mensaje claro) y con RLS y
triggers en Supabase (para que tampoco se puedan saltar llamando a la API de Supabase directamente).

## Endpoints

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/salud` | Público | Comprueba que el servidor responde |
| POST | `/auth/login` | Público | Devuelve el token (`access_token`) y el `refresh_token` |
| POST | `/auth/refresh` | Público | Cambia el `refresh_token` por una sesión nueva |
| POST | `/auth/registro` | Público | Crea una cuenta de estudiante sin institución (nombre, correo, contraseña y `acepta_politica`); devuelve la sesión o pide confirmar el correo |
| GET | `/catalogos` | Público | Especies, instituciones y casillas fitosanitarias |
| GET / PATCH | `/perfil` | Usuario | Mi rol, institución y curso / cambiar mi nombre |
| GET | `/usuarios` | Docente, admin | Usuarios (el docente ve los de su institución) |
| PATCH | `/usuarios/{id}` | Docente, admin | Admin: rol, institución, curso, estado. Docente: solo el curso |
| POST | `/arboles` | Usuario | Registra un árbol y crea su inspección de registro |
| GET | `/arboles` | Usuario | Lista con filtros (`institucion_id`, `estado`, `especie`, `zona`) y paginación; cada árbol trae `foto_url` (su foto general más reciente) |
| GET | `/arboles/{id}` | Usuario | Detalle con los hallazgos de la última inspección válida y fotos de registro |
| GET | `/arboles/{id}/calculos` | Usuario | Biomasa, carbono, CO₂ y O₂ con la versión del método de la última inspección |
| POST | `/arboles/{id}/fotos?tipo=...` | Quien lo registró | Foto de registro (`completo`, `detalle` o `adicional`) |
| GET / POST | `/arboles/{id}/inspecciones` | Usuario | Historial del árbol / registrar una visita de seguimiento |
| GET | `/inspecciones/{id}` | Usuario | Detalle de una inspección |
| POST | `/inspecciones/{id}/fotos?tipo=...` | Quien la registró | Foto de la visita (mientras esté pendiente) |
| GET | `/revision/pendientes` | Docente, admin | Inspecciones por revisar con hallazgos y fotos |
| POST | `/inspecciones/{id}/confirmar` | Docente, admin | Confirma (comentario opcional) |
| POST | `/inspecciones/{id}/anular` | Docente, admin | Anula (motivo obligatorio) |
| GET | `/arboles/{id}/recomendaciones` | Usuario | Acciones sugeridas según el estado actual |
| GET | `/arboles/{id}/intervenciones` | Usuario | Intervenciones del árbol |
| GET | `/intervenciones` · `/intervenciones/{id}` | Usuario | Lista con filtros / detalle |
| GET | `/intervenciones/recomendaciones` | Usuario | Recomendaciones de todos los árboles (o de una institución) |
| POST / PATCH | `/intervenciones` · `/intervenciones/{id}` | Docente, admin | Programar o registrar ejecutada / ejecutar, cancelar o corregir |
| GET / PATCH | `/intervenciones/tipos` · `/intervenciones/tipos/{codigo}` | Usuario / admin | Tipos y costos de referencia |
| GET / POST | `/cursos` | Usuario / docente, admin | Cursos con zonas e integrantes / crear |
| GET / PATCH / DELETE | `/cursos/{id}` | Usuario / docente, admin | Detalle / editar / borrar |
| PUT | `/cursos/{id}/zonas` | Docente, admin | Reemplaza las zonas asignadas |
| GET | `/cursos/{id}/avance` | Usuario | Cobertura por zona y productividad por integrante (`desde`, `hasta`) |
| GET / POST | `/presupuestos` | Docente, admin / admin | Presupuestos con ejecutado, comprometido y proyección / crear |
| GET / PATCH / DELETE | `/presupuestos/{id}` | Docente, admin / admin | Detalle / editar / borrar |
| GET / POST | `/configuracion/metodos` | Usuario / admin | Versiones del método (pesos y umbrales) / crear versión |
| POST | `/configuracion/metodos/simular` | Docente, admin | Vista previa del semáforo con un método |
| GET / PUT | `/configuracion/parametros` · `/configuracion/parametros/{institucion_id}` | Usuario / admin | Parámetros por institución |
| GET | `/gamificacion/mi-progreso` | Usuario | Puntos, nivel, racha, logros y posición |
| GET | `/gamificacion/ranking` | Usuario | Ranking individual o por curso (`tipo`, `institucion_id`, `rol`, `desde`, `hasta`) |
| GET | `/reportes/indicadores` | Usuario | Inventario, riesgo, cobertura, productividad e intervenciones del periodo |
| GET | `/metas/indicadores` | Usuario | Indicadores que admiten metas |
| GET / POST | `/metas` | Usuario / admin | Metas con su avance / crear |
| PATCH / DELETE | `/metas/{id}` | Admin | Editar / borrar |
| POST | `/escenarios/simular` | Docente, admin | Qué acciones entran con un monto |
| GET / POST | `/escenarios` | Docente, admin / admin | Escenarios guardados / guardar |
| GET / DELETE | `/escenarios/{id}` | Docente, admin / admin | Detalle / borrar |
| GET | `/estadisticas` | Usuario | Totales, semáforo, por institución, especies, promedios, ambientales e inspecciones pendientes |
| GET | `/ia/estado` | Usuario | Si la identificación con IA está activada y con qué modelo |
| POST | `/ia/analizar-foto` | Usuario | Sugerencias de la IA a partir de la foto `general` (y `detalle`, opcional) |
| PUT / DELETE | `/perfil/foto` · `/perfil/portada` | Usuario | Cambiar o quitar la foto de perfil o la portada del inicio |
| GET | `/privacidad/estado` | Usuario | Política aceptada, alias y autorización del acudiente |
| POST | `/privacidad/politica` | Usuario | Acepta la versión vigente de la política de datos |
| PUT | `/privacidad/alias` | Usuario | Alias para los rankings (sin alias, los demás ven las iniciales) |
| POST | `/privacidad/consentimientos` | Usuario / docente, admin | Autorización firmada en la app (para sí, o el docente para un estudiante de su institución) |
| POST | `/privacidad/consentimientos/documento` | Docente, admin | Sube la foto del formato firmado por el acudiente |
| POST | `/privacidad/consentimientos/{id}/revocar` | Usuario / docente, admin | Revoca una autorización |
| GET | `/privacidad/estudiantes` | Docente, admin | Estudiantes de la institución y el estado de su autorización |
| GET | `/privacidad/mis-datos` | Usuario | Copia de los datos personales (derecho de consulta) |
| GET / POST | `/privacidad/solicitudes` | Usuario | Mis solicitudes (o las de la institución con `alcance=institucion`) / crear consulta o reclamo |
| PATCH | `/privacidad/solicitudes/{id}` | Docente, admin | Responder una solicitud (atendida o rechazada) |
| POST | `/privacidad/anonimizar/{usuario_id}` | Admin | Anonimiza la cuenta de un egresado y le quita el acceso |
| GET | `/instituciones` | Usuario | Sedes con código DANE, DIVIPOLA y municipio |
| PATCH | `/instituciones/{id}` | Admin | Asigna el código DANE (12 dígitos), el DIVIPOLA (5) y el municipio |
| POST | `/exportar` | Docente, admin | Genera `arboles` (CSV, GeoJSON o Shapefile), `inspecciones` o `intervenciones` (CSV), o `todo` (ZIP), y devuelve un enlace de descarga que vence en 10 minutos. Sin datos personales |
| GET | `/exportar/diccionario` | Usuario | Qué significa cada columna exportada |
| GET | `/arboles/{id}/riesgo` | Usuario | Último tamizaje de riesgo de caída del árbol y su alerta abierta |
| GET | `/alertas?estado=abiertas\|cerradas\|todas` | Usuario | Alertas de riesgo alto o inminente de la institución (el admin, de todas) |
| POST | `/alertas/{id}/confirmar` · `/descartar` · `/aviso` · `/atender` | Docente o admin | Confirmar el riesgo, descartarlo con motivo, dejar constancia del aviso a rectoría y cerrarla |
| GET / PUT | `/instituciones/{id}/contactos` | Usuario / docente o admin | Contactos de emergencia de la sede (rectoría, gestión del riesgo, autoridad ambiental) |
| GET | `/servicio-social/resumen?estudiante_id=` | Estudiante / docente o admin | Horas aprobadas, por revisar y esperadas, por tipo, y bitácora |
| POST | `/servicio-social/actividades` · `/actividades/{id}/foto` | Estudiante de 10.° y 11.° | Registrar una actividad (siembra, riego, jornada…) y su foto de evidencia |
| GET / POST | `/servicio-social/actividades/pendientes` · `/{id}/aprobar` · `/{id}/rechazar` | Docente o admin | Revisar las actividades de la institución |
| GET | `/servicio-social/estudiantes?curso_id=` | Docente o admin | Estudiantes de 10.° y 11.° con sus horas, los atrasados primero |
| GET / PUT | `/servicio-social/parametros/{institucion_id}` | Usuario / docente o admin | Meta de horas (80) y horas por inspección confirmada (1) |
| GET / POST | `/servicio-social/certificados` · `/{id}/descarga` · `/{id}/anular` | Docente o admin (descarga también el estudiante) | Emitir el PDF con QR, descargarlo (enlace de 10 min) y anularlo |
| GET | `/verificar/{código}` · `/servicio-social/verificar/{código}` | Público | Página (y JSON) a la que lleva el QR: válido o anulado, con las iniciales del estudiante |

## Identificación con IA

El registro tiene una tarjeta **"Identificación con IA"**: con la foto general (y la de detalle, si existe)
Claude sugiere especie, etapa, interferencia, observaciones fitosanitarias y agentes bióticos FB-01, FB-02,
FB-04, FB-05 y FB-06. Cada sugerencia trae su confianza y la señal que la respalda, y **solo se aplica si
la persona la acepta**; nada se guarda por la IA. No estima medidas ni marca la muestra de laboratorio (FB-03).

- Modelo: `claude-opus-5-5` (`servicios/ia.py`). Si el modelo declina una petición, la API la reintenta
  sola con el modelo de respaldo recomendado (`fallbacks: "default"`).
- Las respuestas se limitan a los catálogos y se revisan otra vez en el backend: un código o especie que no
  está en el catálogo se descarta y las escalas fuera de rango se corrigen.
- Para activarla, agrega `ANTHROPIC_API_KEY` (de console.anthropic.com) al `.env` y reinicia uvicorn. Sin
  la clave, `POST /ia/analizar-foto` responde 503 y el formulario avisa que la IA no está activada.
- Costo aproximado: unos US$0,04 por análisis. Para cuidar el saldo hay un máximo de 30 análisis por
  usuario cada hora (`MAX_ANALISIS_POR_HORA` en `routers/ia.py`).
- Las pruebas (`tests/test_ia.py`) usan un cliente falso: no necesitan la clave ni gastan saldo.

## Cómo lo usa el frontend (React)

**1. Iniciar sesión y guardar el token**

```js
const r = await fetch("http://127.0.0.1:8000/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const { access_token } = await r.json();
```

**2. Llamar a un endpoint protegido**

```js
const r = await fetch("http://127.0.0.1:8000/arboles", {
  headers: { Authorization: `Bearer ${access_token}` },
});
```

**3. Registrar un árbol**

```js
await fetch("http://127.0.0.1:8000/arboles", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
  body: JSON.stringify({
    institucion_id: "sj", zona: "Patio central", lat: 10.4638, lng: -73.254,
    especie_id: 1, dap_cm: 35.5, altura_m: 8.2, copa_m: 4.5,
    etapa: "Adulto", interferencia: "Ninguna",
    observaciones: ["f_manchas", "t_micelio"],
  }),
});
```

**4. Subir una foto**

```js
const form = new FormData();
form.append("archivo", archivoSeleccionado);          // input type="file"
await fetch(`http://127.0.0.1:8000/arboles/${id}/fotos?tipo=completo`, {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}` },   // sin Content-Type: el navegador lo pone
  body: form,
});
```

## Errores que devuelve la API

| Código | Cuándo |
|---|---|
| 401 | Falta el token, es inválido o expiró |
| 403 | No tienes permiso (rol, institución, revisar tu propia inspección, cuenta desactivada) |
| 404 | El registro no existe |
| 409 | Conflicto: foto repetida, inspección ya revisada, periodo de presupuesto que se cruza, meta o curso duplicado |
| 413 | La foto supera 5 MB |
| 422 | Datos inválidos (altura > 25 m, "Otra" sin texto, fecha futura, umbrales incoherentes, etc.) |
| 503 | Falta aplicar las migraciones de `sql/` |

El cuerpo trae `detail` con el mensaje. Los errores que vienen de la base de datos incluyen además `codigo_db` y `tecnico` (útiles para depurar; se pueden quitar en producción).

## Reglas de negocio implementadas

- Medidas mayores que 0, con máximos: DAP 500 cm (5 m), altura 25 m y copa 40 m. Aplica al registro
  y a cada inspección de seguimiento, y la base de datos lo exige también (migración 003).
- Coordenadas dentro de Colombia (latitud −4.3 a 13.5, longitud −82 a −66.8). En una inspección de
  seguimiento el GPS es opcional, pero si se envía van latitud y longitud juntas.
- Si la zona o la interferencia es "Otra", el texto es obligatorio, de 3 a 120 caracteres (sin contar espacios al inicio o al final).
- Hasta 50 observaciones por árbol.
- El correo del login debe tener formato válido; se limpia de espacios y se pasa a minúsculas.
- En `GET /arboles`, `zona` solo acepta las zonas del catálogo y `especie` se busca tal cual (`%`, `_` y `*` no son comodines).
- Agentes bióticos (FB-01 a FB-06) en el registro y en cada inspección: un insecto o una enfermedad
  piden parte afectada y severidad 0 a 4; la muestra de laboratorio pide su código; la hemiparásita,
  el porcentaje de copa. Si no se marca el agente, la API descarta la parte, la severidad o el código
  que lleguen sueltos. Las epífitas se guardan sin repetir.
- La foto de portada de cada árbol en `GET /arboles` es la foto general (`completo`) de la última
  inspección de seguimiento no anulada que la tenga; si no hay, la del registro.
- Una foto `completo`, una `detalle` y hasta 3 `adicional`; JPG, PNG o WebP; máximo 5 MB. El formato se comprueba con los primeros bytes del archivo, no con lo que declara el navegador.
- Solo quien registró un árbol puede subirle fotos (el RLS impide además editar árboles ajenos).
- El código `IE001-0001` y el campo `registrado_por` los asigna la base de datos; el frontend nunca los envía.
- **Servicio social** (`servicios/servicio_social.py`, Resolución MEN 4210 de 1996): lo prestan los
  estudiantes de cursos de 10.° y 11.° (el grado se guarda en el curso o se deduce del nombre: "10-A",
  "1102", "Once B"), del 1 de febrero de 10.° al 30 de noviembre de 11.°. Cuentan las inspecciones
  propias confirmadas (1 h cada una por defecto, una por árbol y día) y las actividades con foto que
  aprueba un docente; máximo 8 h por día y actividades de máximo 90 días atrás. No se registran
  trabajos en altura, con herramientas cortantes o motorizadas, ni con agroquímicos. Las horas
  esperadas reparten la meta en los 20 meses de clase de los dos años; con menos del 75 % de lo
  esperado el estudiante va atrasado. El certificado (PDF con código y QR) lo emite un docente de la
  institución o el administrador cuando se cumple la meta, con autorización de rectoría y el nombre de
  quien firma; hay uno vigente por estudiante y se anula para corregirlo. La verificación pública
  muestra solo las iniciales del estudiante.
- **Riesgo de caída** (`servicios/riesgo_caida.py`): el registro y cada inspección pueden traer un
  `tamizaje` (inclinación, raíces, ramas secas, cavidades, hongos, grietas y qué hay debajo, que es
  obligatorio). La categoría (bajo, medio, alto o inminente) la calcula el backend cruzando la
  probabilidad de falla con la ocupación de lo que hay debajo; un árbol pequeño (≤ 3 m y DAP ≤ 10 cm)
  baja un nivel. La app usa las mismas reglas sin conexión (`frontend/src/features/riesgo/reglas.ts`).
  Alto o inminente abre una alerta por árbol (`por_confirmar` → `confirmada` → `atendida`, o
  `descartada`); otra inspección la actualiza sin bajarle la categoría y anular la inspección que la
  abrió la descarta. Es un tamizaje, no un dictamen: la poda o tala la autoriza la autoridad ambiental
  previa visita técnica (Decreto 1076 de 2015, art. 2.2.1.1.9.3). Sin la migración 008 la categoría se
  calcula y se devuelve, pero no se guarda ni abre alertas.
- **Sin conexión**: la app guarda en el teléfono lo que se registra sin señal y lo envía después.
  `POST /arboles`, `POST /arboles/{id}/inspecciones` y las dos rutas de fotos aceptan un
  `id_cliente` (UUID que genera la app; en las fotos va como parámetro `?id_cliente=`). Si llega
  otra vez el mismo `id_cliente`, la API responde **200** con lo que ya está guardado en lugar de
  crear un duplicado (y en las fotos no cuenta para el límite de tres). Un `id_cliente` que ya usó
  otra persona u otro árbol responde 409. `capturado_en` es la hora de la visita según el teléfono:
  se guarda en la inspección como dato informativo y se descarta si está más de 10 minutos en el
  futuro o tiene más de 90 días; la fecha oficial sigue siendo la del servidor. Sin la migración
  007 todo funciona igual, sin la protección contra duplicados.
- Un árbol tiene muchas **inspecciones** (visitas). Al registrarlo se crea la primera (`origen = registro`).
  Su estado, medidas y hallazgos actuales son los de la última inspección **no anulada**
  (vista `arboles_resumen`), así que anular una inspección devuelve el árbol al estado anterior.
- Toda inspección queda `pendiente` hasta que un docente de la institución (que no sea quien la hizo)
  o un administrador la confirme o la anule con motivo. Inspector, fecha y estado los fija la base de datos.
- **Calificación**: puntaje = suma de pesos de los hallazgos (peso del grupo o peso propio del código)
  + peso de interferencia; crítico si puntaje ≥ umbral crítico, riesgo si ≥ umbral de riesgo.
  La versión 1 del método reproduce el semáforo provisional (1 por hallazgo; 1–3 riesgo, 4 o más crítico).
  Las versiones no se editan: cada inspección guarda la suya y el administrador asigna cuál usa cada institución.
- **Puntos**: inspección confirmada = `puntos_inspeccion`; si además es el registro de un árbol nuevo,
  suma `puntos_arbol_nuevo`. Se calculan con los parámetros vigentes de la institución del árbol.
  Racha = semanas seguidas con al menos una inspección no anulada.
- **Recomendaciones**: plagas → control de plagas; follaje → tratamiento; tronco → poda sanitaria;
  raíz, crítico u "otra infraestructura" → evaluación de riesgo; cables → poda de despeje; pisos o muros →
  manejo de raíces; senescente crítico → tala y reposición. Desaparecen cuando hay una intervención de ese
  tipo programada o ejecutada después de la última inspección.
- Una intervención ejecutada o cancelada solo la corrige un administrador; la fecha de ejecución no puede ser futura.
- Los presupuestos de una misma institución no pueden tener periodos que se crucen.

## Fórmulas ambientales (CONFIRMAR con el docente)

Están en `calculos.py`, con constantes ajustables al inicio del archivo:

1. Biomasa aérea (kg) = 0.0673 × (ρ × DAP² × H)^0.976 (Chave et al., 2014; ρ = densidad de la madera).
2. Raíces = aérea × 0.24.
3. Carbono = biomasa total × 0.47.
4. CO₂ = carbono × 44/12.
5. O₂ = CO₂ × 32/44.

La densidad es 0.6 g/cm³ para todas las especies mientras no se complete el diccionario `DENSIDADES`. **Son estimaciones**: si la asignación pide otras fórmulas, solo se cambia `calculos.py`.

La densidad por defecto, el factor de raíz y la fracción de carbono también forman parte de cada
versión del método de cálculo (tabla `metodos_calculo`), así el administrador puede ajustarlas desde
Configuración sin tocar código. La versión 1 usa los mismos valores de `calculos.py`.

## Despliegue (Render, opción gratuita)

1. Sube el repositorio a GitHub.
2. En render.com: **New → Web Service**, elige el repositorio y la carpeta `backend`.
3. Build command: `pip install -r requerimientos.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. En **Environment** agrega las 4 variables del `.env` (`CORS_ORIGINS` con la dirección real del frontend).

## Limitaciones conocidas

- Los usuarios se crean a mano en Supabase Auth; al primer inicio de sesión tienen rol `estudiante` y el administrador les asigna institución, rol y curso desde la pantalla Usuarios.
- La vista `perfiles_publicos` es *security definer* a propósito (expone nombre, rol, institución y curso de todos para rankings y revisiones, sin el correo). El linter de Supabase la marca como advertencia.
- Los indicadores, el avance de los cursos y los rankings se calculan en memoria leyendo el historial completo; para un colegio (cientos o pocos miles de árboles) es suficiente.
- Si el registro de observaciones falla, el árbol se borra para no quedar a medias, pero el consecutivo del código ya consumido no se recupera.
- La regla "mínimo 2 fotos (completo + detalle)" no se obliga en la base de datos: el frontend debe subirlas después de crear el árbol.
- El plan gratuito de Supabase pausa el proyecto tras una semana sin actividad; se reactiva desde el panel.
- Si falla el guardado de una foto, se intenta borrar el archivo de Storage; si eso también falla, queda un archivo huérfano (sin efecto en los datos).
