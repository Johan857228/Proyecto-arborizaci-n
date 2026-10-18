-- =====================================================================
-- 011 · Mapa con capas: origen de cada especie (nativa o exótica)
--
-- El mapa colorea los árboles por origen. Si una especie no tiene origen
-- guardado, el backend usa su lista de especies conocidas
-- (servicios/mapa.py); lo que se guarda aquí la reemplaza. Lo edita el
-- administrador desde el mapa (PATCH /especies/{id}).
--
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

alter table public.especies
  add column if not exists origen text check (origen in ('nativa', 'exotica'));

comment on column public.especies.origen is
  'Origen de la especie en Colombia: nativa o exotica. NULL = usar la lista del backend o sin clasificar.';

notify pgrst, 'reload schema';
