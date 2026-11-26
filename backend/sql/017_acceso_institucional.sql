-- Limita el inventario y los registros escolares al colegio del perfil activo.
-- Aplica después de las migraciones anteriores. Puede volver a ejecutarse.
begin;

do $$
declare
  tabla text;
  expresion text;
  alcance constant text :=
    '(select public.es_admin()) or
     ((select public.mi_rol()) is not null and institucion_id = (select public.mi_institucion()))';
begin
  -- El inventario se comparte dentro del colegio, independientemente de su autor.
  -- La política restrictiva también limita cualquier política previa más amplia.
  alter table public.arboles enable row level security;
  drop policy if exists arboles_en_institucion on public.arboles;
  execute format(
    'create policy arboles_en_institucion on public.arboles as restrictive
     for all to authenticated, anon using (%s) with check (%s)', alcance, alcance);
  drop policy if exists arboles_consulta_institucional on public.arboles;
  execute format(
    'create policy arboles_consulta_institucional on public.arboles
     for select to authenticated using (%s)', alcance);

  for tabla, expresion in
    select nombre, format(
      'exists (select 1 from public.%I padre where padre.id = %I.%I)',
      padre, nombre, referencia
    )
    from (values
      ('arbol_observaciones', 'arboles', 'arbol_id'),
      ('arbol_fotos', 'arboles', 'arbol_id'),
      ('inspecciones', 'arboles', 'arbol_id'),
      ('intervenciones', 'arboles', 'arbol_id'),
      ('inspeccion_observaciones', 'inspecciones', 'inspeccion_id'),
      ('inspeccion_fotos', 'inspecciones', 'inspeccion_id')
    ) as relaciones(nombre, padre, referencia)
  loop
    execute format('alter table public.%I enable row level security', tabla);
    execute format('drop policy if exists registro_en_institucion on public.%I', tabla);
    execute format('create policy registro_en_institucion on public.%I as restrictive
                   for all to authenticated, anon using (%s) with check (%s)', tabla, expresion, expresion);
    execute format('drop policy if exists consulta_institucional on public.%I', tabla);
    execute format('create policy consulta_institucional on public.%I
                   for select to authenticated using (%s)', tabla, expresion);
  end loop;

  -- Conserva los permisos de lectura de cada módulo y añade el límite del colegio.
  foreach tabla in array array[
    'cursos', 'parametros_institucionales', 'metas', 'escenarios_presupuestales',
    'presupuestos', 'zonas', 'clases_guia', 'alertas_riesgo', 'contactos_emergencia',
    'prae', 'jornadas_siembra', 'siembras', 'servicio_social_parametros', 'arboles_eliminados'
  ]
  loop
    if to_regclass(format('public.%I', tabla)) is not null then
      execute format('drop policy if exists solo_lectura_institucional on public.%I', tabla);
      execute format('create policy solo_lectura_institucional on public.%I as restrictive
                     for select to authenticated, anon using (%s)', tabla, alcance);
    end if;
  end loop;
end
$$;

drop policy if exists curso_zonas_en_institucion on public.curso_zonas;
create policy curso_zonas_en_institucion on public.curso_zonas as restrictive
  for select to authenticated, anon
  using (exists (select 1 from public.cursos c where c.id = curso_zonas.curso_id));

alter view public.arboles_resumen set (security_invoker = true);
alter function public.institucion_de_arbol(uuid) security invoker;

-- Esta vista ofrece nombres o alias a compañeros del mismo colegio sin conceder
-- acceso a la tabla que contiene los correos.
do $$
declare
  nombre_visible text := 'nombre';
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.perfiles'::regclass and attname = 'alias' and not attisdropped
  ) then
    nombre_visible := $nombre$
      case
        when usuario_id = auth.uid()
          or (select public.es_admin())
          or current_user = 'service_role'
          or ((select public.mi_rol()) = 'docente' and institucion_id = (select public.mi_institucion()))
        then nombre
        else coalesce(nullif(btrim(alias), ''), public.iniciales(nombre))
      end
    $nombre$;
  end if;
  execute format(
    'create or replace view public.perfiles_publicos with (security_barrier = true) as
       select usuario_id, %s as nombre, rol, institucion_id, curso_id, activo
       from public.perfiles
       where current_user = ''service_role'' or usuario_id = auth.uid()
          or (select public.es_admin())
          or ((select public.mi_rol()) is not null and institucion_id = (select public.mi_institucion()))',
    nombre_visible);
end
$$;
revoke all on public.perfiles_publicos from anon;
grant select on public.perfiles_publicos to authenticated, service_role;

-- Las fotos se sirven con enlaces firmados. La sesión puede firmar las del
-- inventario visible. El backend firma los documentos y las imágenes de perfil.
update storage.buckets set public = false where id = 'fotos-arboles' and public;
drop policy if exists fotos_en_institucion on storage.objects;
create policy fotos_en_institucion on storage.objects as restrictive
  for select to authenticated, anon
  using (
    bucket_id <> 'fotos-arboles' or (select public.es_admin())
    or exists (select 1 from public.arbol_fotos f where f.storage_path = objects.name)
    or exists (select 1 from public.inspeccion_fotos f where f.storage_path = objects.name)
  );
drop policy if exists fotos_consulta_institucional on storage.objects;
create policy fotos_consulta_institucional on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos-arboles'
    and ((select public.es_admin())
         or exists (select 1 from public.arbol_fotos f where f.storage_path = objects.name)
         or exists (select 1 from public.inspeccion_fotos f where f.storage_path = objects.name))
  );

notify pgrst, 'reload schema';
commit;
