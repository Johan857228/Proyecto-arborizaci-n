-- =====================================================================================
-- Inventario Arbóreo Escolar · Migración 001 · Módulos de la Fase 1
--
-- Agrega, sin borrar datos existentes:
--   perfiles y roles · cursos y zonas asignadas · métodos de cálculo y parámetros
--   institucionales · inspecciones con historial, hallazgos y fotos · revisión
--   (confirmar / anular) · tipos de intervención e intervenciones · presupuestos
-- y vuelve a crear la vista `arboles_resumen` para que el estado de cada árbol salga
-- de su última inspección no anulada.
--
-- Cómo aplicarla: Supabase → SQL Editor → pegar este archivo completo → Run.
-- Se puede ejecutar más de una vez: no duplica tablas, políticas ni datos semilla.
--
-- Supone el esquema que ya usa el backend: instituciones(id text), especies(id),
-- observaciones_catalogo(codigo), arboles(id uuid, ...), arbol_observaciones y
-- arbol_fotos. Después de aplicarla, asigna al menos un administrador (ver el final).
-- =====================================================================================

begin;

-- ------------------------------------------------------------------ Cursos
create table if not exists public.cursos (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  text not null references public.instituciones(id),
  nombre          text not null check (char_length(btrim(nombre)) between 1 and 60),
  anio            smallint not null check (anio between 2000 and 2100),
  docente_id      uuid references auth.users(id) on delete set null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  unique (institucion_id, nombre, anio)
);

create table if not exists public.curso_zonas (
  curso_id  uuid not null references public.cursos(id) on delete cascade,
  zona      text not null check (zona in ('Patio central', 'Entrada principal', 'Zona deportiva',
                                          'Bloques académicos', 'Otra')),
  primary key (curso_id, zona)
);

-- ------------------------------------------------------------------ Perfiles y roles
-- rol: administrador (todo), docente (revisa y gestiona su institución), estudiante (registra).
create table if not exists public.perfiles (
  usuario_id      uuid primary key references auth.users(id) on delete cascade,
  nombre          text not null check (char_length(btrim(nombre)) between 1 and 120),
  correo          text,
  rol             text not null default 'estudiante'
                  check (rol in ('administrador', 'docente', 'estudiante')),
  institucion_id  text references public.instituciones(id),
  curso_id        uuid references public.cursos(id) on delete set null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);
create index if not exists perfiles_curso_idx on public.perfiles (curso_id);

-- Funciones de apoyo para las políticas RLS (security definer: leen perfiles sin
-- depender de las políticas de esa misma tabla).
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then null
    when not exists (select 1 from public.perfiles p where p.usuario_id = auth.uid()) then 'estudiante'
    else (select case when p.activo then p.rol end from public.perfiles p where p.usuario_id = auth.uid())
  end
$$;

create or replace function public.mi_institucion() returns text
language sql stable security definer set search_path = '' as $$
  select p.institucion_id from public.perfiles p where p.usuario_id = auth.uid()
$$;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.mi_rol() = 'administrador', false)
$$;

create or replace function public.es_revisor() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.mi_rol() in ('administrador', 'docente'), false)
$$;

create or replace function public.gestiona_institucion(p_institucion text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin()
      or coalesce(public.mi_rol() = 'docente' and public.mi_institucion() = p_institucion, false)
$$;

create or replace function public.institucion_de_arbol(p_arbol uuid) returns text
language sql stable security definer set search_path = '' as $$
  select a.institucion_id from public.arboles a where a.id = p_arbol
$$;

-- Perfil automático para cada usuario nuevo de Supabase Auth.
create or replace function public.crear_perfil_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (usuario_id, nombre, correo)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
                  nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                  'Usuario'), 120),
    new.email
  )
  on conflict (usuario_id) do nothing;
  return new;
end
$$;

drop trigger if exists al_crear_usuario_perfil on auth.users;
create trigger al_crear_usuario_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- Perfiles para los usuarios que ya existían.
insert into public.perfiles (usuario_id, nombre, correo)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'nombre'), ''),
                     nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                     nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
                     'Usuario'), 120),
       u.email
from auth.users u
on conflict (usuario_id) do nothing;

