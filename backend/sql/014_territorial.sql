-- =====================================================================
-- 014 · Tablero territorial e informe anual de la Secretaría
--
-- Ley 2173 de 2021, art. 12, parágrafo: las Secretarías de Educación
-- certificadas consolidan cada año los avances de los PRAE de sus
-- colegios (con las acciones de reforestación y de cambio climático) y
-- los presentan al MEN. Ley 1549 de 2012: seguimiento de la educación
-- ambiental en el territorio.
--
--   rol 'territorial'      funcionario de una Secretaría, autoridad
--                          ambiental o Gobernación: no pertenece a un
--                          colegio y ve el tablero de su territorio
--   territorios            municipios (DIVIPOLA) y/o colegios que abarca
--   miembros_territorio    quién ve cada territorio
--   informes_territoriales los textos editables del informe anual
--
-- El tablero solo muestra cifras por colegio, sin datos de personas. Las
-- escrituras las hace el backend (el administrador crea los territorios).
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('administrador', 'docente', 'estudiante', 'territorial'));

create table if not exists public.territorios (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (char_length(btrim(nombre)) between 3 and 160),
  tipo             text not null default 'secretaria_educacion'
                     check (tipo in ('secretaria_educacion', 'autoridad_ambiental', 'gobernacion', 'alcaldia', 'otro')),
  divipolas        text[] not null default '{}',
  institucion_ids  text[] not null default '{}',
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  check (cardinality(divipolas) <= 200),
  check (cardinality(institucion_ids) <= 2000)
);

create table if not exists public.miembros_territorio (
  territorio_id  uuid not null references public.territorios(id) on delete cascade,
  usuario_id     uuid not null references public.perfiles(usuario_id) on delete cascade,
  creado_en      timestamptz not null default now(),
  primary key (territorio_id, usuario_id)
);

create table if not exists public.informes_territoriales (
  id              uuid primary key default gen_random_uuid(),
  territorio_id   uuid not null references public.territorios(id) on delete cascade,
  anio            integer not null check (anio between 2020 and 2100),
  secciones       jsonb not null default '{}'::jsonb,
  estado          text not null default 'borrador' check (estado in ('borrador', 'final')),
  actualizado_por uuid references auth.users(id),
  actualizado_en  timestamptz not null default now(),
  unique (territorio_id, anio)
);

alter table public.territorios            enable row level security;
alter table public.miembros_territorio    enable row level security;
alter table public.informes_territoriales enable row level security;

drop policy if exists territorios_leer on public.territorios;
create policy territorios_leer on public.territorios for select to authenticated
  using (public.es_admin() or exists (select 1 from public.miembros_territorio m
                                      where m.territorio_id = territorios.id and m.usuario_id = auth.uid()));

drop policy if exists miembros_territorio_leer on public.miembros_territorio;
create policy miembros_territorio_leer on public.miembros_territorio for select to authenticated
  using (public.es_admin() or usuario_id = auth.uid());

drop policy if exists informes_territoriales_leer on public.informes_territoriales;
create policy informes_territoriales_leer on public.informes_territoriales for select to authenticated
  using (public.es_admin() or exists (select 1 from public.miembros_territorio m
                                      where m.territorio_id = informes_territoriales.territorio_id and m.usuario_id = auth.uid()));

notify pgrst, 'reload schema';
