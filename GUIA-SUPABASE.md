# Guía paso a paso · Supabase para el CRM Yesandy

Tiempo estimado: 15 minutos. Al terminar, me avisas con un "listo" y arranco la Fase 1.
**No pegues ninguna clave en el chat**: todas van en `.env.local`.

---

## Paso 1 · Crear la cuenta y el proyecto
1. Entra a https://supabase.com y pulsa **Start your project**. Regístrate con GitHub (así queda todo en la misma cuenta).
2. Si te pide crear una **Organization**: nombre `Yesandy` (o el de tu agencia), plan **Free**.
3. Pulsa **New project** y llena:
   - **Name:** `crm-yesandy`
   - **Database Password:** pulsa *Generate a password* y **guárdala en tu gestor de contraseñas**. La vas a necesitar en el Paso 5.
   - **Region:** `East US (North Virginia)`. Es la más cercana a Costa Rica y a los servidores de Vercel.
   - **Plan:** Free.
4. Pulsa **Create new project** y espera 1–2 minutos a que termine de preparar.

## Paso 2 · Copiar las claves al `.env.local`
Abre el archivo `.env.local` de esta carpeta (con el Bloc de notas o VS Code) y llena:

| Variable | Dónde está en Supabase |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Project Settings → Data API → Project URL** (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project Settings → API Keys** → *Publishable key* (`sb_publishable_…`). Si solo ves claves `eyJ…`, usa la *anon public*. |
| `SUPABASE_SERVICE_ROLE_KEY` | Misma pantalla → *Secret key* (`sb_secret_…`) o la *service_role* (`eyJ…`). Pulsa *Reveal* para verla. |
| `SUPABASE_PROJECT_REF` | **Project Settings → General → Project ID** (las letras del subdominio, ej. `abcdefghijkl`). |

Guarda el archivo. La clave secreta da acceso total a la base de datos: solo vive en ese archivo y en Vercel.

## Paso 3 · Configurar el inicio de sesión
En **Authentication** (menú izquierdo):
1. **Sign In / Providers → Email**: dejarlo activado.
2. En la misma sección, **desactiva "Allow new users to sign up"**. Así nadie de afuera puede crearse una cuenta: las vendedoras entran solo por invitación desde el CRM.
3. **URL Configuration**:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** agrega `http://localhost:3000/**`
   (En la Fase 7 agregamos la dirección de Vercel.)

No crees tablas ni usuarios desde el panel: eso lo hago yo con migraciones (regla del brief).

## Paso 4 · Instalar la CLI de Supabase
No necesitas instalar nada global. Yo la agrego al proyecto en la Fase 1 con npm y se usa con `npx supabase`.
Lo único que haces tú es iniciar sesión, en una terminal dentro de esta carpeta:

```bash
npx supabase login
```

Se abre el navegador, autorizas y vuelves. (Si pregunta "Need to install supabase? (y)", responde `y`.)

## Paso 5 · Enlazar el proyecto (lo corres tú porque pide la contraseña)
Después de que yo cree la base del proyecto en la Fase 1, te voy a pedir que corras:

```bash
npx supabase link --project-ref TU_PROJECT_REF
```

Te pedirá la **Database Password** del Paso 1: escríbela en la terminal, no en el chat.

## Paso 6 · GitHub
1. En https://github.com/new crea un repositorio **privado** llamado `crm-yesandy`, **vacío** (sin README, sin .gitignore, sin licencia).
2. Pásame solo el enlace del repositorio (eso sí puede ir en el chat).

## Paso 7 · Equipo
Mándame por el chat:
- Tu correo (admin).
- Nombre y correo de cada vendedora (rol vendedora).

---

### Checklist para avisarme "listo"
- [ ] Proyecto `crm-yesandy` creado en East US
- [ ] Contraseña de la base guardada en tu gestor
- [ ] 4 variables de Supabase llenas en `.env.local`
- [ ] Registro público desactivado y URLs de localhost configuradas
- [ ] `npx supabase login` hecho
- [ ] Repo privado vacío en GitHub (me pasas el enlace)
- [ ] Correos del equipo