-- Cada usuario cambia solo su nombre; el docente asigna el curso a usuarios de su
-- institución; rol, institución y estado solo los cambia un administrador.
create or replace function public.proteger_perfil() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not public.es_admin() then
    if new.usuario_id <> old.usuario_id
       or new.rol is distinct from old.rol
       or new.institucion_id is distinct from old.institucion_id
       or new.activo is distinct from old.activo
       or new.correo is distinct from old.correo
       or new.creado_en is distinct from old.creado_en then
      raise exception 'Solo un administrador puede cambiar el rol, la institución o el estado de un usuario'
        using errcode = '42501';
    end if;
    if old.usuario_id <> auth.uid() and new.nombre is distinct from old.nombre then
      raise exception 'Solo puedes cambiar tu propio nombre' using errcode = '42501';
    end if;
    if new.curso_id is distinct from old.curso_id and public.mi_rol() is distinct from 'docente' then
      raise exception 'El curso lo asigna un docente o un administrador' using errcode = '42501';
    end if;
  end if;
  if new.curso_id is not null and not exists (
    select 1 from public.cursos c
    where c.id = new.curso_id and c.institucion_id is not distinct from new.institucion_id
  ) then
    raise exception 'El curso no pertenece a la institución del usuario' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists perfiles_proteger on public.perfiles;
create trigger perfiles_proteger
  before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- Nombres, roles y cursos visibles para todos (rankings, revisores, docentes) sin el correo.
create or replace view public.perfiles_publicos as
  select usuario_id, nombre, rol, institucion_id, curso_id, activo
  from public.perfiles;
revoke all on public.perfiles_publicos from anon;
grant select on public.perfiles_publicos to authenticated;

-- ------------------------------------------------------------------ Método de cálculo
-- Cada versión es inmutable: para cambiar pesos o umbrales se crea una versión nueva.
-- Puntaje de riesgo = suma de pesos de los hallazgos marcados (peso del grupo o el peso
-- propio del código en pesos_observacion) + peso_interferencia si hay interferencia.
-- Calificación: puntaje >= umbral_critico → crítico; >= umbral_riesgo → riesgo; si no, sano.
create table if not exists public.metodos_calculo (
  id                       uuid primary key default gen_random_uuid(),
  version                  integer not null unique check (version > 0),
  nombre                   text not null check (char_length(btrim(nombre)) between 3 and 80),
  descripcion              text check (descripcion is null or char_length(descripcion) <= 500),
  peso_follaje             numeric(6,2) not null default 1 check (peso_follaje between 0 and 100),
  peso_tronco              numeric(6,2) not null default 1 check (peso_tronco between 0 and 100),
  peso_raiz                numeric(6,2) not null default 1 check (peso_raiz between 0 and 100),
  peso_plagas              numeric(6,2) not null default 1 check (peso_plagas between 0 and 100),
  peso_interferencia       numeric(6,2) not null default 0 check (peso_interferencia between 0 and 100),
  pesos_observacion        jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(pesos_observacion) = 'object'),
  umbral_riesgo            numeric(6,2) not null check (umbral_riesgo > 0),
  umbral_critico           numeric(6,2) not null,
  densidad_madera_defecto  numeric(5,3) not null default 0.6 check (densidad_madera_defecto between 0.1 and 1.5),
  factor_raiz              numeric(4,3) not null default 0.24 check (factor_raiz between 0 and 1),
  fraccion_carbono         numeric(4,3) not null default 0.47 check (fraccion_carbono between 0.3 and 0.6),
  creado_por               uuid references auth.users(id) default auth.uid(),
  creado_en                timestamptz not null default now(),
  check (umbral_critico > umbral_riesgo)
);

-- El número de versión es consecutivo y sin huecos; lo asigna la base de datos.
create or replace function public.metodos_antes_insertar() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.metodos_calculo.version'));
  new.version := coalesce((select max(m.version) from public.metodos_calculo m), 0) + 1;
  new.creado_en := now();
  if current_user = 'authenticated' then
    new.creado_por := auth.uid();
  end if;
  return new;
end
$$;

drop trigger if exists metodos_insertar on public.metodos_calculo;
create trigger metodos_insertar
  before insert on public.metodos_calculo
  for each row execute function public.metodos_antes_insertar();

-- Versión 1: reproduce el semáforo provisional (0 hallazgos sano, 1–3 riesgo, 4 o más crítico)
-- y las constantes ambientales que ya usaba calculos.py.
insert into public.metodos_calculo (nombre, descripcion, umbral_riesgo, umbral_critico)
select 'Conteo de hallazgos',
       'Cada hallazgo suma 1. Equivale al semáforo provisional del prototipo.',
       1, 4
