-- La asesora IA atiende primero (decisión de Allan, 23-nov):
-- mientras la IA asesora a un cliente, ventas ve el chat pero no lo puede tomar.
-- Se habilita cuando la IA lo pasa a vendedora, o cuando administración lo libera.

alter table public.conversations
  add column ai_attending       boolean not null default false,
  add column ai_attending_since timestamptz;

create index conversations_ai_attending_idx on public.conversations (ai_attending) where ai_attending;

-- Solo el servidor cambia ai_attending (no está en las columnas que el equipo puede editar).
-- Ventas no puede tomar ni tocar una conversación que está atendiendo la IA.
drop policy "equipo edita sus conversaciones" on public.conversations;
create policy "equipo edita sus conversaciones" on public.conversations
  for update to authenticated
  using (
    (select private.is_active_member())
    and (
      (select private.is_admin())
      or (not ai_attending and (assigned_to is null or assigned_to = (select auth.uid())))
    )
  )
  with check (
    (select private.is_active_member())
    and (
      (select private.is_admin())
      or (not ai_attending and (assigned_to is null or assigned_to = (select auth.uid())))
    )
  );

-- Retomar clientes que esperan respuesta del equipo: rige desde el 24-nov (no se tocan chats viejos).
insert into public.app_settings (key, value) values
  ('retomar_desde', '"2026-11-24T00:00:00-06:00"'::jsonb),
  ('retomar_horas', '6'::jsonb),
  ('retomar_ultima_revision', '"2000-01-01T00:00:00Z"'::jsonb)
on conflict (key) do nothing;
