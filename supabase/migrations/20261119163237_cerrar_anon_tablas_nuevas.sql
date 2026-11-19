-- Revisión de seguridad (Fase 7): las tablas creadas después de la migración inicial
-- (ai_runs, ai_lessons) quedaron con los permisos por defecto para "anon". RLS ya
-- bloqueaba las filas, pero nadie sin sesión debe poder ni consultarlas.
revoke all on public.ai_runs    from anon;
revoke all on public.ai_lessons from anon;

-- Y de aquí en adelante, ninguna tabla nueva del esquema public nace abierta para anon.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
