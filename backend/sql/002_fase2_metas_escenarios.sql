-- =====================================================================================
-- Inventario Arbóreo Escolar · Migración 002 · Módulos de la Fase 2
--
-- Metas institucionales por indicador y periodo, y escenarios presupuestales guardados.
-- Requiere la migración 001. Se puede ejecutar más de una vez.
-- =====================================================================================

begin;

-- Los indicadores se calculan en el backend (servicios/indicadores.py); aquí solo se
-- guarda la meta. El sentido (mayor o menor es mejor) lo define el backend.
create table if not exists public.metas (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  text not null references public.instituciones(id),
  indicador       text not null check (indicador in (
                    'arboles_registrados', 'inspecciones_confirmadas', 'cobertura_inspeccion_pct',
                    'arboles_sanos_pct', 'arboles_criticos', 'intervenciones_ejecutadas',
                    'co2_almacenado_kg', 'cobertura_copa_m2', 'gasto_ejecutado')),
  fecha_inicio    date not null,
  fecha_fin       date not null,
  valor_meta      numeric(14,2) not null check (valor_meta >= 0),
  descripcion     text check (descripcion is null or char_length(descripcion) <= 300),
  creado_por      uuid references auth.users(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio),
  check (indicador not in ('cobertura_inspeccion_pct', 'arboles_sanos_pct') or valor_meta <= 100),
  unique (institucion_id, indicador, fecha_inicio, fecha_fin)
);

-- Un escenario guarda los parámetros de la simulación y su resultado tal como se vio
-- al guardarlo (las recomendaciones cambian con cada inspección nueva).
create table if not exists public.escenarios_presupuestales (
  id                   uuid primary key default gen_random_uuid(),
  institucion_id       text not null references public.instituciones(id),
  nombre               text not null check (char_length(btrim(nombre)) between 3 and 80),
  monto                numeric(14,2) not null check (monto >= 0),
  criterio             text not null check (criterio in ('riesgo', 'cantidad')),
  incluir_programadas  boolean not null default true,
  tipos                text[],
  resultado            jsonb not null check (jsonb_typeof(resultado) = 'object'),
  creado_por           uuid references auth.users(id) default auth.uid(),
  creado_en            timestamptz not null default now()
);
create index if not exists escenarios_institucion_idx on public.escenarios_presupuestales (institucion_id, creado_en desc);

alter table public.metas                      enable row level security;
alter table public.escenarios_presupuestales  enable row level security;

drop policy if exists metas_leer on public.metas;
create policy metas_leer on public.metas for select to authenticated using (true);
drop policy if exists metas_crear on public.metas;
create policy metas_crear on public.metas for insert to authenticated with check (public.es_admin());
drop policy if exists metas_editar on public.metas;
create policy metas_editar on public.metas for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
drop policy if exists metas_borrar on public.metas;
create policy metas_borrar on public.metas for delete to authenticated using (public.es_admin());

drop policy if exists escenarios_leer on public.escenarios_presupuestales;
create policy escenarios_leer on public.escenarios_presupuestales for select to authenticated
  using (public.es_revisor());
drop policy if exists escenarios_crear on public.escenarios_presupuestales;
create policy escenarios_crear on public.escenarios_presupuestales for insert to authenticated
  with check (public.es_admin());
drop policy if exists escenarios_borrar on public.escenarios_presupuestales;
create policy escenarios_borrar on public.escenarios_presupuestales for delete to authenticated
  using (public.es_admin());

commit;
