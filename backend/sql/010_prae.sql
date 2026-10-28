-- =====================================================================
-- 010 · PRAE digital con evaluación anual
-- ---------------------------------------------------------------------
-- Todo establecimiento educativo tiene un Proyecto Ambiental Escolar (PRAE)
-- sobre un diagnóstico ambiental local, que el consejo directivo y la
-- Secretaría de Educación evalúan al menos una vez al año (Decreto 1743 de
-- 1994, compilado en el Decreto 1075 de 2015).
--
-- prae: el expediente de cada institución y año, sobre cualquier tema
--   (arbolado, residuos, agua, energía…): problema, diagnóstico, objetivos y
--   comité.
-- prae_acciones: el plan de acción, con responsable, fechas, estado,
--   indicador y meta.
-- prae_evidencias: fotos, enlaces y notas de lo que se hizo.
-- prae_evaluaciones: las evaluaciones del consejo directivo, la Secretaría o
--   el comité ambiental, con el número de acta.
--
-- Las escrituras las hace el backend con la llave de servicio después de
-- comprobar permisos; el RLS deja leer a la gente de cada institución.
-- =====================================================================

create table if not exists public.prae (
  id                    uuid primary key default gen_random_uuid(),
  institucion_id        text not null references public.instituciones(id) on delete cascade,
  anio                  smallint not null check (anio between 2000 and 2100),
  tema                  text not null check (tema in ('arbolado', 'residuos', 'agua', 'energia', 'biodiversidad', 'otro')),
  tema_otro             text check (char_length(tema_otro) <= 80),
  titulo                text not null check (char_length(btrim(titulo)) between 5 and 150),
  problema              text not null check (char_length(btrim(problema)) between 10 and 2000),
  diagnostico           text check (char_length(diagnostico) <= 5000),
  objetivo_general      text check (char_length(objetivo_general) <= 1000),
  objetivos_especificos text[] not null default '{}',
  comite                text check (char_length(comite) <= 2000),
  creado_por            uuid references auth.users(id),
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now(),
  unique (institucion_id, anio)
);

create table if not exists public.prae_acciones (
  id            uuid primary key default gen_random_uuid(),
  prae_id       uuid not null references public.prae(id) on delete cascade,
  titulo        text not null check (char_length(btrim(titulo)) between 3 and 150),
  descripcion   text check (char_length(descripcion) <= 1000),
  responsable   text check (char_length(responsable) <= 120),
  fecha_inicio  date,
  fecha_fin     date,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'cumplida', 'cancelada')),
  indicador     text check (char_length(indicador) <= 300),
  meta          text check (char_length(meta) <= 300),
  orden         smallint not null default 0,
  creado_en     timestamptz not null default now(),
  check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)
);
create index if not exists prae_acciones_prae_idx on public.prae_acciones (prae_id, orden);

create table if not exists public.prae_evidencias (
  id           uuid primary key default gen_random_uuid(),
  prae_id      uuid not null references public.prae(id) on delete cascade,
  accion_id    uuid references public.prae_acciones(id) on delete set null,
  tipo         text not null check (tipo in ('foto', 'enlace', 'nota')),
  titulo       text not null check (char_length(btrim(titulo)) between 3 and 150),
  descripcion  text check (char_length(descripcion) <= 1000),
  url          text check (url ~ '^https://' and char_length(url) <= 500),
  foto_path    text,
  fecha        date not null,
  creado_por   uuid references auth.users(id),
  creado_en    timestamptz not null default now()
);
create index if not exists prae_evidencias_prae_idx on public.prae_evidencias (prae_id, fecha);

create table if not exists public.prae_evaluaciones (
  id               uuid primary key default gen_random_uuid(),
  prae_id          uuid not null references public.prae(id) on delete cascade,
  instancia        text not null check (instancia in ('consejo_directivo', 'secretaria', 'comite', 'otra')),
  fecha            date not null,
  acta             text check (char_length(acta) <= 60),
  cumplimiento_pct smallint check (cumplimiento_pct between 0 and 100),
  logros           text check (char_length(logros) <= 2000),
  dificultades     text check (char_length(dificultades) <= 2000),
  recomendaciones  text check (char_length(recomendaciones) <= 2000),
  participantes    text check (char_length(participantes) <= 500),
  registrado_por   uuid references auth.users(id),
  creado_en        timestamptz not null default now()
);
create index if not exists prae_evaluaciones_prae_idx on public.prae_evaluaciones (prae_id, fecha);

alter table public.prae              enable row level security;
alter table public.prae_acciones     enable row level security;
alter table public.prae_evidencias   enable row level security;
alter table public.prae_evaluaciones enable row level security;

drop policy if exists prae_leer on public.prae;
create policy prae_leer on public.prae for select to authenticated
  using (public.es_admin() or institucion_id = public.mi_institucion());

drop policy if exists prae_acciones_leer on public.prae_acciones;
create policy prae_acciones_leer on public.prae_acciones for select to authenticated
  using (exists (select 1 from public.prae p where p.id = prae_id
                 and (public.es_admin() or p.institucion_id = public.mi_institucion())));

drop policy if exists prae_evidencias_leer on public.prae_evidencias;
create policy prae_evidencias_leer on public.prae_evidencias for select to authenticated
  using (exists (select 1 from public.prae p where p.id = prae_id
                 and (public.es_admin() or p.institucion_id = public.mi_institucion())));

drop policy if exists prae_evaluaciones_leer on public.prae_evaluaciones;
create policy prae_evaluaciones_leer on public.prae_evaluaciones for select to authenticated
  using (exists (select 1 from public.prae p where p.id = prae_id
                 and (public.es_admin() or p.institucion_id = public.mi_institucion())));

notify pgrst, 'reload schema';
