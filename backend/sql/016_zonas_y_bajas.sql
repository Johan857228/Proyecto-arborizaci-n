-- =====================================================================
-- 016 · Zonas propias de cada institución y constancia de árboles borrados
--
--   zonas               las zonas de cada sede (patio, cancha, entrada...).
--                       Antes eran cinco fijas para todos los colegios; ahora
--                       las define un docente de la institución o el
--                       administrador. Arrancan con las cuatro de siempre.
--                       "Otra" no se guarda aquí: siempre está disponible y
--                       lleva el nombre en arboles.zona_otra. Cada zona tiene
--                       un tipo (patio, cancha, salones, biblioteca...) y,
--                       si se dibujó en el plano del colegio, su contorno:
--                       una lista de [latitud, longitud] (de 3 a 100 puntos).
--   arboles_eliminados  constancia de cada árbol borrado: quién, cuándo, por
--                       qué y los datos que tenía. El árbol, sus inspecciones,
--                       intervenciones, tamizajes y alertas se borran en
--                       cascada (migraciones 001 y 008).
--
-- También quita la lista fija de zonas que tenían arboles.zona y
-- curso_zonas.zona: ahora el backend comprueba que la zona exista en la
-- institución.
--
-- Las escrituras las hace el backend con la llave de servicio después de
-- comprobar permisos. Las zonas las lee cualquier usuario con sesión; la
-- constancia de borrados, los docentes de esa institución y el administrador.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.zonas (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  text not null references public.instituciones(id) on delete cascade,
  nombre          text not null check (char_length(btrim(nombre)) between 2 and 60 and btrim(nombre) <> 'Otra'),
  orden           smallint not null default 0,
  creado_en       timestamptz not null default now()
);
create unique index if not exists zonas_nombre_unico on public.zonas (institucion_id, lower(btrim(nombre)));

alter table public.zonas add column if not exists tipo text not null default 'patio'
  check (tipo in ('patio', 'cancha', 'salones', 'biblioteca', 'entrada', 'parqueadero', 'otro'));
alter table public.zonas add column if not exists contorno jsonb
  check (contorno is null or (jsonb_typeof(contorno) = 'array' and jsonb_array_length(contorno) between 3 and 100));

-- Las cuatro zonas de siempre para cada institución que aún no tiene zonas.
insert into public.zonas (institucion_id, nombre, tipo, orden)
select i.id, z.nombre, z.tipo, z.orden
from public.instituciones i
cross join (values ('Patio central', 'patio', 1), ('Entrada principal', 'entrada', 2), ('Zona deportiva', 'cancha', 3),
                   ('Bloques académicos', 'salones', 4))
  as z(nombre, tipo, orden)
where not exists (select 1 from public.zonas x where x.institucion_id = i.id);

-- Quitar la lista fija de zonas (los nombres de las restricciones dependen de cómo se creó cada tabla).
do $$
declare
  restriccion record;
begin
  for restriccion in
    select c.conrelid::regclass as tabla, c.conname as nombre
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.arboles'::regclass, 'public.curso_zonas'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%Patio central%'
  loop
    execute format('alter table %s drop constraint %I', restriccion.tabla, restriccion.nombre);
  end loop;
end $$;

create table if not exists public.arboles_eliminados (
  id              uuid primary key default gen_random_uuid(),
  arbol_id        uuid not null,
  codigo          text,
  institucion_id  text,
  nombre_comun    text,
  motivo          text not null check (char_length(btrim(motivo)) between 5 and 300),
  eliminado_por   uuid references auth.users(id) on delete set null,
  eliminado_en    timestamptz not null default now(),
  datos           jsonb not null default '{}'::jsonb
);
create index if not exists arboles_eliminados_institucion on public.arboles_eliminados (institucion_id, eliminado_en desc);

alter table public.zonas              enable row level security;
alter table public.arboles_eliminados enable row level security;

drop policy if exists zonas_leer on public.zonas;
create policy zonas_leer on public.zonas for select to authenticated using (true);

drop policy if exists arboles_eliminados_leer on public.arboles_eliminados;
create policy arboles_eliminados_leer on public.arboles_eliminados for select to authenticated
  using (public.gestiona_institucion(institucion_id));