where not exists (select 1 from public.metodos_calculo);

create table if not exists public.parametros_institucionales (
  institucion_id        text primary key references public.instituciones(id) on delete cascade,
  metodo_id             uuid not null references public.metodos_calculo(id),
  dias_revisita         integer not null default 180 check (dias_revisita between 7 and 730),
  precision_gps_max_m   numeric(6,1) not null default 15 check (precision_gps_max_m > 0 and precision_gps_max_m <= 500),
  puntos_inspeccion     integer not null default 10 check (puntos_inspeccion between 0 and 1000),
  puntos_arbol_nuevo    integer not null default 15 check (puntos_arbol_nuevo between 0 and 1000),
  actualizado_por       uuid references auth.users(id) default auth.uid(),
  actualizado_en        timestamptz not null default now()
);

insert into public.parametros_institucionales (institucion_id, metodo_id)
select i.id, (select m.id from public.metodos_calculo m order by m.version limit 1)
from public.instituciones i
on conflict (institucion_id) do nothing;

-- ------------------------------------------------------------------ Inspecciones
-- Cada visita a un árbol. La primera (origen = 'registro') se crea al registrar el árbol.
create table if not exists public.inspecciones (
  id                    uuid primary key default gen_random_uuid(),
  arbol_id              uuid not null references public.arboles(id) on delete cascade,
  inspector_id          uuid references auth.users(id) default auth.uid(),
  fecha                 timestamptz not null default clock_timestamp(),
  origen                text not null default 'seguimiento' check (origen in ('registro', 'seguimiento')),
  lat                   double precision check (lat between -90 and 90),
  lng                   double precision check (lng between -180 and 180),
  precision_gps_m       numeric(6,1) check (precision_gps_m is null or precision_gps_m >= 0),
  dap_cm                double precision not null check (dap_cm > 0),
  altura_m              double precision not null check (altura_m > 0 and altura_m <= 25),
  copa_m                double precision not null check (copa_m > 0),
  etapa                 text not null check (etapa in ('Plántula', 'Juvenil', 'Adulto', 'Senescente')),
  interferencia         text not null check (interferencia in ('Ninguna', 'Levantamiento de pisos',
                          'Afectación de muros', 'Cables eléctricos', 'Otra infraestructura')),
  interferencia_otra    text check (interferencia_otra is null or char_length(interferencia_otra) <= 200),
  notas                 text check (notas is null or char_length(notas) <= 1000),
  metodo_id             uuid not null references public.metodos_calculo(id),
  puntaje_riesgo        numeric(8,2) not null check (puntaje_riesgo >= 0),
  calificacion          text not null check (calificacion in ('sano', 'riesgo', 'critico')),
  estado_revision       text not null default 'pendiente'
                        check (estado_revision in ('pendiente', 'confirmada', 'anulada')),
  revisado_por          uuid references auth.users(id),
  revisado_en           timestamptz,
  comentario_revision   text check (comentario_revision is null or char_length(comentario_revision) <= 500),
  check (interferencia <> 'Otra infraestructura' or interferencia_otra is not null),
  check (estado_revision = 'pendiente' or revisado_en is not null),
  check (estado_revision <> 'anulada' or comentario_revision is not null)
);
create index if not exists inspecciones_arbol_fecha_idx on public.inspecciones (arbol_id, fecha desc);
create index if not exists inspecciones_inspector_idx on public.inspecciones (inspector_id, fecha desc);
create index if not exists inspecciones_pendientes_idx on public.inspecciones (fecha)
  where estado_revision = 'pendiente';
create unique index if not exists inspecciones_un_registro_por_arbol on public.inspecciones (arbol_id)
  where origen = 'registro';

create table if not exists public.inspeccion_observaciones (
  inspeccion_id       uuid not null references public.inspecciones(id) on delete cascade,
  observacion_codigo  text not null references public.observaciones_catalogo(codigo),
  primary key (inspeccion_id, observacion_codigo)
);

create table if not exists public.inspeccion_fotos (
  id             uuid primary key default gen_random_uuid(),
  inspeccion_id  uuid not null references public.inspecciones(id) on delete cascade,
  tipo           text not null check (tipo in ('completo', 'detalle', 'adicional')),
  storage_path   text not null unique,
  subido_por     uuid references auth.users(id) default auth.uid(),
  subido_en      timestamptz not null default now()
);
create unique index if not exists inspeccion_fotos_tipo_unico on public.inspeccion_fotos (inspeccion_id, tipo)
  where tipo in ('completo', 'detalle');

