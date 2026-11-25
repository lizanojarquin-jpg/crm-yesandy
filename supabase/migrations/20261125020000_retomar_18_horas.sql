-- Pedido de Allan (24-nov): la IA retoma a los clientes que llevan 18 horas esperando respuesta
-- (antes 6 horas hábiles). Ahora se cuentan horas de reloj, por la ventana de 24 h de Meta.
update public.app_settings set value = '18'::jsonb where key = 'retomar_horas';
