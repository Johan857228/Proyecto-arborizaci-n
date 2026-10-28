-- =====================================================================
-- 015 · Catálogo de especies con fuente oficial y precisión de la IA
--
--   especies_fuente_oficial  lo que dicen las listas oficiales que el SiB
--                            Colombia publica en GBIF sobre cada especie:
--                            Catálogo de Plantas y Líquenes de Colombia
--                            (UNAL), plantas exóticas (Instituto Humboldt),
--                            GRIIS Colombia, especies amenazadas (Resolución
--                            0126 de 2024) y plantas de bosque seco. Cada
--                            consulta guarda la versión y el DOI de la lista.
--                            La veda la registra el administrador con su norma.
--   analisis_ia              cada análisis de fotos con IA: qué especie
--                            sugirió, con qué confianza, cuántos tokens usó y
--                            cuánto costó. Se enlaza al árbol que se guardó
--                            con esa sugerencia para medir los aciertos contra
--                            lo que confirma el docente. No guarda las fotos.
--
-- Las escrituras las hace el backend con la llave de servicio después de
-- comprobar permisos. La ficha oficial la lee cualquier usuario; los
-- análisis de IA, solo el administrador.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.especies_fuente_oficial (
  especie_id          integer primary key references public.especies(id) on delete cascade,
  nombre_consultado   text not null,
  nombre_aceptado     text,
  coincidencia        text not null check (coincidencia in ('exacta', 'sinonimo', 'no_encontrada')),
  en_catalogo         boolean not null default false,
  departamentos       text[] not null default '{}',
  en_cesar            boolean not null default false,
  forma_de_vida       text,
  origen              text check (origen in ('nativa', 'exotica')),
  estatus             text check (estatus in ('cultivada', 'naturalizada', 'trasplantada')),
  invasora            boolean,
  riesgo_invasion     text check (riesgo_invasion is null or char_length(riesgo_invasion) <= 80),
  amenaza             text check (amenaza in ('CR', 'EN', 'VU')),
  bosque_seco         boolean not null default false,
  avisos              text[] not null default '{}',
  -- [{clave, titulo, editor, version, doi, publicado, encontrada, registro_url, dato}]
  fuentes             jsonb not null default '[]'::jsonb,
  consultado_en       timestamptz not null default now(),
  consultado_por      uuid references auth.users(id) on delete set null,
  -- Veda: la registra el administrador con la norma que la establece.
  veda                text check (veda is null or char_length(veda) between 3 and 300),
  veda_url            text check (veda_url is null or veda_url ~ '^https?://'),
  veda_registrada_por uuid references auth.users(id) on delete set null,
  veda_registrada_en  timestamptz
);

create table if not exists public.analisis_ia (
  id                     uuid primary key default gen_random_uuid(),
  creado_en              timestamptz not null default now(),
  usuario_id             uuid references auth.users(id) on delete set null,
  institucion_id         text references public.instituciones(id) on delete set null,
  -- campo: registro de un árbol; prueba: foto de una especie conocida que sube el administrador.
  tipo                   text not null default 'campo' check (tipo in ('campo', 'prueba')),
  modelo                 text not null check (char_length(modelo) <= 80),
  fotos                  smallint not null check (fotos between 1 and 2),
  es_arbol               boolean,
  calidad_foto           text check (calidad_foto in ('buena', 'regular', 'mala')),
  especie_sugerida_id    integer references public.especies(id) on delete set null,
  nombre_probable        text check (nombre_probable is null or char_length(nombre_probable) <= 120),
  confianza              text check (confianza in ('alta', 'media', 'baja')),
  especie_real_id        integer references public.especies(id) on delete set null,
  arbol_id               uuid references public.arboles(id) on delete set null,
  tokens_entrada         integer not null default 0 check (tokens_entrada >= 0),
  tokens_salida          integer not null default 0 check (tokens_salida >= 0),
  tokens_cache_lectura   integer not null default 0 check (tokens_cache_lectura >= 0),
  tokens_cache_escritura integer not null default 0 check (tokens_cache_escritura >= 0),
  costo_usd              numeric(12, 6) check (costo_usd is null or costo_usd >= 0),
  duracion_ms            integer check (duracion_ms is null or duracion_ms >= 0),
  check (tipo <> 'prueba' or especie_real_id is not null)
);
create index if not exists analisis_ia_creado_idx on public.analisis_ia (creado_en desc);
create index if not exists analisis_ia_arbol_idx on public.analisis_ia (arbol_id) where arbol_id is not null;

alter table public.especies_fuente_oficial enable row level security;
alter table public.analisis_ia enable row level security;

drop policy if exists especies_fuente_oficial_leer on public.especies_fuente_oficial;
create policy especies_fuente_oficial_leer on public.especies_fuente_oficial for select to authenticated
  using (true);

drop policy if exists analisis_ia_leer on public.analisis_ia;
create policy analisis_ia_leer on public.analisis_ia for select to authenticated
  using (public.es_admin());

comment on table public.especies_fuente_oficial is
  'Clasificación de cada especie según las listas oficiales publicadas por el SiB Colombia en GBIF, con versión y DOI.';
comment on table public.analisis_ia is
  'Análisis de fotos con IA: sugerencia, confianza, tokens y costo; enlazado al árbol para medir aciertos. Sin fotos.';

notify pgrst, 'reload schema';