-- Quien registra por la API no puede elegir inspector, fecha ni estado de revisión.
create or replace function public.inspecciones_antes_insertar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    new.inspector_id := auth.uid();
    new.fecha := clock_timestamp();
    new.estado_revision := 'pendiente';
    new.revisado_por := null;
    new.revisado_en := null;
    new.comentario_revision := null;
  end if;
  return new;
end
$$;

drop trigger if exists inspecciones_insertar on public.inspecciones;
create trigger inspecciones_insertar
  before insert on public.inspecciones
  for each row execute function public.inspecciones_antes_insertar();

-- La revisión solo pasa de pendiente a confirmada o anulada, una vez, y queda firmada.
create or replace function public.inspecciones_antes_revisar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if old.estado_revision <> 'pendiente' then
      raise exception 'La inspección ya fue revisada' using errcode = '23514';
    end if;
    if new.estado_revision not in ('confirmada', 'anulada') then
      raise exception 'Una revisión debe confirmar o anular la inspección' using errcode = '23514';
    end if;
    new.revisado_por := auth.uid();
    new.revisado_en := now();
  end if;
  return new;
end
$$;

drop trigger if exists inspecciones_revisar on public.inspecciones;
create trigger inspecciones_revisar
  before update on public.inspecciones
  for each row execute function public.inspecciones_antes_revisar();

-- Historial para los árboles registrados antes de esta migración: una inspección de
-- registro con los datos y hallazgos que ya tenían, calificada con la versión 1.
insert into public.inspecciones (arbol_id, inspector_id, fecha, origen, lat, lng, dap_cm, altura_m, copa_m,
                                 etapa, interferencia, interferencia_otra, metodo_id, puntaje_riesgo,
                                 calificacion, estado_revision)
select a.id, a.registrado_por, a.registrado_en, 'registro', a.lat, a.lng, a.dap_cm, a.altura_m, a.copa_m,
       a.etapa, a.interferencia,
       case when a.interferencia = 'Otra infraestructura'
            then coalesce(nullif(btrim(a.interferencia_otra), ''), 'Sin descripción') end,
       (select m.id from public.metodos_calculo m order by m.version limit 1),
       n.total,
       case when n.total = 0 then 'sano' when n.total <= 3 then 'riesgo' else 'critico' end,
       'pendiente'
from public.arboles a
cross join lateral (
  select count(*)::numeric as total from public.arbol_observaciones o where o.arbol_id = a.id
) n
where not exists (select 1 from public.inspecciones i where i.arbol_id = a.id);

insert into public.inspeccion_observaciones (inspeccion_id, observacion_codigo)
select i.id, o.observacion_codigo
from public.inspecciones i
join public.arbol_observaciones o on o.arbol_id = i.arbol_id
where i.origen = 'registro'
on conflict do nothing;

-- ------------------------------------------------------------------ Vista de árboles
-- Datos fijos del árbol + medidas y estado de su última inspección no anulada.
drop view if exists public.arboles_resumen;
create view public.arboles_resumen with (security_invoker = true) as
select
  a.id,
  a.codigo,
  a.institucion_id,
  ins.prefijo,
  ins.nombre_corto,
  a.zona,
  a.zona_otra,
  a.lat,
  a.lng,
  a.especie_id,
  e.nombre_comun,
  e.nombre_cientifico,
  coalesce(u.dap_cm, a.dap_cm)                 as dap_cm,
  coalesce(u.altura_m, a.altura_m)             as altura_m,
  coalesce(u.copa_m, a.copa_m)                 as copa_m,
  coalesce(u.etapa, a.etapa)                   as etapa,
  coalesce(u.interferencia, a.interferencia)   as interferencia,
  case when u.id is null then a.interferencia_otra else u.interferencia_otra end as interferencia_otra,
  a.registrado_en,
  a.registrado_por,
  coalesce(u.n_observaciones, legado.total)::integer as n_observaciones,
  coalesce(u.calificacion,
           case when legado.total = 0 then 'sano' when legado.total <= 3 then 'riesgo' else 'critico' end
  )                                            as estado,
  u.puntaje_riesgo,
  u.metodo_id                                  as ultimo_metodo_id,
  u.id                                         as ultima_inspeccion_id,
  u.fecha                                      as ultima_inspeccion_en,
  u.estado_revision                            as ultima_revision,
  conteo.total::integer                        as n_inspecciones
