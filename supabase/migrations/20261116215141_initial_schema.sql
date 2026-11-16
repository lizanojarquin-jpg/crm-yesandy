-- =====================================================================
-- CRM Yesandy · Fase 2 · Esquema inicial
-- Bandeja multicanal (Zernio), contactos, etapas de seguimiento,
-- asesora IA, conocimiento del negocio y notificaciones push.
-- Reglas: RLS en todas las tablas. Los webhooks y los envíos salientes
-- escriben con la clave secreta desde el servidor (se salta RLS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Esquema privado para funciones auxiliares (no expuesto por la API)
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------
create type public.user_role           as enum ('admin', 'seller');
create type public.channel_platform    as enum ('whatsapp', 'facebook', 'instagram', 'tiktok');
create type public.channel_status      as enum ('connected', 'disconnected', 'error');
create type public.conversation_kind   as enum ('dm', 'comment');
create type public.conversation_status as enum ('open', 'closed');
create type public.ai_mode             as enum ('on', 'off', 'handoff');
create type public.contact_stage       as enum (
  'new',               -- nuevo
  'advising',          -- asesorando (IA conversando)
  'ready_for_seller',  -- listo para vendedora (falta talla/color/precio)
  'order_confirmed',   -- pedido confirmado
  'payment_received',  -- pago recibido (comprobante)
  'shipped',           -- enviado (guía / encomienda)
  'delivered',         -- entregado
  'lost',              -- perdido
  'no_response'        -- sin respuesta
);
create type public.stage_source        as enum ('manual', 'ai');
create type public.message_direction   as enum ('inbound', 'outbound');
create type public.sender_type         as enum ('customer', 'ai', 'agent');
create type public.delivery_status     as enum ('pending', 'sent', 'delivered', 'read', 'failed');
create type public.attachment_type     as enum ('image', 'video', 'audio', 'file', 'sticker', 'other');
create type public.attachment_kind     as enum ('payment_receipt', 'shipping_guide', 'product_photo', 'other');

-- ---------------------------------------------------------------------
-- 2. Utilidades
-- ---------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Equipo
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role         public.user_role not null default 'seller',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'Miembros del equipo. Rol y nombre se copian de auth.users.app_metadata.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Mantiene profiles sincronizado con app_metadata (lo escribe crear-usuarios / Configuración).
create function private.sync_profile_from_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
begin
  v_role := case new.raw_app_meta_data ->> 'role'
              when 'admin' then 'admin'::public.user_role
              else 'seller'::public.user_role
            end;
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_app_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    v_role
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        role         = excluded.role;
  return new;
end $$;

create trigger on_auth_user_saved
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function private.sync_profile_from_auth();

-- Usuarios que ya existen (creados en la Fase 1)
insert into public.profiles (id, display_name, role)
select u.id,
       coalesce(u.raw_app_meta_data ->> 'display_name', split_part(u.email, '@', 1)),
       case u.raw_app_meta_data ->> 'role' when 'admin' then 'admin'::public.user_role else 'seller'::public.user_role end
from auth.users u
on conflict (id) do nothing;

-- Funciones de permiso (security definer para no caer en recursión de RLS)
create function private.is_active_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  );
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.role = 'admin'
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Canales conectados en Zernio
-- ---------------------------------------------------------------------
create table public.channel_accounts (
  id                 uuid primary key default gen_random_uuid(),
  zernio_account_id  text not null unique,
  platform           public.channel_platform not null,
  display_name       text not null,
  status             public.channel_status not null default 'connected',
  connected_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger channel_accounts_updated_at before update on public.channel_accounts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Contactos
-- ---------------------------------------------------------------------
create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  name            text,
  phone           text,
  stage           public.contact_stage not null default 'new',
  stage_pending_review boolean not null default false, -- true si la IA movió la etapa y nadie lo confirmó
  assigned_to     uuid references public.profiles (id) on delete set null,
  ai_enabled      boolean not null default true,
  follow_up_at    timestamptz,
  loss_reason     text,
  notes           text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index contacts_stage_idx        on public.contacts (stage);
create index contacts_follow_up_idx    on public.contacts (follow_up_at) where follow_up_at is not null;
create index contacts_assigned_idx     on public.contacts (assigned_to);
create index contacts_last_message_idx on public.contacts (last_message_at desc);

create trigger contacts_updated_at before update on public.contacts
  for each row execute function private.set_updated_at();

-- Una persona puede escribir por varios canales: cada identidad apunta al mismo contacto.
create table public.contact_identities (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references public.contacts (id) on delete cascade,
  platform         public.channel_platform not null,
  external_user_id text not null,
  handle           text,
  created_at       timestamptz not null default now(),
  unique (platform, external_user_id)
);
create index contact_identities_contact_idx on public.contact_identities (contact_id);

-- ---------------------------------------------------------------------
-- 6. Conversaciones y mensajes
-- ---------------------------------------------------------------------
create table public.conversations (
  id                       uuid primary key default gen_random_uuid(),
  contact_id               uuid not null references public.contacts (id) on delete cascade,
  channel_account_id       uuid not null references public.channel_accounts (id) on delete restrict,
  kind                     public.conversation_kind not null default 'dm',
  external_conversation_id text not null,
  external_post_id         text,           -- solo comentarios: publicación donde comentaron
  post_permalink           text,
  status                   public.conversation_status not null default 'open',
  assigned_to              uuid references public.profiles (id) on delete set null,
  ai_mode                  public.ai_mode not null default 'on',
  last_inbound_at          timestamptz,     -- para la ventana de 24 h de WhatsApp
  last_message_at          timestamptz,
  last_message_preview     text,
  unread_count             integer not null default 0 check (unread_count >= 0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (channel_account_id, external_conversation_id)
);
create index conversations_inbox_idx    on public.conversations (status, last_message_at desc);
create index conversations_contact_idx  on public.conversations (contact_id);
create index conversations_assigned_idx on public.conversations (assigned_to);

create trigger conversations_updated_at before update on public.conversations
  for each row execute function private.set_updated_at();

create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  direction           public.message_direction not null,
  sender_type         public.sender_type not null,
  sender_profile_id   uuid references public.profiles (id) on delete set null, -- quién respondió (agent)
  body                text,
  external_message_id text unique,
  reply_to_external_id text,           -- comentario/mensaje al que responde
  delivery_status     public.delivery_status not null default 'pending',
  error_message       text,
  created_at          timestamptz not null default now(),
  check (sender_type <> 'agent' or direction = 'outbound'),
  check (sender_type <> 'customer' or direction = 'inbound')
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Al guardar un mensaje se actualizan la conversación y el contacto (orden de la bandeja).
create function private.on_message_inserted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations c
     set last_message_at      = new.created_at,
         last_message_preview = left(coalesce(new.body, '📎 Adjunto'), 140),
         last_inbound_at      = case when new.direction = 'inbound' then new.created_at else c.last_inbound_at end,
         unread_count         = case when new.direction = 'inbound' then c.unread_count + 1 else c.unread_count end,
         status               = case when new.direction = 'inbound' then 'open'::public.conversation_status else c.status end
   where c.id = new.conversation_id;

  update public.contacts ct
     set last_message_at = new.created_at
    from public.conversations c
   where c.id = new.conversation_id and ct.id = c.contact_id;
  return new;
end $$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function private.on_message_inserted();

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.messages (id) on delete cascade,
  type          public.attachment_type not null,
  mime_type     text,
  storage_path  text,                 -- ruta en el bucket privado "attachments"
  external_url  text,                 -- URL original de Zernio (temporal)
  detected_kind public.attachment_kind,
  created_at    timestamptz not null default now()
);
create index attachments_message_idx on public.attachments (message_id);

-- ---------------------------------------------------------------------
-- 7. Seguimiento: historial de etapas
-- ---------------------------------------------------------------------
create table public.stage_events (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid not null references public.contacts (id) on delete cascade,
  from_stage          public.contact_stage,
  to_stage            public.contact_stage not null,
  source              public.stage_source not null,
  evidence_message_id uuid references public.messages (id) on delete set null,
  note                text,
  created_by          uuid references public.profiles (id) on delete set null default auth.uid(),
  confirmed_by        uuid references public.profiles (id) on delete set null,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  check (source = 'ai' or created_by is not null)
);
create index stage_events_contact_idx on public.stage_events (contact_id, created_at desc);

-- Cada evento mueve la etapa del contacto. Los de la IA quedan "por revisar".
create function private.on_stage_event_inserted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select stage into new.from_stage from public.contacts where id = new.contact_id;
  update public.contacts
     set stage = new.to_stage,
         stage_pending_review = (new.source = 'ai')
   where id = new.contact_id;
  return new;
end $$;

create trigger stage_events_before_insert before insert on public.stage_events
  for each row execute function private.on_stage_event_inserted();

-- Confirmar un cambio de la IA limpia la marca "por revisar".
create function private.on_stage_event_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.confirmed_at is not null and old.confirmed_at is null then
    update public.contacts
       set stage_pending_review = false
     where id = new.contact_id
       and stage = new.to_stage;
  end if;
  return new;
end $$;

create trigger stage_events_after_confirm after update of confirmed_at on public.stage_events
  for each row execute function private.on_stage_event_confirmed();

-- ---------------------------------------------------------------------
-- 8. Asesora IA: traspasos a vendedora
-- ---------------------------------------------------------------------
create table public.ai_handoffs (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  reason          text not null,      -- por qué pasa a persona (talla, queja, pago, etc.)
  summary         jsonb not null default '{}'::jsonb, -- ocasión, fecha, estilo, prendas sugeridas, dudas
  taken_by        uuid references public.profiles (id) on delete set null,
  taken_at        timestamptz,
  created_at      timestamptz not null default now()
);
create index ai_handoffs_open_idx on public.ai_handoffs (created_at desc) where taken_by is null;

-- ---------------------------------------------------------------------
-- 9. Conocimiento del negocio y catálogo
-- ---------------------------------------------------------------------
create table public.business_knowledge (
  key        text primary key,
  title      text not null,
  content    text not null,
  sort_order integer not null default 0,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger business_knowledge_updated_at before update on public.business_knowledge
  for each row execute function private.set_updated_at();

create table public.catalog_items (
  id          uuid primary key default gen_random_uuid(),
  external_id text not null unique,   -- id del producto en shop.yesandycr.com
  name        text not null,
  category    text,
  description text,
  image_url   text,
  product_url text,
  active      boolean not null default true,
  synced_at   timestamptz not null default now()
);
create index catalog_items_category_idx on public.catalog_items (category) where active;

-- ---------------------------------------------------------------------
-- 10. Infraestructura
-- ---------------------------------------------------------------------
-- Eventos crudos de Zernio: idempotencia (X-Zernio-Event-Id) y reproceso si algo falla.
create table public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  zernio_event_id text not null unique,
  event_type      text not null,
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  error           text
);
create index webhook_events_pending_idx on public.webhook_events (received_at) where processed_at is null;

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 11. Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.channel_accounts   enable row level security;
alter table public.contacts           enable row level security;
alter table public.contact_identities enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.attachments        enable row level security;
alter table public.stage_events       enable row level security;
alter table public.ai_handoffs        enable row level security;
alter table public.business_knowledge enable row level security;
alter table public.catalog_items      enable row level security;
alter table public.webhook_events     enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_settings       enable row level security;

-- Nadie anónimo toca nada.
revoke all on all tables in schema public from anon;

-- Equipo: todos ven a sus compañeras (para asignar). Cambios de rol solo por servidor.
create policy "equipo ve perfiles" on public.profiles
  for select to authenticated using ((select private.is_active_member()));

-- Canales: lectura para el equipo; se conectan desde el servidor.
create policy "equipo ve canales" on public.channel_accounts
  for select to authenticated using ((select private.is_active_member()));

-- Contactos: el equipo completo los ve y edita (asignar, notas, seguimiento).
create policy "equipo ve contactos" on public.contacts
  for select to authenticated using ((select private.is_active_member()));
create policy "equipo edita contactos" on public.contacts
  for update to authenticated
  using ((select private.is_active_member()))
  with check ((select private.is_active_member()));

create policy "equipo ve identidades" on public.contact_identities
  for select to authenticated using ((select private.is_active_member()));

-- Conversaciones: ver y actualizar (tomar, apagar IA, cerrar, marcar leída).
create policy "equipo ve conversaciones" on public.conversations
  for select to authenticated using ((select private.is_active_member()));
create policy "equipo edita conversaciones" on public.conversations
  for update to authenticated
  using ((select private.is_active_member()))
  with check ((select private.is_active_member()));

-- Mensajes y adjuntos: solo lectura. Enviar pasa por el servidor (Zernio + clave secreta).
create policy "equipo ve mensajes" on public.messages
  for select to authenticated using ((select private.is_active_member()));
create policy "equipo ve adjuntos" on public.attachments
  for select to authenticated using ((select private.is_active_member()));

-- Etapas: el equipo ve el historial, registra cambios manuales y confirma los de la IA.
create policy "equipo ve etapas" on public.stage_events
  for select to authenticated using ((select private.is_active_member()));
create policy "equipo cambia etapa a mano" on public.stage_events
  for insert to authenticated
  with check (
    (select private.is_active_member())
    and source = 'manual'
    and created_by = (select auth.uid())
  );
create policy "equipo confirma etapa" on public.stage_events
  for update to authenticated
  using ((select private.is_active_member()))
  with check ((select private.is_active_member()) and confirmed_by = (select auth.uid()));

-- Traspasos de la IA: ver y tomar.
create policy "equipo ve traspasos" on public.ai_handoffs
  for select to authenticated using ((select private.is_active_member()));
create policy "equipo toma traspasos" on public.ai_handoffs
  for update to authenticated
  using ((select private.is_active_member()))
  with check ((select private.is_active_member()) and taken_by = (select auth.uid()));

-- Conocimiento: todos leen, solo admin escribe.
create policy "equipo lee conocimiento" on public.business_knowledge
  for select to authenticated using ((select private.is_active_member()));
create policy "admin escribe conocimiento" on public.business_knowledge
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Catálogo: lectura; la sincronización la hace el servidor.
create policy "equipo ve catalogo" on public.catalog_items
  for select to authenticated using ((select private.is_active_member()));

-- webhook_events: sin políticas → solo el servidor (clave secreta).

-- Push: cada quien maneja sus propios dispositivos.
create policy "propias suscripciones" on public.push_subscriptions
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and (select private.is_active_member()));

