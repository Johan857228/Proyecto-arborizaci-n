-- =====================================================================================
-- Inventario Arbóreo Escolar · Migración 005 · Privacidad de menores y derechos de datos
--
-- Ley 1581 de 2012 (art. 7: datos de niños, niñas y adolescentes) y Decreto 1377 de 2013
-- (art. 12, compilado en el DUR 1074 art. 2.2.2.25.2.9: autoriza el representante legal tras
-- escuchar al menor). Esta migración agrega:
--   1. perfiles.alias y la aceptación de la política de tratamiento (versión y fecha).
--   2. consentimientos: autorización del acudiente para el tratamiento de los datos del estudiante.
--   3. solicitudes_datos: consultas y reclamos (rectificación, supresión, revocatoria).
--   4. perfiles_publicos: el nombre real solo lo ven la propia persona, los docentes de su
--      institución y los administradores; los demás ven el alias o las iniciales.
--
-- Requiere la migración 001. Se puede ejecutar más de una vez.
-- =====================================================================================

begin;

-- ------------------------------------------------------------------ 1. Perfiles
alter table public.perfiles
  add column if not exists alias                 text,
  add column if not exists politica_version      text,
  add column if not exists politica_aceptada_en  timestamptz;

alter table public.perfiles drop constraint if exists perfiles_alias_chk;
alter table public.perfiles add constraint perfiles_alias_chk check (
  alias is null or (char_length(btrim(alias)) between 3 and 30 and position('@' in alias) = 0 and alias !~ '[0-9]{7,}')
);

-- Iniciales para mostrar en rankings sin revelar el nombre: "Laura Martínez Díaz" → "L. M."
create or replace function public.iniciales(p_nombre text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(
      concat_ws(' ',
        upper(left(split_part(btrim(p_nombre), ' ', 1), 1)) || '.',
        nullif(upper(left(split_part(btrim(p_nombre), ' ', 2), 1)), '') || '.'
      ), '.'),
    'Participante')
$$;

-- Nombre visible para cada quien. Sigue con las mismas columnas que la migración 001, así que
-- rankings, cursos, revisión y reportes no cambian: docentes y administradores ven el nombre real.
create or replace view public.perfiles_publicos as
  select usuario_id,
         case
           when usuario_id = auth.uid()
             or public.es_admin()
             or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion())
           then nombre
           else coalesce(nullif(btrim(alias), ''), public.iniciales(nombre))
         end as nombre,
         rol, institucion_id, curso_id, activo
  from public.perfiles;
revoke all on public.perfiles_publicos from anon;
grant select on public.perfiles_publicos to authenticated;

-- ------------------------------------------------------------------ 2. Consentimientos
create table if not exists public.consentimientos (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid not null references public.perfiles(usuario_id) on delete cascade,
  institucion_id        text references public.instituciones(id),
  acudiente_nombre      text not null check (char_length(btrim(acudiente_nombre)) between 3 and 120),
  acudiente_documento   text not null check (acudiente_documento ~ '^[0-9A-Za-z-]{4,20}$'),
  parentesco            text not null check (parentesco in ('madre', 'padre', 'acudiente', 'otro')),
  acudiente_contacto    text check (acudiente_contacto is null or char_length(acudiente_contacto) <= 120),
  -- firma_app: el acudiente firma escribiendo su nombre en la app; documento: formato físico escaneado.
  metodo                text not null check (metodo in ('firma_app', 'documento')),
  firma                 text check (firma is null or char_length(btrim(firma)) between 3 and 120),
  documento_path        text,
  estudiante_escuchado  boolean not null,
  autoriza_tratamiento  boolean not null check (autoriza_tratamiento),
  version_politica      text not null,
  registrado_por        uuid not null default auth.uid(),
  creado_en             timestamptz not null default now(),
  revocado_en           timestamptz,
  revocado_por          uuid,
  check (metodo <> 'firma_app' or firma is not null),
  check (metodo <> 'documento' or documento_path is not null)
);
create index if not exists consentimientos_usuario_idx on public.consentimientos (usuario_id);

-- ------------------------------------------------------------------ 3. Solicitudes de datos
-- Plazos de la Ley 1581: consultas en 10 días hábiles (art. 14); reclamos en 15 (art. 15).
create table if not exists public.solicitudes_datos (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null default auth.uid() references public.perfiles(usuario_id) on delete cascade,
  institucion_id  text references public.instituciones(id),
  tipo            text not null check (tipo in ('consulta', 'rectificacion', 'supresion', 'revocatoria')),
  detalle         text not null check (char_length(btrim(detalle)) between 5 and 1000),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'atendida', 'rechazada')),
  respuesta       text check (respuesta is null or char_length(respuesta) <= 1000),
  creado_en       timestamptz not null default now(),
  atendida_en     timestamptz,
  atendida_por    uuid
);
create index if not exists solicitudes_datos_usuario_idx on public.solicitudes_datos (usuario_id);

-- ------------------------------------------------------------------ RLS
alter table public.consentimientos   enable row level security;
alter table public.solicitudes_datos enable row level security;

-- Lectura: la propia persona, el docente de su institución y el administrador.
drop policy if exists consentimientos_leer on public.consentimientos;
create policy consentimientos_leer on public.consentimientos for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin()
         or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion()));
-- Registro: el estudiante con su acudiente presente, o el docente/administrador de la institución.
drop policy if exists consentimientos_crear on public.consentimientos;
create policy consentimientos_crear on public.consentimientos for insert to authenticated
  with check (registrado_por = auth.uid()
              and (usuario_id = auth.uid() or public.es_admin()
                   or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion())));
-- Revocatoria: las mismas personas que pueden leerla.
drop policy if exists consentimientos_revocar on public.consentimientos;
create policy consentimientos_revocar on public.consentimientos for update to authenticated
  using (usuario_id = auth.uid() or public.es_admin()
         or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion()));

drop policy if exists solicitudes_leer on public.solicitudes_datos;
create policy solicitudes_leer on public.solicitudes_datos for select to authenticated
  using (usuario_id = auth.uid() or public.es_admin()
         or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion()));
drop policy if exists solicitudes_crear on public.solicitudes_datos;
create policy solicitudes_crear on public.solicitudes_datos for insert to authenticated
  with check (usuario_id = auth.uid());
drop policy if exists solicitudes_atender on public.solicitudes_datos;
create policy solicitudes_atender on public.solicitudes_datos for update to authenticated
  using (public.es_admin() or (public.mi_rol() = 'docente' and institucion_id = public.mi_institucion()));

commit;
