-- =====================================================================================
-- Inventario Arbóreo Escolar · Migración 003 · Validaciones en la base de datos
--
-- Aplica en Supabase los mismos límites que validan el backend (schemas.py) y el
-- formulario (frontend/src/features/trees/schemas.ts), para que ningún dato fuera de
-- rango entre aunque alguien llame a la API de Supabase directamente:
--   · DAP mayor que 0 y hasta 500 cm; altura hasta 25 m; copa mayor que 0 y hasta 40 m.
--   · Coordenadas dentro de Colombia (latitud −4.3 a 13.5, longitud −82 a −66.8).
--   · Textos de "Otra" (zona e interferencia) de 3 a 120 caracteres sin contar espacios
--     al inicio o al final.
--   · Una sola foto general y una sola de detalle por árbol.
--
-- Requiere la migración 001 (tabla inspecciones). Se puede ejecutar más de una vez.
--
-- Las reglas se crean NOT VALID: se exigen a todo registro nuevo o editado, y luego se
-- intenta validar lo que ya existía. Si algún registro anterior no las cumple, la regla
-- queda activa para lo nuevo y el script avisa (NOTICE) con la consulta para encontrarlos.
-- Ojo: las medidas actuales de un árbol salen de su última inspección, así que si un valor
-- estaba mal al registrarlo hay que corregirlo en arboles y en su inspección de registro.
-- =====================================================================================

begin;

create or replace function pg_temp.agregar_regla(p_tabla text, p_nombre text, p_condicion text) returns void
language plpgsql as $$
declare
  fuera integer;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = format('public.%I', p_tabla)::regclass and conname = p_nombre
  ) then
    execute format('alter table public.%I add constraint %I check (%s) not valid', p_tabla, p_nombre, p_condicion);
  end if;
  execute format('select count(*) from public.%I where not (%s)', p_tabla, p_condicion) into fuera;
  if fuera = 0 then
    execute format('alter table public.%I validate constraint %I', p_tabla, p_nombre);
  else
    raise notice 'Regla % en %: % registro(s) anteriores no la cumplen. Se exige a los nuevos. Para verlos: select * from public.% where not (%); corrígelos y vuelve a ejecutar este archivo para validarla.',
      p_nombre, p_tabla, fuera, p_tabla, p_condicion;
  end if;
end
$$;

-- Un texto vacío en "Otra" cuando la opción elegida no es "Otra" no aporta nada: se deja en NULL.
-- (Si la opción sí es "Otra" y el texto está vacío, se reporta abajo para completarlo a mano.)
update public.arboles set zona_otra = null
 where zona <> 'Otra' and zona_otra is not null and btrim(zona_otra) = '';
update public.arboles set interferencia_otra = null
 where interferencia <> 'Otra infraestructura' and interferencia_otra is not null and btrim(interferencia_otra) = '';

do $$
begin
-- ------------------------------------------------------------------ arboles
perform pg_temp.agregar_regla('arboles', 'arboles_dap_rango', 'dap_cm > 0 and dap_cm <= 500');
perform pg_temp.agregar_regla('arboles', 'arboles_altura_rango', 'altura_m > 0 and altura_m <= 25');
perform pg_temp.agregar_regla('arboles', 'arboles_copa_rango', 'copa_m > 0 and copa_m <= 40');
perform pg_temp.agregar_regla('arboles', 'arboles_coordenadas_colombia',
  'lat between -4.3 and 13.5 and lng between -82 and -66.8');
perform pg_temp.agregar_regla('arboles', 'arboles_zona_otra_largo',
  'zona_otra is null or char_length(btrim(zona_otra)) between 3 and 120');
perform pg_temp.agregar_regla('arboles', 'arboles_interferencia_otra_largo',
  'interferencia_otra is null or char_length(btrim(interferencia_otra)) between 3 and 120');

-- ------------------------------------------------------------------ inspecciones
perform pg_temp.agregar_regla('inspecciones', 'inspecciones_dap_rango', 'dap_cm > 0 and dap_cm <= 500');
perform pg_temp.agregar_regla('inspecciones', 'inspecciones_copa_rango', 'copa_m > 0 and copa_m <= 40');
-- Latitud y longitud van juntas o ninguna (una sola daría NULL y el CHECK la dejaría pasar).
perform pg_temp.agregar_regla('inspecciones', 'inspecciones_coordenadas_colombia',
  '(lat is null and lng is null) or (lat is not null and lng is not null'
  ' and lat between -4.3 and 13.5 and lng between -82 and -66.8)');
perform pg_temp.agregar_regla('inspecciones', 'inspecciones_interferencia_otra_largo',
  'interferencia_otra is null or char_length(btrim(interferencia_otra)) between 3 and 120');
end
$$;

-- ------------------------------------------------------------------ arbol_fotos
-- Una sola foto general y una sola de detalle por árbol (las adicionales, hasta 3, las
-- controla el backend). Si ya hay duplicados, se avisa en lugar de fallar.
do $$
declare
  repetidas integer;
begin
  if to_regclass('public.arbol_fotos_tipo_unico') is null then
    select count(*) into repetidas from (
      select 1 from public.arbol_fotos where tipo in ('completo', 'detalle')
      group by arbol_id, tipo having count(*) > 1
    ) d;
    if repetidas = 0 then
      create unique index arbol_fotos_tipo_unico on public.arbol_fotos (arbol_id, tipo)
        where tipo in ('completo', 'detalle');
    else
      raise notice 'arbol_fotos: % árbol(es) tienen más de una foto general o de detalle. Para verlos: select arbol_id, tipo, count(*) from public.arbol_fotos where tipo in (''completo'', ''detalle'') group by 1, 2 having count(*) > 1; borra las sobrantes y vuelve a ejecutar este archivo.', repetidas;
    end if;
  end if;
end
$$;

commit;
