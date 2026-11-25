-- Ubicación que manda el cliente por WhatsApp ({ "latitude": n, "longitude": n, "name"?, "address"? }).
-- El mensaje citado al responder ("responder" de WhatsApp, Messenger e Instagram) se guarda en la
-- columna que ya existía: reply_to_external_id.
alter table public.messages add column location jsonb
  check (
    location is null
    or (jsonb_typeof(location -> 'latitude') = 'number' and jsonb_typeof(location -> 'longitude') = 'number')
  );

-- Para encontrar rápido el mensaje citado dentro de la conversación.
create index if not exists messages_conversation_external_idx on public.messages (conversation_id, external_message_id);