-- Ajustes: todos leen (p. ej. si la IA está encendida), solo admin cambia.
create policy "equipo lee ajustes" on public.app_settings
  for select to authenticated using ((select private.is_active_member()));
create policy "admin cambia ajustes" on public.app_settings
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Columnas que el equipo puede cambiar (lo demás solo el servidor).
revoke update on public.contacts      from authenticated;
grant  update (name, phone, assigned_to, ai_enabled, follow_up_at, loss_reason, notes)
  on public.contacts to authenticated;
revoke update on public.conversations from authenticated;
grant  update (status, assigned_to, ai_mode, unread_count)
  on public.conversations to authenticated;
revoke update on public.stage_events  from authenticated;
grant  update (confirmed_by, confirmed_at) on public.stage_events to authenticated;
revoke update on public.ai_handoffs   from authenticated;
grant  update (taken_by, taken_at) on public.ai_handoffs to authenticated;
revoke insert on public.stage_events  from authenticated;
grant  insert (contact_id, to_stage, source, note, created_by) on public.stage_events to authenticated;

-- ---------------------------------------------------------------------
-- 12. Almacenamiento: adjuntos privados (comprobantes, guías, fotos)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 104857600)
on conflict (id) do nothing;

create policy "equipo ve adjuntos guardados" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (select private.is_active_member()));

