-- La referencia conversations.ai_revived_message_id → messages creó una segunda relación
-- entre conversaciones y mensajes, y las consultas que unen messages con conversations
-- (clasificador, resúmenes) quedaron ambiguas. La columna queda como un uuid simple.
alter table public.conversations drop constraint if exists conversations_ai_revived_message_id_fkey;
