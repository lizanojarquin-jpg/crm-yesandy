# CRM Yesandy

Bandeja multicanal, asesora IA y seguimiento de clientes para Almacén Yesandy.
Stack: Next.js 16 (App Router, TypeScript, Tailwind) · Supabase (Auth, Postgres, Storage) · Zernio · Vercel.

## Arrancar en local
1. Copia `.env.example` como `.env.local` y llena las variables (ver `GUIA-SUPABASE.md`).
2. `npm.cmd install`
3. `npm.cmd run crear-usuarios` crea o actualiza las cuentas del equipo. Pide cada PIN en la terminal.
4. `npm.cmd run dev` y abre http://localhost:3000

## Producción
- Dirección: https://crm.yesandycr.com (proyecto `crm-yesandy` en Vercel; https://crm-yesandy.vercel.app también funciona). El DNS de yesandycr.com está en GoDaddy: registro CNAME `crm` → Vercel.
- Publicar cambios: `npx.cmd vercel@latest deploy --prod` desde la carpeta del proyecto. Para que cada push a GitHub publique solo, conecta tu cuenta de GitHub en Vercel (Account Settings → Authentication) y luego `npx.cmd vercel@latest git connect`.
- Las variables viven en Vercel (Settings → Environment Variables). `NEXT_PUBLIC_SITE_URL` debe ser la dirección de producción: el webhook y el regreso al conectar canales dependen de ella.
- Webhook de Zernio: `https://crm.yesandycr.com/api/webhooks/zernio` (botón "Actualizar webhook" en Configuración o `scripts/activar-webhook.mts`).

## Acceso
- Se entra con un usuario (`Admin`, `Ventas 1` … `Ventas 4`) y un PIN de 6 dígitos.
- Por dentro, cada usuario es `<usuario>@crm.yesandycr.com` en Supabase Auth. Ese correo no recibe mensajes.
- El rol (`admin` | `seller`) está en `app_metadata`, que solo se puede cambiar con la clave secreta.
- El registro público de Supabase debe quedar **apagado**.

## Estructura
- `src/proxy.ts`: refresca la sesión y redirige según el login y el rol.
- `src/lib/auth.ts`: verifica la sesión y el rol en el servidor (`getUsuarioActual`, `requireAdmin`).
- `src/lib/supabase/`: clientes para el navegador, el servidor, el administrador (solo servidor) y el proxy.
- `src/components/ui/`: componentes base (Button, Field, Textarea, Card, Chip, Avatar, EmptyState).
- `src/app/(app)/page.tsx` y `src/app/(app)/c/[id]/`: bandeja y conversación. Las piezas están en `src/app/(app)/_bandeja/`.
- `src/lib/inbox/`: consultas (con RLS), filtros, etiquetas en español y la regla de las 24 h (`ventana.ts`).
- `src/lib/zernio/`: cliente de la API, firma del webhook y guardado de eventos (`ingest.ts`).
- `src/lib/ia/clasificador.ts`: seguimiento automático (pedido, pago, envío y entrega detectados en la conversación).
- `src/lib/ia/asesora.ts`: asesora IA. Contesta mensajes directos según el modo de Configuración (apagada, solo pruebas o encendida), busca en el catálogo (`catalogo.ts`, copia de shop.yesandycr.com) y pasa a vendedora. Cada decisión queda en la tabla `ai_runs`.
- `scripts/probar-asesora.mts` y `scripts/prueba-asesora-flujo.mts`: pruebas de la asesora (no le escriben a nadie).
- `scripts/reprocesar-eventos.mts`: vuelve a procesar eventos del webhook que quedaron ignorados.
- `scripts/crear-usuarios.mjs`: alta de usuarios del equipo.
