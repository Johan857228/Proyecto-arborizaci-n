-- =====================================================================
-- 007 · Registros hechos sin conexión
-- ---------------------------------------------------------------------
-- La app guarda en el teléfono los árboles, inspecciones y fotos que se
-- registran sin señal y los envía cuando vuelve la conexión. Si un envío se
-- corta después de guardarse, la app lo repite: con id_cliente (un UUID que
-- genera la app) el backend reconoce el reenvío y devuelve lo que ya existe
-- en vez de duplicarlo.
--
-- capturado_en es la hora en que se tomó la inspección en campo, según el
-- teléfono. Es informativa: la fecha oficial sigue siendo `fecha`, que pone
-- el servidor (trigger inspecciones_antes_insertar) y nadie puede elegir.
--
-- Sin esta migración la app funciona igual, pero sin protección contra
-- duplicados al reenviar.
-- =====================================================================

alter table public.arboles add column if not exists id_cliente uuid;
create unique index if not exists arboles_id_cliente_uidx
  on public.arboles (id_cliente) where id_cliente is not null;

alter table public.inspecciones add column if not exists id_cliente uuid;
alter table public.inspecciones add column if not exists capturado_en timestamptz;
create unique index if not exists inspecciones_id_cliente_uidx
  on public.inspecciones (id_cliente) where id_cliente is not null;

alter table public.arbol_fotos add column if not exists id_cliente uuid;
create unique index if not exists arbol_fotos_id_cliente_uidx
  on public.arbol_fotos (id_cliente) where id_cliente is not null;

alter table public.inspeccion_fotos add column if not exists id_cliente uuid;
create unique index if not exists inspeccion_fotos_id_cliente_uidx
  on public.inspeccion_fotos (id_cliente) where id_cliente is not null;

comment on column public.arboles.id_cliente is 'UUID que generó la app al registrar (evita duplicados al reenviar sin conexión)';
comment on column public.inspecciones.id_cliente is 'UUID que generó la app al registrar (evita duplicados al reenviar sin conexión)';
comment on column public.inspecciones.capturado_en is 'Hora de captura en campo según el teléfono (informativa; la oficial es fecha)';
comment on column public.arbol_fotos.id_cliente is 'UUID que generó la app al subir la foto (evita duplicados al reenviar)';
comment on column public.inspeccion_fotos.id_cliente is 'UUID que generó la app al subir la foto (evita duplicados al reenviar)';

-- PostgREST vuelve a leer el esquema para conocer las columnas nuevas.
notify pgrst, 'reload schema';
