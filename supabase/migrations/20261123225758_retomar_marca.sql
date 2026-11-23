-- Retomar clientes que esperan: se guarda a qué mensaje del cliente ya se le hizo
-- "retomar", para no escribirle dos veces por la misma espera.
alter table public.conversations add column ai_revived_message_id uuid references public.messages (id) on delete set null;
