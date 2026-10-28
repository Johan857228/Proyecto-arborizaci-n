-- =====================================================================================
-- Inventario Arbóreo Escolar · Migración 006 · Código DANE de cada sede
--
-- Las Secretarías de Educación identifican cada sede por su código DANE (12 dígitos) y el
-- municipio por su código DIVIPOLA (5 dígitos). Con ellos, lo que exporta la app se puede
-- cruzar con el SIMAT y con los reportes oficiales. Los tres datos son opcionales: los asigna
-- un administrador desde Configuración.
--
-- Requiere la migración 001. Se puede ejecutar más de una vez.
-- =====================================================================================

begin;

alter table public.instituciones
  add column if not exists codigo_dane  text,
  add column if not exists divipola     text,
  add column if not exists municipio    text;

alter table public.instituciones drop constraint if exists instituciones_codigo_dane_chk;
alter table public.instituciones add constraint instituciones_codigo_dane_chk
  check (codigo_dane is null or codigo_dane ~ '^[0-9]{12}$');

alter table public.instituciones drop constraint if exists instituciones_divipola_chk;
alter table public.instituciones add constraint instituciones_divipola_chk
  check (divipola is null or divipola ~ '^[0-9]{5}$');

alter table public.instituciones drop constraint if exists instituciones_municipio_chk;
alter table public.instituciones add constraint instituciones_municipio_chk
  check (municipio is null or char_length(btrim(municipio)) between 2 and 80);

-- Un código DANE identifica una sola sede.
create unique index if not exists instituciones_codigo_dane_uidx
  on public.instituciones (codigo_dane) where codigo_dane is not null;

commit;
