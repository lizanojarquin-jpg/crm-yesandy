-- Cambios pedidos por Allan (23-nov):
-- 1. Solo quien tomó una conversación (o un administrador) puede responderla y editar su ficha.
--    Todas ven todas las conversaciones.
-- 2. Transcripción de audios (la IA y el equipo los pueden leer).
-- 3. Nombre con el que cada vendedora se presenta a los clientes y respuestas rápidas.

-- ---------------------------------------------------------------------
-- 1. Permisos por conversación tomada
-- ---------------------------------------------------------------------
-- ¿Puede quien está conectado editar este contacto? Administrador, o tiene una conversación suya.
create function private.atiende_contacto(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin())
      or exists (
        select 1 from public.conversations c
        where c.contact_id = cid and c.assigned_to = (select auth.uid())
      );
$$;

-- Conversaciones: se editan si son tuyas, si nadie las tiene (para tomarlas) o si eres administrador.
-- Nadie puede asignársela a otra persona salvo un administrador.
drop policy "equipo edita conversaciones" on public.conversations;
create policy "equipo edita sus conversaciones" on public.conversations
  for update to authenticated
  using (
    (select private.is_active_member())
    and ((select private.is_admin()) or assigned_to is null or assigned_to = (select auth.uid()))
  )
  with check (
    (select private.is_active_member())
    and ((select private.is_admin()) or assigned_to is null or assigned_to = (select auth.uid()))
  );

-- Contactos (etapa, datos, notas, fecha de seguimiento): solo quien los atiende o un administrador.
drop policy "equipo edita contactos" on public.contacts;
create policy "quien atiende edita el contacto" on public.contacts
  for update to authenticated
  using ((select private.is_active_member()) and (select private.atiende_contacto(id)))
  with check ((select private.is_active_member()) and (select private.atiende_contacto(id)));

-- Etapas manuales y confirmaciones de la IA: igual.
drop policy "equipo cambia etapa a mano" on public.stage_events;
create policy "quien atiende cambia la etapa" on public.stage_events
  for insert to authenticated
  with check (
    (select private.is_active_member())
    and source = 'manual'
    and created_by = (select auth.uid())
    and (select private.atiende_contacto(contact_id))
  );
drop policy "equipo confirma etapa" on public.stage_events;
create policy "quien atiende confirma la etapa" on public.stage_events
  for update to authenticated
  using ((select private.is_active_member()) and (select private.atiende_contacto(contact_id)))
  with check (
    (select private.is_active_member())
    and confirmed_by = (select auth.uid())
    and (select private.atiende_contacto(contact_id))
  );

-- ---------------------------------------------------------------------
-- 2. Transcripción de audios
-- ---------------------------------------------------------------------
alter table public.attachments add column transcript text;

-- ---------------------------------------------------------------------
-- 3. Nombre para clientes y respuestas rápidas
-- ---------------------------------------------------------------------
-- El usuario sigue siendo "Ventas 1"; esto es cómo se presenta ante el cliente (lo pregunta al entrar).
alter table public.profiles add column public_name text check (public_name is null or length(public_name) between 2 and 40);

create table public.quick_replies (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(title) between 2 and 60),
  body       text not null check (length(body) between 2 and 1500),
  sort_order integer not null default 0,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create trigger quick_replies_updated_at before update on public.quick_replies
  for each row execute function private.set_updated_at();

alter table public.quick_replies enable row level security;
revoke all on public.quick_replies from anon;
create policy "equipo lee respuestas rapidas" on public.quick_replies
  for select to authenticated using ((select private.is_active_member()));
create policy "admin maneja respuestas rapidas" on public.quick_replies
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- {cliente} = primer nombre del cliente · {vendedora} = nombre con el que se presenta quien responde.
insert into public.quick_replies (title, body, sort_order, updated_by) values
  ('Saludo', '¡Hola {cliente}! Mi nombre es {vendedora}, de Almacén Yesandy. Con gusto te atiendo 😊', 10, null),
  ('Pedir talla', '¿En qué talla lo buscas, {cliente}? Así te envío los modelos disponibles.', 20, null),
  ('Métodos de pago', 'Puedes pagar con tarjeta de crédito, efectivo, transferencia o SINPE Móvil al 7287-6971 (Inversiones Yesandy). ¿Por cuál te gustaría realizarlo?', 30, null),
  ('Ubicación y horario', 'Estamos en San Rafael de Heredia, Calle Puente Piedra, 50 m sur del Condominio Vistas de San Rafael. Horario: lunes a sábado de 8:30 a. m. a 7:00 p. m. y domingos de 9:00 a. m. a 3:00 p. m.', 40, null),
  ('Datos para envío', 'Para cotizarte el envío, ¿me ayudas con provincia, cantón, distrito y otras señas?', 50, null),
  ('Despedida', '¡Muchas gracias por tu compra, {cliente}! Cualquier cosa aquí estoy para ayudarte. Saludos, {vendedora} 🙌', 60, null);