-- ---------------------------------------------------------------------
-- 13. Tiempo real (bandeja que se actualiza sola en la Fase 4)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.messages, public.conversations, public.ai_handoffs;

-- ---------------------------------------------------------------------
-- 14. Datos iniciales
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('ai_global_enabled', 'true'::jsonb);

insert into public.business_knowledge (key, title, content, sort_order) values
  ('horario', 'Horario',
   'Lunes a sábado de 8:30 a.m. a 7:00 p.m. Domingos de 9:00 a.m. a 3:00 p.m.', 10),
  ('ubicacion', 'Ubicación',
   'San Rafael de Heredia, Calle Puente Piedra, 50 metros sur del Condominio Vistas de San Rafael.', 20),
  ('metodos_pago', 'Métodos de pago',
   'Tarjeta de crédito, efectivo, transferencia y SINPE Móvil. Preguntar al cliente por cuál le gustaría realizarlo.', 30),
  ('mayoreo', 'Precio al por mayor',
   'Claro que puede obtener el beneficio de precio por mayor: con una compra desde ₡50.000, o llevando 3 o más unidades de una misma prenda (no importa si son de diferentes estilos).', 40),
  ('promociones', 'Promociones',
   'La promoción del 30 % de descuento ya no está activa. No ofrecerla. Si el cliente pregunta, indicar que no está vigente.', 50),
  ('envios', 'Envíos',
   'Pendiente de definir. Si el cliente pregunta por envíos, pasar la conversación a una vendedora.', 60);
