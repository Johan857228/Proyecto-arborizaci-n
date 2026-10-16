-- =====================================================================================
-- Inventario Arbóreo Escolar · Migración 004 · Agentes bióticos
--
-- Variables FB-01 a FB-06 de la tabla de agentes bióticos. Se registran en cada inspección
-- (la primera es la del registro del árbol), igual que los hallazgos:
--   FB-01 insectos, insectos_parte, insectos_sev       tipo, parte afectada, severidad 0–4
--   FB-02 enfermedad, enfermedad_parte, enfermedad_sev fúngica, bacteriana, viral o indeterminada
--   FB-03 muestra_lab, cod_muestra_lab                 sí/no y código con que se rotuló
--   FB-04 hemiparasitas, pct_hemiparasitas             pajarito (Loranthaceae) o cuscuta; % de copa
--   FB-05 bejucos                                      severidad 0–4 (porción del individuo cubierta)
--   FB-06 epifitas                                     selección múltiple
--
-- Requiere la migración 001. Se puede ejecutar más de una vez. Las inspecciones anteriores
-- quedan sin agentes registrados (columnas vacías), así que todas las reglas se validan de una vez.
-- Cuidado con los CHECK: una condición que da NULL se toma como cumplida, por eso cada regla
-- pregunta explícitamente por "is not null" donde un dato es obligatorio.
-- =====================================================================================

begin;

alter table public.inspecciones
  add column if not exists insectos           text,
  add column if not exists insectos_parte     text,
  add column if not exists insectos_sev       smallint,
  add column if not exists enfermedad         text,
  add column if not exists enfermedad_parte   text,
  add column if not exists enfermedad_sev     smallint,
  add column if not exists muestra_lab        boolean not null default false,
  add column if not exists cod_muestra_lab    text,
  add column if not exists hemiparasitas      text,
  add column if not exists pct_hemiparasitas  numeric(5,2),
  add column if not exists bejucos            smallint,
  add column if not exists epifitas           text[] not null default '{}';

do $$
declare
  regla record;
begin
  for regla in select * from (values
    ('inspecciones_insectos_tipo',
     $c$insectos is null or insectos in ('defoliadores', 'chupadores', 'escamas', 'arrieras', 'minadores', 'agalladores')$c$),
    ('inspecciones_insectos_completo',
     $c$(insectos is null and insectos_parte is null and insectos_sev is null)
        or (insectos is not null and insectos_parte is not null and insectos_sev is not null)$c$),
    ('inspecciones_enfermedad_tipo',
     $c$enfermedad is null or enfermedad in ('fungica', 'bacteriana', 'viral', 'indeterminada')$c$),
    ('inspecciones_enfermedad_completa',
     $c$(enfermedad is null and enfermedad_parte is null and enfermedad_sev is null)
        or (enfermedad is not null and enfermedad_parte is not null and enfermedad_sev is not null)$c$),
    ('inspecciones_partes_arbol',
     $c$(insectos_parte is null or insectos_parte in ('hojas', 'ramas', 'tronco', 'raiz', 'flores_frutos'))
        and (enfermedad_parte is null or enfermedad_parte in ('hojas', 'ramas', 'tronco', 'raiz', 'flores_frutos'))$c$),
    ('inspecciones_severidades',
     $c$(insectos_sev is null or insectos_sev between 0 and 4)
        and (enfermedad_sev is null or enfermedad_sev between 0 and 4)
        and (bejucos is null or bejucos between 0 and 4)$c$),
    ('inspecciones_muestra_lab',
     $c$(muestra_lab and cod_muestra_lab is not null and cod_muestra_lab ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$')
        or (not muestra_lab and cod_muestra_lab is null)$c$),
    ('inspecciones_hemiparasitas',
     $c$(hemiparasitas is null and pct_hemiparasitas is null)
        or (hemiparasitas in ('pajarito', 'cuscuta') and pct_hemiparasitas is not null
            and pct_hemiparasitas > 0 and pct_hemiparasitas <= 100)$c$),
    ('inspecciones_epifitas',
     $c$epifitas <@ array['bromelias', 'orquideas', 'helechos', 'liquenes', 'musgos']::text[]$c$)
  ) as r(nombre, condicion)
  loop
    -- Se vuelve a crear cada vez: así una versión corregida de la regla reemplaza a la anterior.
    execute format('alter table public.inspecciones drop constraint if exists %I', regla.nombre);
    execute format('alter table public.inspecciones add constraint %I check (%s)', regla.nombre, regla.condicion);
  end loop;
end
$$;

-- Para los reportes por agente (cuántos árboles con insectos, enfermedad o pajarito).
create index if not exists inspecciones_con_agentes_idx on public.inspecciones (arbol_id)
  where insectos is not null or enfermedad is not null or hemiparasitas is not null;

commit;
