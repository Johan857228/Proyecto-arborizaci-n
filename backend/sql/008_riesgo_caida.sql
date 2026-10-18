-- =====================================================================
-- 008 · Tamizaje de riesgo de caída y alertas
-- ---------------------------------------------------------------------
-- tamizajes_riesgo: la lista visual que se llena en cada inspección
--   (inclinación, raíces, ramas secas, cavidades, hongos, grietas y qué hay
--   debajo) y la categoría que resulta: bajo, medio, alto o inminente
--   (backend/servicios/riesgo_caida.py).
-- alertas_riesgo: cuando la categoría es alta o inminente se abre una alerta
--   por árbol. Un docente o el administrador la confirma o la descarta, se deja
--   constancia del aviso a rectoría y se cierra cuando se atiende.
-- contactos_emergencia: a quién avisar en cada sede (rectoría, Consejo
--   Municipal de Gestión del Riesgo, autoridad ambiental).
--
-- Es un tamizaje, no un dictamen técnico: la poda o tala la autoriza la
-- autoridad ambiental, previa visita técnica (Decreto 1076 de 2015,
-- art. 2.2.1.1.9.3).
--
-- Las escrituras las hace el backend con la llave de servicio después de
-- comprobar permisos; el RLS solo deja leer a la gente de cada institución.
-- =====================================================================

create table if not exists public.tamizajes_riesgo (
  inspeccion_id  uuid primary key references public.inspecciones(id) on delete cascade,
  arbol_id       uuid not null references public.arboles(id) on delete cascade,
  respuestas     jsonb not null,
  probabilidad   text not null check (probabilidad in ('improbable', 'posible', 'probable', 'inminente')),
  ocupacion      text not null check (ocupacion in ('rara', 'ocasional', 'frecuente', 'constante')),
  categoria      text not null check (categoria in ('bajo', 'medio', 'alto', 'inminente')),
  motivos        text[] not null default '{}',
  creado_en      timestamptz not null default now()
);
create index if not exists tamizajes_riesgo_arbol_idx on public.tamizajes_riesgo (arbol_id, creado_en desc);

create table if not exists public.alertas_riesgo (
  id                    uuid primary key default gen_random_uuid(),
  arbol_id              uuid not null references public.arboles(id) on delete cascade,
  institucion_id        text not null references public.instituciones(id),
  inspeccion_id         uuid not null references public.inspecciones(id) on delete cascade,
  categoria             text not null check (categoria in ('alto', 'inminente')),
  estado                text not null default 'por_confirmar'
                          check (estado in ('por_confirmar', 'confirmada', 'descartada', 'atendida')),
  motivos               text[] not null default '{}',
  creada_por            uuid references auth.users(id),
  creada_en             timestamptz not null default now(),
  actualizada_en        timestamptz not null default now(),
  revisada_por          uuid references auth.users(id),
  revisada_en           timestamptz,
  comentario_revision   text check (char_length(comentario_revision) <= 500),
  rectoria_avisada_por  uuid references auth.users(id),
  rectoria_avisada_en   timestamptz,
  rectoria_medio        text check (rectoria_medio in ('whatsapp', 'correo', 'llamada', 'en_persona', 'otro')),
  atendida_por          uuid references auth.users(id),
  atendida_en           timestamptz,
  nota_cierre           text check (char_length(nota_cierre) <= 500),
  intervencion_id       uuid references public.intervenciones(id) on delete set null
);
-- Una sola alerta abierta por árbol: una inspección nueva la actualiza en lugar de repetirla.
create unique index if not exists alertas_riesgo_una_abierta
  on public.alertas_riesgo (arbol_id) where estado in ('por_confirmar', 'confirmada');
create index if not exists alertas_riesgo_institucion_idx on public.alertas_riesgo (institucion_id, estado);

create table if not exists public.contactos_emergencia (
  institucion_id                text primary key references public.instituciones(id) on delete cascade,
  rectoria_nombre               text check (char_length(rectoria_nombre) <= 120),
  rectoria_telefono             text check (rectoria_telefono ~ '^[0-9 +()-]{7,20}$'),
  rectoria_correo               text check (char_length(rectoria_correo) <= 160),
  gestion_riesgo_telefono       text check (gestion_riesgo_telefono ~ '^[0-9 +()-]{3,20}$'),
  autoridad_ambiental_nombre    text check (char_length(autoridad_ambiental_nombre) <= 120),
  autoridad_ambiental_telefono  text check (autoridad_ambiental_telefono ~ '^[0-9 +()-]{3,20}$'),
  actualizado_por               uuid references auth.users(id),
  actualizado_en                timestamptz not null default now()
);

alter table public.tamizajes_riesgo     enable row level security;
alter table public.alertas_riesgo       enable row level security;
alter table public.contactos_emergencia enable row level security;

drop policy if exists tamizajes_riesgo_leer on public.tamizajes_riesgo;
create policy tamizajes_riesgo_leer on public.tamizajes_riesgo for select to authenticated
  using (public.es_admin() or exists (
    select 1 from public.arboles a where a.id = arbol_id and a.institucion_id = public.mi_institucion()));

drop policy if exists alertas_riesgo_leer on public.alertas_riesgo;
create policy alertas_riesgo_leer on public.alertas_riesgo for select to authenticated
  using (public.es_admin() or institucion_id = public.mi_institucion());

drop policy if exists contactos_emergencia_leer on public.contactos_emergencia;
create policy contactos_emergencia_leer on public.contactos_emergencia for select to authenticated
  using (public.es_admin() or institucion_id = public.mi_institucion());

notify pgrst, 'reload schema';
