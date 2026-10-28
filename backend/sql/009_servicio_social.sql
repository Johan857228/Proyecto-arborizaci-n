-- =====================================================================
-- 009 · Servicio social estudiantil con horas verificadas
-- ---------------------------------------------------------------------
-- Los estudiantes de 10.° y 11.° prestan el servicio social obligatorio
-- (mínimo 80 horas, Resolución MEN 4210 de 1996, art. 6; sin él no hay
-- título de bachiller, art. 7). La app lleva la bitácora y prepara el
-- certificado; lo expide la institución.
--
-- cursos.grado: grado del curso (10 y 11 prestan servicio social). Si queda
--   vacío, el backend lo deduce del nombre ("10-A", "Once B").
-- servicio_social_parametros: meta de horas y horas que vale cada
--   inspección confirmada, por institución.
-- actividades_servicio: actividades que registra el estudiante además de
--   sus inspecciones (siembra, riego, jornada…), con foto, y que aprueba un
--   docente de su institución.
-- certificados_servicio: certificados emitidos, con código de verificación
--   (el QR del PDF lleva a /verificar/<código>).
--
-- Las escrituras las hace el backend con la llave de servicio después de
-- comprobar permisos; el RLS solo deja leer lo propio o lo de la institución.
-- =====================================================================

alter table public.cursos add column if not exists grado smallint check (grado between 0 and 11);
comment on column public.cursos.grado is 'Grado del curso (0 a 11). 10 y 11 prestan servicio social.';

create table if not exists public.servicio_social_parametros (
  institucion_id        text primary key references public.instituciones(id) on delete cascade,
  meta_horas            numeric(5, 1) not null default 80 check (meta_horas between 1 and 400),
  horas_por_inspeccion  numeric(3, 1) not null default 1 check (horas_por_inspeccion between 0 and 8),
  actualizado_por       uuid references auth.users(id),
  actualizado_en        timestamptz not null default now()
);

create table if not exists public.actividades_servicio (
  id              uuid primary key default gen_random_uuid(),
  estudiante_id   uuid not null references auth.users(id) on delete cascade,
  institucion_id  text not null references public.instituciones(id),
  tipo            text not null check (tipo in ('siembra', 'riego', 'mantenimiento', 'jornada', 'educacion', 'otra')),
  fecha           date not null,
  horas           numeric(3, 1) not null check (horas > 0 and horas <= 8),
  descripcion     text not null check (char_length(btrim(descripcion)) between 10 and 500),
  arbol_id        uuid references public.arboles(id) on delete set null,
  lat             double precision check (lat between -4.3 and 13.5),
  lng             double precision check (lng between -82.0 and -66.8),
  foto_path       text,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  revisado_por    uuid references auth.users(id),
  revisado_en     timestamptz,
  comentario      text check (char_length(comentario) <= 500),
  creado_en       timestamptz not null default now()
);
create index if not exists actividades_servicio_estudiante_idx on public.actividades_servicio (estudiante_id, fecha);
create index if not exists actividades_servicio_pendientes_idx on public.actividades_servicio (institucion_id, estado);

create table if not exists public.certificados_servicio (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique check (codigo ~ '^[A-Z2-9]{10}$'),
  estudiante_id    uuid not null references auth.users(id),
  institucion_id   text not null references public.instituciones(id),
  estudiante_nombre text not null,
  curso_nombre     text,
  horas            numeric(5, 1) not null,
  meta_horas       numeric(5, 1) not null,
  detalle          jsonb not null default '{}',
  periodo_inicio   date not null,
  periodo_fin      date not null,
  firmante_nombre  text not null check (char_length(btrim(firmante_nombre)) between 3 and 120),
  firmante_cargo   text not null check (char_length(btrim(firmante_cargo)) between 3 and 80),
  emitido_por      uuid references auth.users(id),
  emitido_en       timestamptz not null default now(),
  pdf_path         text,
  anulado_por      uuid references auth.users(id),
  anulado_en       timestamptz,
  anulado_motivo   text check (char_length(anulado_motivo) <= 500)
);
-- Un solo certificado vigente por estudiante: para corregirlo se anula y se emite otro.
create unique index if not exists certificados_servicio_vigente
  on public.certificados_servicio (estudiante_id) where anulado_en is null;

alter table public.servicio_social_parametros enable row level security;
alter table public.actividades_servicio       enable row level security;
alter table public.certificados_servicio      enable row level security;

drop policy if exists servicio_parametros_leer on public.servicio_social_parametros;
create policy servicio_parametros_leer on public.servicio_social_parametros for select to authenticated
  using (public.es_admin() or institucion_id = public.mi_institucion());

drop policy if exists actividades_servicio_leer on public.actividades_servicio;
create policy actividades_servicio_leer on public.actividades_servicio for select to authenticated
  using (estudiante_id = auth.uid() or public.es_admin()
         or (public.es_revisor() and institucion_id = public.mi_institucion()));

drop policy if exists certificados_servicio_leer on public.certificados_servicio;
create policy certificados_servicio_leer on public.certificados_servicio for select to authenticated
  using (estudiante_id = auth.uid() or public.es_admin()
         or (public.es_revisor() and institucion_id = public.mi_institucion()));

notify pgrst, 'reload schema';
