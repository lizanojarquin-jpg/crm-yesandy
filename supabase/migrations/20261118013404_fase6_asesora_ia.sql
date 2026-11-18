-- Fase 6: asesora IA.
-- 1. Modo de la IA: "apagada" | "pruebas" (solo contactos de prueba) | "encendida".
--    Arranca apagada: se enciende desde Configuración cuando el equipo la pruebe.
-- 2. Registro de cada vez que la IA decide (responder, traspasar u omitir): sirve para
--    no responder dos veces al mismo mensaje y para revisar qué hizo y cuánto costó.

insert into public.app_settings (key, value) values
  ('ai_modo', '"apagada"'::jsonb),
  ('ai_contactos_prueba', '[]'::jsonb)
on conflict (key) do nothing;

-- El ajuste anterior queda sin uso; se apaga para que nada lo lea como "encendida".
update public.app_settings set value = 'false'::jsonb where key = 'ai_global_enabled';

create table public.ai_runs (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.conversations (id) on delete cascade,
  trigger_message_id uuid not null unique references public.messages (id) on delete cascade,
  status             text not null default 'pendiente'
                     check (status in ('pendiente', 'respondio', 'traspaso', 'omitido', 'error')),
  detail             text,
  cost_usd           numeric(10, 6),
  created_at         timestamptz not null default now(),
  finished_at        timestamptz
);
create index ai_runs_conversation_idx on public.ai_runs (conversation_id, created_at desc);
create index ai_runs_created_idx on public.ai_runs (created_at desc);

alter table public.ai_runs enable row level security;

-- Lo escribe solo el servidor. El administrador lo ve en Configuración.
create policy "admin ve registro de la IA" on public.ai_runs
  for select to authenticated using ((select private.is_admin()));
