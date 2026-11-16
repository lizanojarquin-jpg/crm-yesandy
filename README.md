# CRM Yesandy

Bandeja multicanal, asesora IA y seguimiento de clientes para Almacén Yesandy.
Stack: Next.js 16 (App Router, TypeScript, Tailwind) · Supabase (Auth, Postgres, Storage) · Zernio · Vercel.

## Arrancar en local
1. Copia `.env.example` como `.env.local` y llena las variables (ver `GUIA-SUPABASE.md`).
2. `npm.cmd install`
3. `npm.cmd run crear-usuarios` crea o actualiza las cuentas del equipo. Pide cada PIN en la terminal.
4. `npm.cmd run dev` y abre http://localhost:3000

## Acceso
- Se entra con un usuario (`Admin`, `Ventas 1` … `Ventas 4`) y un PIN de 6 dígitos.
- Por dentro, cada usuario es `<usuario>@crm.yesandycr.com` en Supabase Auth. Ese correo no recibe mensajes.
- El rol (`admin` | `seller`) está en `app_metadata`, que solo se puede cambiar con la clave secreta.
- El registro público de Supabase debe quedar **apagado**.

## Estructura
- `src/proxy.ts`: refresca la sesión y redirige según el login y el rol.
- `src/lib/auth.ts`: verifica la sesión y el rol en el servidor (`getUsuarioActual`, `requireAdmin`).
- `src/lib/supabase/`: clientes para el navegador, el servidor, el administrador (solo servidor) y el proxy.
- `src/components/ui/`: componentes base (Button, Field, Card, EmptyState).
- `scripts/crear-usuarios.mjs`: alta de usuarios del equipo.
