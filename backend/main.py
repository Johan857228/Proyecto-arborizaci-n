"""API del Inventario Arbóreo Escolar (FastAPI + Supabase).

Arquitectura:
    React  →  FastAPI (este archivo y routers/)  →  Supabase (PostgreSQL + RLS + Storage)

- Los datos del usuario se leen y escriben con SU token, así el RLS de Supabase
  decide qué puede ver y editar (ver db.py y auth.py).
- La lógica (validaciones, biomasa, CO2, O2, estadísticas, indicadores) vive en Python
  (calculos.py y servicios/).
- Las tablas de los módulos nuevos se crean con backend/sql/001_fase1_modulos.sql y
  backend/sql/002_fase2_metas_escenarios.sql.

Ejecutar:  uvicorn main:app --reload
Docs:      http://127.0.0.1:8000/docs
"""
import os
import uuid
from collections import Counter
from uuid import UUID

from fastapi import Depends, FastAPI, File, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError
from supabase_auth.errors import AuthApiError, AuthError, AuthWeakPasswordError

import datos
import db
from auth import Perfil, Sesion, perfil_actual, usuario_actual
from comun import (
    BUCKET_FOTOS,
    MAX_FOTOS_ADICIONALES,
    POLITICA_VERSION,
    ahora,
    ajeno,
    buscar_por_id_cliente,
    escapar_like,
    insertar_sin_duplicar,
    leer_foto,
    portadas_de_arboles,
    resumen_por_id,
    traer_todo,
    url_firmada,
)
from routers import (
    configuracion,
    cursos,
    escenarios,
    exportar,
    gamificacion,
    guias,
    ia,
    inspecciones,
    intervenciones,
    mapa,
    metas,
    prae,
    presupuestos,
    privacidad,
    reportes,
    riesgo,
    servicio_social,
    siembras,
    usuarios,
)
from routers.inspecciones import InspeccionCrear, registrar_inspeccion
from schemas import (
    CAMPOS_BIOTICOS,
    ArbolCrear,
    ArbolDetalle,
    ArbolResumen,
    Calculos,
    Catalogos,
    ConteoEspecie,
    ConteoInstitucion,
    Estadisticas,
    Estado,
    FotoOut,
    LoginIn,
    ObservacionOut,
    Promedios,
    RefrescarIn,
    RegistroIn,
    RegistroOut,
    SesionOut,
    TipoFoto,
    TotalesAmbientales,
    Zona,
)
from servicios import mapa as reglas_mapa
from servicios.calificacion import calcular_ambientales, descripcion_metodo

app = FastAPI(
    title="Inventario Arbóreo Escolar API",
    version="2.0.0",
    description=(
        "Backend del inventario arbóreo: árboles, inspecciones con historial y revisión, "
        "intervenciones, cursos, presupuestos, configuración del método de cálculo, "
        "gamificación, reportes, metas y escenarios presupuestales."
    ),
)