from public.arboles a
join public.instituciones ins on ins.id = a.institucion_id
join public.especies e on e.id = a.especie_id
left join lateral (
  select i.*,
         (select count(*) from public.inspeccion_observaciones io where io.inspeccion_id = i.id) as n_observaciones
  from public.inspecciones i
  where i.arbol_id = a.id and i.estado_revision <> 'anulada'
  order by i.fecha desc, i.id desc
  limit 1
) u on true
left join lateral (
  select count(*) as total from public.arbol_observaciones o where o.arbol_id = a.id
) legado on true
left join lateral (
  select count(*) as total from public.inspecciones i2
  where i2.arbol_id = a.id and i2.estado_revision <> 'anulada'
) conteo on true;

revoke all on public.arboles_resumen from anon;
grant select on public.arboles_resumen to authenticated, service_role;

-- ------------------------------------------------------------------ Intervenciones
create table if not exists public.tipos_intervencion (
  codigo            text primary key check (codigo ~ '^[a-z_]{3,40}$'),
  nombre            text not null check (char_length(btrim(nombre)) between 3 and 80),
  descripcion       text check (descripcion is null or char_length(descripcion) <= 300),
  costo_referencia  numeric(12,2) not null default 0 check (costo_referencia >= 0),
  orden             smallint not null default 0
);

-- Costos de referencia en pesos colombianos (COP). Son orientativos: el administrador
-- los ajusta en Configuración.
insert into public.tipos_intervencion (codigo, nombre, descripcion, costo_referencia, orden) values
  ('evaluacion_riesgo', 'Evaluación de riesgo', 'Visita de un especialista para valorar estabilidad y riesgo de caída.', 180000, 1),
  ('poda_sanitaria', 'Poda sanitaria', 'Retiro de ramas enfermas, secas o con pudrición.', 150000, 2),
  ('poda_despeje', 'Poda de despeje', 'Separar la copa de cables y estructuras.', 200000, 3),
  ('control_plagas', 'Control de plagas', 'Manejo de termitas, hormigas, cochinillas u otras plagas.', 120000, 4),
  ('tratamiento_fitosanitario', 'Tratamiento fitosanitario', 'Tratamiento de enfermedades del follaje.', 100000, 5),
  ('manejo_raices', 'Manejo de raíces', 'Corrección de raíces que levantan pisos o afectan muros.', 250000, 6),
  ('poda_formacion', 'Poda de formación', 'Guiar el crecimiento de árboles jóvenes.', 80000, 7),
  ('riego_fertilizacion', 'Riego y fertilización', 'Mantenimiento de plántulas y árboles recién sembrados.', 40000, 8),
  ('tala_reposicion', 'Tala y reposición', 'Retiro de un árbol en riesgo y siembra de su reemplazo.', 900000, 9),
  ('otra', 'Otra intervención', 'Acción que no está en la lista.', 0, 10)
on conflict (codigo) do nothing;

create table if not exists public.intervenciones (
  id                 uuid primary key default gen_random_uuid(),
  arbol_id           uuid not null references public.arboles(id) on delete cascade,
  inspeccion_id      uuid references public.inspecciones(id) on delete set null,
  tipo_codigo        text not null references public.tipos_intervencion(codigo),
  estado             text not null default 'programada' check (estado in ('programada', 'ejecutada', 'cancelada')),
  descripcion        text check (descripcion is null or char_length(descripcion) <= 1000),
  responsable        text not null check (char_length(btrim(responsable)) between 2 and 120),
  fecha_programada   date,
  fecha_ejecucion    date,
  costo_estimado     numeric(12,2) check (costo_estimado is null or costo_estimado >= 0),
  costo_real         numeric(12,2) check (costo_real is null or costo_real >= 0),
  resultado          text check (resultado is null or resultado in ('exitosa', 'parcial', 'sin_efecto')),
  resultado_detalle  text check (resultado_detalle is null or char_length(resultado_detalle) <= 1000),
  registrado_por     uuid references auth.users(id) default auth.uid(),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  check (estado <> 'programada' or fecha_programada is not null),
  check (estado <> 'ejecutada' or (fecha_ejecucion is not null and costo_real is not null and resultado is not null))
);
create index if not exists intervenciones_arbol_idx on public.intervenciones (arbol_id);
create index if not exists intervenciones_estado_idx on public.intervenciones (estado);

