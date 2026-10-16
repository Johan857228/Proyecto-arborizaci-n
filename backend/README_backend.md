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
├── main.py            ← endpoints
├── db.py              ← conexiones a Supabase (admin, de usuario, anónima)
├── auth.py            ← lee y valida el token del encabezado Authorization
├── schemas.py         ← modelos Pydantic (validaciones de entrada y salida)
├── calculos.py        ← biomasa, carbono, CO2, O2 y semáforo
├── tests/             ← pruebas automáticas (no necesitan Supabase)
├── pytest.ini
├── requerimientos.txt
├── .env               ← claves (NO se sube a Git)
└── .env.example       ← plantilla sin valores (sí se sube)
```

## Instalación

```powershell
cd backend
venv\Scripts\activate
pip install python-multipart pytest        # solo estas dos son nuevas
pip freeze > requerimientos.txt
```

Variables del `.env`:

```
SUPABASE_URL=https://TU_ID.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_KEY=sb_secret_...
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

`CORS_ORIGINS` son las direcciones del frontend que pueden llamar a la API.

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

## Endpoints

| Método | Ruta | ¿Token? | Qué hace |
|---|---|---|---|
| GET | `/salud` | No | Comprueba que el servidor responde |
| POST | `/auth/login` | No | Devuelve el token (`access_token`) |
| GET | `/catalogos` | No | Especies, instituciones y casillas fitosanitarias |
| POST | `/arboles` | Sí | Registra un árbol con sus observaciones |
| GET | `/arboles` | Sí | Lista con filtros (`institucion_id`, `estado`, `especie`, `zona`) y paginación |
| GET | `/arboles/{id}` | Sí | Detalle con observaciones y fotos (URLs temporales) |
| GET | `/arboles/{id}/calculos` | Sí | Biomasa, carbono, CO₂ y O₂ estimados |
| POST | `/arboles/{id}/fotos?tipo=...` | Sí | Sube una foto (`completo`, `detalle` o `adicional`) |
| GET | `/estadisticas` | Sí | Totales, semáforo, por institución, especies frecuentes, promedios y totales ambientales |

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
| 403 | No tienes permiso (por ejemplo, subir foto a un árbol ajeno) |
| 404 | El árbol no existe |
| 409 | Ya existe esa foto o ya hay 3 adicionales |
| 413 | La foto supera 5 MB |
| 422 | Datos inválidos (altura > 25 m, "Otra" sin texto, etapa inexistente, etc.) |

El cuerpo trae `detail` con el mensaje. Los errores que vienen de la base de datos incluyen además `codigo_db` y `tecnico` (útiles para depurar; se pueden quitar en producción).

## Reglas de negocio implementadas

- Medidas mayores que 0, con máximos: DAP 500 cm (5 m), altura 25 m y copa 40 m.
- Coordenadas dentro de Colombia (latitud −4.3 a 13.5, longitud −82 a −66.8).
- Si la zona o la interferencia es "Otra", el texto es obligatorio, de 3 a 120 caracteres (sin contar espacios al inicio o al final).
- Hasta 50 observaciones por árbol.
- El correo del login debe tener formato válido; se limpia de espacios y se pasa a minúsculas.
- En `GET /arboles`, `zona` solo acepta las zonas del catálogo y `especie` se busca tal cual (`%`, `_` y `*` no son comodines).
- Una foto `completo`, una `detalle` y hasta 3 `adicional`; JPG, PNG o WebP; máximo 5 MB. El formato se comprueba con los primeros bytes del archivo, no con lo que declara el navegador.
- Solo quien registró un árbol puede subirle fotos (el RLS impide además editar árboles ajenos).
- El código `IE001-0001` y el campo `registrado_por` los asigna la base de datos; el frontend nunca los envía.
- Semáforo provisional: 0 observaciones = sano, 1–3 = riesgo, 4 o más = crítico (vive en la vista `arboles_resumen`).

## Fórmulas ambientales (CONFIRMAR con el docente)

Están en `calculos.py`, con constantes ajustables al inicio del archivo:

1. Biomasa aérea (kg) = 0.0673 × (ρ × DAP² × H)^0.976 (Chave et al., 2014; ρ = densidad de la madera).
2. Raíces = aérea × 0.24.
3. Carbono = biomasa total × 0.47.
4. CO₂ = carbono × 44/12.
5. O₂ = CO₂ × 32/44.

La densidad es 0.6 g/cm³ para todas las especies mientras no se complete el diccionario `DENSIDADES`. **Son estimaciones**: si la asignación pide otras fórmulas, solo se cambia `calculos.py`.

## Despliegue (Render, opción gratuita)

1. Sube el repositorio a GitHub.
2. En render.com: **New → Web Service**, elige el repositorio y la carpeta `backend`.
3. Build command: `pip install -r requerimientos.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. En **Environment** agrega las 4 variables del `.env` (`CORS_ORIGINS` con la dirección real del frontend).

## Limitaciones conocidas

- El prototipo no tiene login: React debe iniciar sesión con `/auth/login` (o `supabase-js`) antes de usar los endpoints protegidos. Los usuarios se crean a mano en Supabase.
- Si el registro de observaciones falla, el árbol se borra para no quedar a medias, pero el consecutivo del código ya consumido no se recupera.
- La regla "mínimo 2 fotos (completo + detalle)" no se obliga en la base de datos: el frontend debe subirlas después de crear el árbol.
- El plan gratuito de Supabase pausa el proyecto tras una semana sin actividad; se reactiva desde el panel.
- Si falla el guardado de una foto, se intenta borrar el archivo de Storage; si eso también falla, queda un archivo huérfano (sin efecto en los datos).