# CORS: qué páginas web (orígenes) tienen permiso para llamar a esta API desde el navegador.
#   - Un origen es esquema + host + puerto, p. ej. http://localhost:5173
#     (http://127.0.0.1:5173 es OTRO origen distinto).
#   - Por defecto se permite cualquier puerto de localhost y 127.0.0.1 (desarrollo).
#   - CORS_ORIGINS (en .env, separados por coma) agrega otros: la dirección real del frontend
#     desplegado o la IP de un compañero. Con CORS_ORIGINS=* se permite cualquier origen.
#   - Al cambiar el .env hay que REINICIAR uvicorn (--reload solo vigila archivos .py).
REGEX_ORIGENES_LOCALES = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
origenes = [o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
permitir_todos = "*" in origenes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if permitir_todos else origenes,
    allow_origin_regex=None if permitir_todos else REGEX_ORIGENES_LOCALES,
    allow_credentials=False,  # se usa token en el encabezado Authorization, no cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
# El mapa y las listas grandes viajan comprimidos (el JSON de miles de árboles baja ~85 %).
app.add_middleware(GZipMiddleware, minimum_size=2048)

MAX_FOTO_BYTES = 5 * 1024 * 1024


# =============================== Manejo de errores ===============================
# Traduce los códigos de error de PostgreSQL a respuestas HTTP entendibles para React.
ERRORES_DB = {
    "23514": (422, "Un valor no cumple las reglas de validación de la base de datos"),
    "23502": (422, "Falta un campo obligatorio"),
    "23503": (422, "Referencia a un dato que no existe (institución, especie u observación)"),
    "23505": (409, "Ese registro ya existe (por ejemplo, ya hay una foto de ese tipo)"),
    "42501": (403, "No tienes permiso para esta operación"),
    "42P01": (503, "Falta una tabla en la base de datos: aplica las migraciones de backend/sql"),
    "PGRST205": (503, "Falta una tabla en la base de datos: aplica las migraciones de backend/sql"),
}


@app.exception_handler(APIError)
async def manejar_error_db(request, exc: APIError):
    codigo = str(getattr(exc, "code", "") or "")
    estado, mensaje = ERRORES_DB.get(codigo, (500, "Error en la base de datos"))
    tecnico = getattr(exc, "message", None)
    # Los triggers de la migración 001 explican en el mensaje qué regla se rompió.
    if codigo in ("23514", "42501") and tecnico and not tecnico.startswith(("new row", "permission denied")):
        mensaje = tecnico
    return JSONResponse(
        status_code=estado,
        content={"detail": mensaje, "codigo_db": codigo, "tecnico": tecnico},
    )


for modulo in (inspecciones, intervenciones, cursos, usuarios, presupuestos, configuracion,
               gamificacion, reportes, metas, escenarios, ia, privacidad, exportar, riesgo, servicio_social, prae, mapa, guias, siembras):
    app.include_router(modulo.router)


# ===================================== Salud =====================================
@app.get("/salud", tags=["General"])
def salud():
    return {"estado": "ok"}


# ================================ Autenticación ==================================
def _sesion(res) -> SesionOut:
    if res is None or res.session is None or res.user is None:
        raise HTTPException(status_code=401, detail="No se pudo iniciar sesión")
    return SesionOut(
        access_token=res.session.access_token,
        refresh_token=res.session.refresh_token,
        expires_in=res.session.expires_in,
        user_id=str(res.user.id),
        email=res.user.email,
    )


@app.post("/auth/login", response_model=SesionOut, tags=["Autenticación"])
def login(datos_login: LoginIn):
    """Inicia sesión y devuelve el token. El frontend lo envía luego como
    `Authorization: Bearer <access_token>`."""
    try:
        res = db.nuevo_cliente_anon().auth.sign_in_with_password(
            {"email": datos_login.email, "password": datos_login.password}
        )
    except AuthApiError:
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    return _sesion(res)


# Errores de Supabase Auth al registrar → (código HTTP, mensaje para la persona)
ERRORES_REGISTRO = {
    "user_already_exists": (409, "Ya existe una cuenta con ese correo. Inicia sesión."),
    "email_exists": (409, "Ya existe una cuenta con ese correo. Inicia sesión."),
    "weak_password": (422, "La contraseña es muy débil. Prueba con una más larga que combine letras, números y símbolos."),
    "email_address_invalid": (422, "Ese correo no se puede usar para registrarse."),
    "email_address_not_authorized": (422, "Ese correo no se puede usar para registrarse."),
    "signup_disabled": (403, "El registro de cuentas está desactivado. Pide al administrador que te cree la cuenta."),
    "email_provider_disabled": (403, "El registro de cuentas está desactivado. Pide al administrador que te cree la cuenta."),
    "over_email_send_rate_limit": (429, "Se hicieron muchos registros seguidos. Espera unos minutos e intenta de nuevo."),
    "over_request_rate_limit": (429, "Se hicieron muchos registros seguidos. Espera unos minutos e intenta de nuevo."),
}


def _registrar_politica(usuario_id: str) -> None:
    """Guarda en el perfil (creado por el trigger) que la persona aceptó la política al registrarse.
    Si falla (p. ej. falta la migración 005), la app la vuelve a pedir al entrar."""
    try:
        db.get_admin().table("perfiles").update(
            {"politica_version": POLITICA_VERSION, "politica_aceptada_en": ahora().isoformat()}
        ).eq("usuario_id", usuario_id).execute()
    except Exception:
        pass


@app.post("/auth/registro", response_model=RegistroOut, status_code=201, tags=["Autenticación"])
def registrar(d: RegistroIn):
    """Crea una cuenta nueva como estudiante y sin institución; un docente o un administrador
    le asigna institución y rol después (Usuarios). Si el proyecto de Supabase pide confirmar el
    correo, la sesión llega solo después de abrir el enlace."""
    try:
        res = db.nuevo_cliente_anon().auth.sign_up(
            {"email": d.email, "password": d.password, "options": {"data": {"nombre": d.nombre, "politica_version": POLITICA_VERSION}}}
        )
    except (AuthApiError, AuthWeakPasswordError) as error:
        estado, mensaje = ERRORES_REGISTRO.get(
            str(error.code or ""), (400, "No se pudo crear la cuenta. Revisa los datos e intenta de nuevo.")
        )
        raise HTTPException(status_code=estado, detail=mensaje)

    if res is None or res.user is None:
        raise HTTPException(status_code=400, detail="No se pudo crear la cuenta. Intenta de nuevo.")
    _registrar_politica(str(res.user.id))
    if res.session is None:
        # También pasa si el correo ya estaba registrado: Supabase no lo revela para no exponer
        # qué correos tienen cuenta.
        return RegistroOut(
            requiere_confirmacion=True,
            mensaje=f"Te enviamos un correo a {d.email} para confirmar la cuenta. Ábrelo y después inicia sesión.",
        )
    return RegistroOut(
        requiere_confirmacion=False,
        sesion=_sesion(res),
        mensaje="Cuenta creada. Un docente o un administrador te asignará tu institución.",
    )


@app.post("/auth/refresh", response_model=SesionOut, tags=["Autenticación"])
def refrescar(d: RefrescarIn):
    """Cambia el refresh_token por una sesión nueva cuando el access_token expira (1 hora)."""
    try:
        res = db.nuevo_cliente_anon().auth.refresh_session(d.refresh_token)
    except AuthError:  # token inválido, vencido o ya usado
        raise HTTPException(status_code=401, detail="La sesión expiró. Inicia sesión de nuevo.")
    return _sesion(res)


# ================================== Catálogos ====================================
@app.get("/catalogos", response_model=Catalogos, tags=["Catálogos"])
def catalogos():
    """Especies, instituciones y casillas fitosanitarias para llenar el formulario.
    Son datos públicos, por eso no piden token."""
    admin = db.get_admin()
    return Catalogos(
        especies=[
            {**e, "origen": reglas_mapa.origen_de(e.get("nombre_cientifico"), e.get("origen"))}
            for e in admin.table("especies").select("*").order("nombre_comun").execute().data
        ],
        instituciones=admin.table("instituciones")
        .select("id, nombre, nombre_corto, prefijo, lat, lng")
        .order("prefijo")
        .execute()
        .data,
        observaciones=admin.table("observaciones_catalogo").select("*").order("grupo").order("orden").execute().data,
    )


# ==================================== Árboles ====================================
@app.post("/arboles", response_model=ArbolResumen, status_code=201, tags=["Árboles"])
def crear_arbol(datos_arbol: ArbolCrear, respuesta: Response, perfil: Perfil = Depends(perfil_actual)):
    """Registra un árbol con sus observaciones y crea su primera inspección (origen
    'registro'), que queda pendiente de revisión. El código (IE001-0001) y el usuario que
    lo registra los asigna la base de datos. Si la app lo reenvía con el mismo id_cliente
    (se guardó sin conexión), responde 200 con el árbol que ya existe."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    existente = buscar_por_id_cliente(cliente, "arboles", datos_arbol.id_cliente, "id, registrado_por")
    if existente:
        if ajeno(existente, "registrado_por", perfil.usuario_id):
            raise HTTPException(status_code=409, detail="Ese identificador ya se usó en otro registro")
        respuesta.status_code = 200
        return resumen_por_id(cliente, str(existente["id"]))

    # 1) Validar que las casillas marcadas existan en el catálogo
    codigos = sorted(set(datos_arbol.observaciones))
    if codigos:
        validos = {f["codigo"] for f in cliente.table("observaciones_catalogo").select("codigo").execute().data}
        invalidos = [c for c in codigos if c not in validos]
        if invalidos:
            raise HTTPException(status_code=422, detail=f"Observaciones no válidas: {invalidos}")

    # 2) Guardar el árbol (solo sus columnas: la precisión y las notas son de la inspección)
    fila = datos_arbol.model_dump(
        exclude={"observaciones", "precision_gps_m", "notas", "id_cliente", "capturado_en", "tamizaje", *CAMPOS_BIOTICOS}
    )
    if datos_arbol.id_cliente:
        fila["id_cliente"] = str(datos_arbol.id_cliente)
    creado, nuevo = insertar_sin_duplicar(cliente, "arboles", fila)
    if not nuevo:  # otro envío del mismo registro llegó primero
        respuesta.status_code = 200
        return resumen_por_id(cliente, str(creado["id"]))

    # 3) Guardar las observaciones y la inspección de registro; si algo falla, se borra el
    #    árbol (y en cascada lo que alcanzó a guardarse) para no dejarlo a medias.
    try:
        if codigos:
            cliente.table("arbol_observaciones").insert(
                [{"arbol_id": creado["id"], "observacion_codigo": c} for c in codigos]
            ).execute()
        registro = registrar_inspeccion(
            cliente,
            creado,
            InspeccionCrear(
                lat=datos_arbol.lat,
                lng=datos_arbol.lng,
                precision_gps_m=datos_arbol.precision_gps_m,
                dap_cm=datos_arbol.dap_cm,
                altura_m=datos_arbol.altura_m,
                copa_m=datos_arbol.copa_m,
                etapa=datos_arbol.etapa,
                interferencia=datos_arbol.interferencia,
                interferencia_otra=datos_arbol.interferencia_otra,
                observaciones=codigos,
                notas=datos_arbol.notas,
                capturado_en=datos_arbol.capturado_en,
                tamizaje=datos_arbol.tamizaje,
                **datos_arbol.model_dump(include=CAMPOS_BIOTICOS),
            ),
            "registro",
            perfil.usuario_id,
        )
    except Exception:
        db.get_admin().table("arboles").delete().eq("id", creado["id"]).execute()
        raise

    resumen = resumen_por_id(cliente, creado["id"])
    tamizaje = registro.get("_tamizaje")
    return {**resumen, "riesgo_caida": tamizaje["categoria"] if tamizaje else None}


@app.get("/arboles", response_model=list[ArbolResumen], tags=["Árboles"])
def listar_arboles(
    institucion_id: str | None = Query(None, max_length=64),
    estado: Estado | None = None,
    especie: str | None = Query(None, max_length=60, description="Texto contenido en el nombre común"),
    zona: Zona | None = None,
    limite: int = Query(50, ge=1, le=200),
    desplazamiento: int = Query(0, ge=0),
    sesion: Sesion = Depends(usuario_actual),
):
    """Lista de árboles (pantalla de lista del prototipo) con filtros y paginación."""
    cliente = db.cliente_de_usuario(sesion.token)
    q = cliente.table("arboles_resumen").select("*")
    if institucion_id:
        q = q.eq("institucion_id", institucion_id)
    if estado:
        q = q.eq("estado", estado)
    if zona:
        q = q.eq("zona", zona)
    if especie and especie.strip():
        q = q.ilike("nombre_comun", f"%{escapar_like(especie.strip())}%")
    filas = q.order("registrado_en", desc=True).range(desplazamiento, desplazamiento + limite - 1).execute().data
    portadas = portadas_de_arboles(cliente, [f["id"] for f in filas])
    riesgos = riesgo.categorias_actuales([str(f["id"]) for f in filas])
    return [{**f, "foto_url": portadas.get(f["id"]), "riesgo_caida": riesgos.get(str(f["id"]))} for f in filas]


@app.get("/arboles/{arbol_id}", response_model=ArbolDetalle, tags=["Árboles"])
def detalle_arbol(arbol_id: UUID, sesion: Sesion = Depends(usuario_actual)):
    """Un árbol con los hallazgos de su última inspección válida y sus fotos de registro
    (URLs temporales). El historial completo está en /arboles/{id}/inspecciones."""
    cliente = db.cliente_de_usuario(sesion.token)
    resumen = resumen_por_id(cliente, str(arbol_id))
    catalogo = datos.catalogo_observaciones(cliente)

    if resumen.get("ultima_inspeccion_id"):
        codigos = datos.observaciones_por_inspeccion(cliente, [str(resumen["ultima_inspeccion_id"])]).get(
            str(resumen["ultima_inspeccion_id"]), []
        )
    else:  # árbol sin inspecciones (datos anteriores a la migración 001)
        filas_obs = cliente.table("arbol_observaciones").select("observacion_codigo").eq("arbol_id", str(arbol_id)).execute().data
        codigos = [f["observacion_codigo"] for f in filas_obs]
    observaciones = [
        ObservacionOut(codigo=c, grupo=catalogo[c]["grupo"], etiqueta=catalogo[c]["etiqueta"])
        for c in codigos
        if c in catalogo
    ]

    filas_fotos = cliente.table("arbol_fotos").select("id, tipo, storage_path").eq("arbol_id", str(arbol_id)).execute().data
    fotos = [FotoOut(id=str(f["id"]), tipo=f["tipo"], url=url_firmada(cliente, f["storage_path"])) for f in filas_fotos]

    return ArbolDetalle(**resumen, observaciones=observaciones, fotos=fotos)


def _metodo_del_arbol(cliente, arbol: dict):
    metodos = datos.metodos(cliente)
    return metodos.get(str(arbol.get("ultimo_metodo_id"))) or datos.metodo_por_defecto(metodos)


@app.get("/arboles/{arbol_id}/calculos", response_model=Calculos, tags=["Árboles"])
def calculos_arbol(arbol_id: UUID, sesion: Sesion = Depends(usuario_actual)):
    """Biomasa, carbono, CO2 y O2 estimados para un árbol, con las constantes de la versión
    del método con que se calificó su última inspección."""
    cliente = db.cliente_de_usuario(sesion.token)
    a = resumen_por_id(cliente, str(arbol_id))
    metodo = _metodo_del_arbol(cliente, a)
    valores = calcular_ambientales(metodo, a["dap_cm"], a["altura_m"], a["nombre_comun"])
    return Calculos(
        codigo=a["codigo"],
        nombre_comun=a["nombre_comun"],
        dap_cm=a["dap_cm"],
        altura_m=a["altura_m"],
        metodo=descripcion_metodo(metodo),
        advertencia="Estimación aproximada. Confirmar las fórmulas con el docente.",
        **valores,
    )


# ==================================== Fotos ======================================
@app.post("/arboles/{arbol_id}/fotos", status_code=201, tags=["Fotos"])
def subir_foto(
    arbol_id: UUID,
    respuesta: Response,
    tipo: TipoFoto = Query(..., description="completo, detalle o adicional"),
    archivo: UploadFile = File(...),
    id_cliente: UUID | None = Query(None, description="UUID de la app: si el envío se repite, no se duplica la foto"),
    sesion: Sesion = Depends(usuario_actual),
):
    """Sube una foto a Storage y registra su ruta. Solo quien registró el árbol puede hacerlo.
    Reglas: una foto 'completo', una 'detalle' y hasta 3 'adicional'. JPG, PNG o WebP, máx. 5 MB."""
    # Valida tipo, tamaño y formato real (por su firma) y quita los metadatos de la foto.
    contenido, tipo_real, extension = leer_foto(archivo, MAX_FOTO_BYTES)

    cliente = db.cliente_de_usuario(sesion.token)

    arbol = cliente.table("arboles").select("id, registrado_por").eq("id", str(arbol_id)).execute().data
    if not arbol:
        raise HTTPException(status_code=404, detail="Árbol no encontrado")
    if arbol[0]["registrado_por"] != sesion.user_id:
        raise HTTPException(status_code=403, detail="Solo quien registró el árbol puede agregar fotos")

    # Reenvío de una foto que ya se guardó (la app no alcanzó a recibir la respuesta).
    existente = buscar_por_id_cliente(cliente, "arbol_fotos", id_cliente, "id, arbol_id, tipo, storage_path")
    if existente:
        if str(existente["arbol_id"]) != str(arbol_id):
            raise HTTPException(status_code=409, detail="Ese identificador ya se usó en otra foto")
        respuesta.status_code = 200
        return {"id": existente["id"], "tipo": existente["tipo"], "storage_path": existente["storage_path"]}

    if tipo == "adicional":
        existentes = (
            cliente.table("arbol_fotos").select("id").eq("arbol_id", str(arbol_id)).eq("tipo", "adicional").execute().data
        )
        if len(existentes) >= MAX_FOTOS_ADICIONALES:
            raise HTTPException(status_code=409, detail="Ya hay 3 fotos adicionales")

    ruta = f"{arbol_id}/{uuid.uuid4().hex}.{extension}"
    cliente.storage.from_(BUCKET_FOTOS).upload(ruta, contenido, {"content-type": tipo_real})

    nueva_fila = {"arbol_id": str(arbol_id), "tipo": tipo, "storage_path": ruta}
    if id_cliente:
        nueva_fila["id_cliente"] = str(id_cliente)
    try:
        fila, nueva = insertar_sin_duplicar(cliente, "arbol_fotos", nueva_fila)
    except Exception:
        _quitar_foto(ruta)
        raise
    if not nueva:  # otro envío de la misma foto llegó primero: sobra el archivo que se acaba de subir
        _quitar_foto(ruta)
        respuesta.status_code = 200

    return {"id": fila["id"], "tipo": fila["tipo"], "storage_path": fila["storage_path"]}


def _quitar_foto(ruta: str) -> None:
    """Borra una foto de Storage sin fallar, para no dejar archivos huérfanos."""
    try:
        db.get_admin().storage.from_(BUCKET_FOTOS).remove([ruta])
    except Exception:
        pass


# ================================= Estadísticas ==================================
@app.get("/estadisticas", response_model=Estadisticas, tags=["Estadísticas"])
def estadisticas(
    institucion_id: str | None = Query(None, description="Solo los árboles de esta institución (opcional)"),
    sesion: Sesion = Depends(usuario_actual),
):
    """Datos para las pantallas de inicio y estadísticas. Con institucion_id, todo (también las
    inspecciones pendientes) se limita a los árboles de esa institución."""
    cliente = db.cliente_de_usuario(sesion.token)
    filas = traer_todo(
        cliente,
        "arboles_resumen",
        "id, prefijo, nombre_corto, nombre_comun, dap_cm, altura_m, copa_m, etapa, estado, ultimo_metodo_id",
        filtros=[("eq", ("institucion_id", institucion_id))] if institucion_id else (),
    )
    metodos = datos.metodos(cliente)
    defecto = datos.metodo_por_defecto(metodos)

    total = len(filas)
    por_estado = {"sano": 0, "riesgo": 0, "critico": 0}
    por_estado.update(Counter(f["estado"] for f in filas))

    por_inst = Counter((f["prefijo"], f["nombre_corto"]) for f in filas)
    por_institucion = [
        ConteoInstitucion(prefijo=p, nombre_corto=n, total=t) for (p, n), t in sorted(por_inst.items())
    ]

    especies = Counter(f["nombre_comun"] for f in filas).most_common(5)

    def promedio(campo: str) -> float | None:
        return round(sum(f[campo] for f in filas) / total, 2) if total else None

    totales = {"biomasa_total_kg": 0.0, "carbono_kg": 0.0, "co2_kg": 0.0, "o2_kg": 0.0}
    for f in filas:
        metodo = metodos.get(str(f.get("ultimo_metodo_id"))) or defecto
        c = calcular_ambientales(metodo, f["dap_cm"], f["altura_m"], f["nombre_comun"])
        for clave in totales:
            totales[clave] += c[clave]

    pendientes = traer_todo(cliente, "inspecciones", "id, arbol_id", filtros=[("eq", ("estado_revision", "pendiente"))])
    if institucion_id:
        ids = {str(f["id"]) for f in filas}
        pendientes = [p for p in pendientes if str(p.get("arbol_id")) in ids]

    return Estadisticas(
        total=total,
        inspecciones_pendientes=len(pendientes),
        por_estado=por_estado,
        por_institucion=por_institucion,
        por_etapa=dict(Counter(f["etapa"] for f in filas)),
        especies_frecuentes=[ConteoEspecie(nombre_comun=n, total=t) for n, t in especies],
        promedios=Promedios(dap_cm=promedio("dap_cm"), altura_m=promedio("altura_m"), copa_m=promedio("copa_m")),
        totales_ambientales=TotalesAmbientales(**{k: round(v, 2) for k, v in totales.items()}),
    )