create or replace function public.intervenciones_antes_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.registrado_por := auth.uid();
    end if;
    new.creado_en := now();
  else
    if current_user = 'authenticated' and old.estado <> 'programada' and not public.es_admin() then
      raise exception 'Una intervención ejecutada o cancelada solo la corrige un administrador'
        using errcode = '42501';
    end if;
    new.registrado_por := old.registrado_por;
    new.creado_en := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end
$$;

drop trigger if exists intervenciones_guardar on public.intervenciones;
create trigger intervenciones_guardar
  before insert or update on public.intervenciones
  for each row execute function public.intervenciones_antes_guardar();

-- ------------------------------------------------------------------ Presupuestos
create table if not exists public.presupuestos (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  text not null references public.instituciones(id),
  nombre          text not null check (char_length(btrim(nombre)) between 3 and 80),
  fecha_inicio    date not null,
  fecha_fin       date not null,
  monto_asignado  numeric(14,2) not null check (monto_asignado >= 0),
  notas           text check (notas is null or char_length(notas) <= 500),
  creado_por      uuid references auth.users(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio),
  unique (institucion_id, fecha_inicio, fecha_fin)
);

-- ------------------------------------------------------------------ Permisos (RLS)
alter table public.perfiles                    enable row level security;
alter table public.cursos                      enable row level security;
alter table public.curso_zonas                 enable row level security;
alter table public.metodos_calculo             enable row level security;
alter table public.parametros_institucionales  enable row level security;
alter table public.inspecciones                enable row level security;
alter table public.inspeccion_observaciones    enable row level security;
alter table public.inspeccion_fotos            enable row level security;
alter table public.tipos_intervencion          enable row level security;
alter table public.intervenciones              enable row level security;
alter table public.presupuestos                enable row level security;

-- perfiles: cada quien ve el suyo; el docente ve los de su institución; el administrador todos.
drop policy if exists perfiles_leer on public.perfiles;
create policy perfiles_leer on public.perfiles for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin()
         or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion()));
drop policy if exists perfiles_editar on public.perfiles;
create policy perfiles_editar on public.perfiles for update to authenticated
  using (usuario_id = auth.uid() or public.es_admin()
         or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion()))
  with check (usuario_id = auth.uid() or public.es_admin()
              or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion()));

-- cursos y zonas: lectura para todos; escritura del administrador o del docente de la institución.
drop policy if exists cursos_leer on public.cursos;
create policy cursos_leer on public.cursos for select to authenticated using (true);
drop policy if exists cursos_crear on public.cursos;
create policy cursos_crear on public.cursos for insert to authenticated
  with check (public.gestiona_institucion(institucion_id));
drop policy if exists cursos_editar on public.cursos;
create policy cursos_editar on public.cursos for update to authenticated
  using (public.gestiona_institucion(institucion_id))
  with check (public.gestiona_institucion(institucion_id));
drop policy if exists cursos_borrar on public.cursos;
create policy cursos_borrar on public.cursos for delete to authenticated
  using (public.gestiona_institucion(institucion_id));

drop policy if exists curso_zonas_leer on public.curso_zonas;
create policy curso_zonas_leer on public.curso_zonas for select to authenticated using (true);
drop policy if exists curso_zonas_escribir on public.curso_zonas;
create policy curso_zonas_escribir on public.curso_zonas for all to authenticated
  using (exists (select 1 from public.cursos c where c.id = curso_id and public.gestiona_institucion(c.institucion_id)))
  with check (exists (select 1 from public.cursos c where c.id = curso_id and public.gestiona_institucion(c.institucion_id)));

-- configuración: lectura para todos; escritura solo del administrador. Los métodos no se editan.
drop policy if exists metodos_leer on public.metodos_calculo;
create policy metodos_leer on public.metodos_calculo for select to authenticated using (true);
drop policy if exists metodos_crear on public.metodos_calculo;
create policy metodos_crear on public.metodos_calculo for insert to authenticated with check (public.es_admin());

drop policy if exists parametros_leer on public.parametros_institucionales;
create policy parametros_leer on public.parametros_institucionales for select to authenticated using (true);
drop policy if exists parametros_crear on public.parametros_institucionales;
create policy parametros_crear on public.parametros_institucionales for insert to authenticated
  with check (public.es_admin());
