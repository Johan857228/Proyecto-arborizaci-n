-- =====================================================================
-- 013 · Siembras con seguimiento de supervivencia
--
-- Ley 2173 de 2021 (siembra, mantenimiento y monitoreo; certificado
-- Siembra Vida Buen Ciudadano para quienes asisten a jornadas oficiales)
-- y Resolución 1491 de 2025 (georreferenciación, especies nativas de
-- viveros registrados ante el ICA, mantenimiento de 2 años).
--
--   jornadas_siembra    una jornada: fecha, lugar, si es oficial, patrocinador
--   siembras            cada plántula: especie, coordenadas, vivero, padrino
--   controles_siembra   controles a los 3, 6, 12 y 24 meses (y extra)
--   asistentes_jornada  quién asistió; el nombre de un estudiante solo sale
--                       en la lista para la alcaldía si el docente registró
--                       la autorización del acudiente para ese fin
--
-- Las escrituras las hace el backend con la llave de servicio después de
-- comprobar permisos. Plántulas y controles los lee la institución; los
-- asistentes, solo sus docentes y el administrador.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.jornadas_siembra (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  text not null references public.instituciones(id),
  nombre          text not null check (char_length(btrim(nombre)) between 3 and 120),
  fecha           date not null,
  lugar           text check (lugar is null or char_length(lugar) <= 160),
  organizador     text not null default 'colegio'
                    check (organizador in ('colegio', 'alcaldia', 'autoridad_ambiental', 'empresa', 'otro')),
  oficial         boolean not null default false,
  area_de_vida    text check (area_de_vida is null or char_length(area_de_vida) <= 160),
  patrocinador    text check (patrocinador is null or char_length(patrocinador) <= 120),
  notas           text check (notas is null or char_length(notas) <= 1000),
  creado_por      uuid not null references auth.users(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists jornadas_siembra_institucion_idx on public.jornadas_siembra (institucion_id, fecha desc);

create table if not exists public.siembras (
  id                   uuid primary key default gen_random_uuid(),
  jornada_id           uuid not null references public.jornadas_siembra(id) on delete cascade,
  institucion_id       text not null references public.instituciones(id),
  especie_id           integer references public.especies(id),
  especie_otra         text check (especie_otra is null or char_length(especie_otra) between 2 and 80),
  lat                  double precision not null check (lat between -4.3 and 13.5),
  lng                  double precision not null check (lng between -82 and -66.8),
  precision_gps_m      numeric check (precision_gps_m is null or precision_gps_m between 0 and 500),
  fecha                date not null,
  vivero               text check (vivero is null or char_length(vivero) <= 120),
  vivero_registro_ica  text check (vivero_registro_ica is null or char_length(vivero_registro_ica) <= 40),
  altura_inicial_cm    numeric check (altura_inicial_cm is null or altura_inicial_cm between 1 and 500),
  padrino_tipo         text not null default 'curso'
                         check (padrino_tipo in ('curso', 'estudiante', 'docente', 'familia', 'empresa', 'otro')),
  padrino_curso_id     uuid references public.cursos(id) on delete set null,
  padrino_usuario_id   uuid references auth.users(id) on delete set null,
  -- Familia, empresa u otro. Nunca el nombre de un estudiante: para eso está padrino_usuario_id.
  padrino_nombre       text check (padrino_nombre is null or char_length(padrino_nombre) <= 120),
  arbol_id             uuid references public.arboles(id) on delete set null,
  reemplaza_id         uuid references public.siembras(id) on delete set null,
  notas                text check (notas is null or char_length(notas) <= 500),
  creado_por           uuid not null references auth.users(id),
  creado_en            timestamptz not null default now(),
  check (especie_id is not null or especie_otra is not null)
);
create index if not exists siembras_jornada_idx on public.siembras (jornada_id);
create index if not exists siembras_institucion_idx on public.siembras (institucion_id, fecha);

create table if not exists public.controles_siembra (
  id              uuid primary key default gen_random_uuid(),
  siembra_id      uuid not null references public.siembras(id) on delete cascade,
  hito_meses      integer check (hito_meses is null or hito_meses in (3, 6, 12, 24)),
  fecha           date not null,
  estado          text not null check (estado in ('viva_buena', 'viva_regular', 'muerta', 'no_encontrada')),
  altura_cm       numeric check (altura_cm is null or altura_cm between 1 and 3000),
  mantenimiento   boolean not null default false,
  observaciones   text check (observaciones is null or char_length(observaciones) <= 500),
  registrado_por  uuid not null references auth.users(id),
  creado_en       timestamptz not null default now()
);
-- Un solo control por hito; los controles extra (hito_meses null) no tienen límite.
create unique index if not exists controles_siembra_hito on public.controles_siembra (siembra_id, hito_meses)
  where hito_meses is not null;

create table if not exists public.asistentes_jornada (
  id                           uuid primary key default gen_random_uuid(),
  jornada_id                   uuid not null references public.jornadas_siembra(id) on delete cascade,
  usuario_id                   uuid references auth.users(id) on delete cascade,
  nombre_externo               text check (nombre_externo is null or char_length(btrim(nombre_externo)) between 3 and 120),
  rol                          text not null check (rol in ('estudiante', 'docente', 'acudiente', 'voluntario', 'otro')),
  arboles_sembrados            integer check (arboles_sembrados is null or arboles_sembrados between 0 and 200),
  autoriza_certificado         boolean not null default false,
  autorizacion_registrada_por  uuid references auth.users(id),
  autorizacion_registrada_en   timestamptz,
  creado_en                    timestamptz not null default now(),
  check ((usuario_id is null) <> (nombre_externo is null)),
  -- Los estudiantes van con su cuenta (perfil y autorización del acudiente), no escritos a mano.
  check (nombre_externo is null or rol <> 'estudiante')
);
create unique index if not exists asistentes_jornada_usuario on public.asistentes_jornada (jornada_id, usuario_id)
  where usuario_id is not null;

alter table public.jornadas_siembra   enable row level security;
alter table public.siembras           enable row level security;
alter table public.controles_siembra  enable row level security;
alter table public.asistentes_jornada enable row level security;

drop policy if exists jornadas_siembra_leer on public.jornadas_siembra;
create policy jornadas_siembra_leer on public.jornadas_siembra for select to authenticated
  using (public.es_admin() or institucion_id = public.mi_institucion());

drop policy if exists siembras_leer on public.siembras;
create policy siembras_leer on public.siembras for select to authenticated
  using (public.es_admin() or institucion_id = public.mi_institucion());

drop policy if exists controles_siembra_leer on public.controles_siembra;
create policy controles_siembra_leer on public.controles_siembra for select to authenticated
  using (exists (select 1 from public.siembras s where s.id = siembra_id
                 and (public.es_admin() or s.institucion_id = public.mi_institucion())));

drop policy if exists asistentes_jornada_leer on public.asistentes_jornada;
create policy asistentes_jornada_leer on public.asistentes_jornada for select to authenticated
  using (exists (select 1 from public.jornadas_siembra j where j.id = jornada_id
                 and (public.es_admin() or (public.mi_rol() = 'docente' and j.institucion_id = public.mi_institucion()))));

notify pgrst, 'reload schema';
