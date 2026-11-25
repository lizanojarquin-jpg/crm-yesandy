-- Registro de fallas del celular al enviar fotos o audios (y de la revisión en Avisos).
-- Sirve para saber qué pasa en un teléfono concreto (p. ej. iPhone) sin tenerlo en la mano.
-- Cada persona solo puede guardar los suyos; solo administración los lee.
create table public.device_reports (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  context    text not null check (length(context) between 1 and 80),
  detail     text check (detail is null or length(detail) <= 2000),
  device     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index device_reports_created_at_idx on public.device_reports (created_at desc);

alter table public.device_reports enable row level security;
revoke all on public.device_reports from anon;
create policy "equipo guarda sus reportes" on public.device_reports
  for insert to authenticated
  with check ((select private.is_active_member()) and profile_id = (select auth.uid()));
create policy "admin lee reportes" on public.device_reports
  for select to authenticated using ((select private.is_admin()));