drop policy if exists parametros_editar on public.parametros_institucionales;
create policy parametros_editar on public.parametros_institucionales for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists tipos_leer on public.tipos_intervencion;
create policy tipos_leer on public.tipos_intervencion for select to authenticated using (true);
drop policy if exists tipos_editar on public.tipos_intervencion;
create policy tipos_editar on public.tipos_intervencion for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- inspecciones: lectura para todos; cualquier usuario activo registra a su nombre;
-- revisa un docente de la institución (no la suya propia) o un administrador.
drop policy if exists inspecciones_leer on public.inspecciones;
create policy inspecciones_leer on public.inspecciones for select to authenticated using (true);
drop policy if exists inspecciones_crear on public.inspecciones;
create policy inspecciones_crear on public.inspecciones for insert to authenticated
  with check (inspector_id = auth.uid() and estado_revision = 'pendiente' and public.mi_rol() is not null);
drop policy if exists inspecciones_revisar on public.inspecciones;
create policy inspecciones_revisar on public.inspecciones for update to authenticated
  using (estado_revision = 'pendiente'
         and (public.es_admin()
              or (public.mi_rol() = 'docente'
                  and inspector_id is distinct from auth.uid()
                  and public.institucion_de_arbol(arbol_id) = public.mi_institucion())))
  with check (estado_revision in ('confirmada', 'anulada') and revisado_por = auth.uid());

revoke update on public.inspecciones from anon, authenticated;
grant update (estado_revision, comentario_revision, revisado_por, revisado_en) on public.inspecciones to authenticated;

drop policy if exists inspeccion_obs_leer on public.inspeccion_observaciones;
create policy inspeccion_obs_leer on public.inspeccion_observaciones for select to authenticated using (true);
drop policy if exists inspeccion_obs_crear on public.inspeccion_observaciones;
create policy inspeccion_obs_crear on public.inspeccion_observaciones for insert to authenticated
  with check (exists (select 1 from public.inspecciones i
                      where i.id = inspeccion_id and i.inspector_id = auth.uid()
                        and i.estado_revision = 'pendiente'));

drop policy if exists inspeccion_fotos_leer on public.inspeccion_fotos;
create policy inspeccion_fotos_leer on public.inspeccion_fotos for select to authenticated using (true);
drop policy if exists inspeccion_fotos_crear on public.inspeccion_fotos;
create policy inspeccion_fotos_crear on public.inspeccion_fotos for insert to authenticated
  with check (subido_por = auth.uid()
              and exists (select 1 from public.inspecciones i
                          where i.id = inspeccion_id and i.inspector_id = auth.uid()
                            and i.estado_revision = 'pendiente'));

-- intervenciones: lectura para todos; registran y actualizan docentes de la institución y administradores.
drop policy if exists intervenciones_leer on public.intervenciones;
create policy intervenciones_leer on public.intervenciones for select to authenticated using (true);
drop policy if exists intervenciones_crear on public.intervenciones;
create policy intervenciones_crear on public.intervenciones for insert to authenticated
  with check (public.gestiona_institucion(public.institucion_de_arbol(arbol_id)));
drop policy if exists intervenciones_editar on public.intervenciones;
create policy intervenciones_editar on public.intervenciones for update to authenticated
  using (public.gestiona_institucion(public.institucion_de_arbol(arbol_id)))
  with check (public.gestiona_institucion(public.institucion_de_arbol(arbol_id)));

-- presupuestos: los consultan docentes y administradores; los administra el administrador.
drop policy if exists presupuestos_leer on public.presupuestos;
create policy presupuestos_leer on public.presupuestos for select to authenticated using (public.es_revisor());
drop policy if exists presupuestos_crear on public.presupuestos;
create policy presupuestos_crear on public.presupuestos for insert to authenticated with check (public.es_admin());
drop policy if exists presupuestos_editar on public.presupuestos;
create policy presupuestos_editar on public.presupuestos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
drop policy if exists presupuestos_borrar on public.presupuestos;
create policy presupuestos_borrar on public.presupuestos for delete to authenticated using (public.es_admin());

commit;

-- =====================================================================================
-- Después de aplicar: convierte tu cuenta en administrador (cambia el correo y la
-- institución) y ejecuta solo estas líneas en el SQL Editor.
--
--   update public.perfiles
--      set rol = 'administrador', institucion_id = 'sj'
--    where correo = 'tu-correo@institucion.edu.co';
-- =====================================================================================
