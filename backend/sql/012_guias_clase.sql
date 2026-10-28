-- =====================================================================
-- 012 · Guías de clase: bitácora de las clases dictadas con cada guía
--
-- Las guías y sus fichas viven en el backend (servicios/guias.py); aquí
-- solo queda qué guía se dictó, con qué curso, cuándo y con cuántos
-- estudiantes. Sirve de evidencia de las acciones pedagógicas del PRAE.
-- No guarda nombres de estudiantes.
--
-- Las escrituras las hace el backend con la llave de servicio después de
-- comprobar permisos; el RLS solo deja leer a la gente de cada institución.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.clases_guia (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  text not null references public.instituciones(id),
  curso_id        uuid references public.cursos(id) on delete set null,
  guia_id         text not null check (char_length(guia_id) between 2 and 60),
  docente_id      uuid not null references auth.users(id),
  fecha           date not null,
  asistentes      integer check (asistentes between 1 and 80),
  notas           text check (char_length(notas) <= 1000),
  creado_en       timestamptz not null default now()
);
create index if not exists clases_guia_institucion_idx on public.clases_guia (institucion_id, fecha desc);

alter table public.clases_guia enable row level security;

drop policy if exists clases_guia_leer on public.clases_guia;
create policy clases_guia_leer on public.clases_guia for select to authenticated
  using (public.es_admin() or institucion_id = public.mi_institucion());

notify pgrst, 'reload schema';
