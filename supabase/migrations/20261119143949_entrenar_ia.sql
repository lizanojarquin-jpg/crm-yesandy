-- Entrenar a la asesora IA desde la app.
-- Lecciones: reglas en palabras normales ("siempre trata de usted") y correcciones
-- ("el cliente dijo X, la IA respondió Y, debió responder Z"). El equipo propone;
-- solo un administrador las activa. La IA lee las activas antes de cada respuesta.

create table public.ai_lessons (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('regla', 'correccion')),
  situation         text,              -- corrección: lo último que dijo el cliente
  original_reply    text,              -- corrección: lo que respondió la IA
  content           text not null check (length(content) between 3 and 2000), -- la regla, o lo que debió responder
  reason            text,              -- por qué (opcional)
  status            text not null default 'propuesta' check (status in ('propuesta', 'activa', 'archivada')),
  source_message_id uuid references public.messages (id) on delete set null,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  approved_by       uuid references public.profiles (id) on delete set null,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index ai_lessons_status_idx on public.ai_lessons (status, created_at desc);

create trigger ai_lessons_updated_at before update on public.ai_lessons
  for each row execute function private.set_updated_at();

alter table public.ai_lessons enable row level security;

-- Todo el equipo ve las lecciones.
create policy "equipo ve lecciones" on public.ai_lessons
  for select to authenticated using ((select private.is_active_member()));

-- Cualquiera del equipo propone; un administrador puede crearlas ya activas.
create policy "equipo propone lecciones" on public.ai_lessons
  for insert to authenticated
  with check (
    (select private.is_active_member())
    and created_by = (select auth.uid())
    and (status = 'propuesta' or (select private.is_admin()))
  );

-- Aprobar, editar, archivar y borrar: solo administradores.
create policy "admin edita lecciones" on public.ai_lessons
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy "admin borra lecciones" on public.ai_lessons
  for delete to authenticated using ((select private.is_admin()));
