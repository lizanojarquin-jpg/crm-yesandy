import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTAS_PUBLICAS = ["/login"];
const RUTAS_ADMIN = ["/configuracion"];

// Refresca la sesión de Supabase en cada solicitud y hace los
// redireccionamientos optimistas. La verificación real se repite
// en el servidor (src/lib/auth.ts) antes de mostrar o cambiar datos.
export async function updateSession(request: NextRequest) {
  // Webhooks externos: sin sesión, se validan con su propia firma.
  if (request.nextUrl.pathname.startsWith("/api/webhooks/")) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No poner código entre createServerClient y getClaims().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((r) => path.startsWith(r));

  const redirigir = (destino: string) => {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!claims && !esPublica) return redirigir("/login");
  if (claims && esPublica) return redirigir("/");

  const rol = (claims?.app_metadata as { role?: string } | undefined)?.role;
  if (claims && RUTAS_ADMIN.some((r) => path.startsWith(r)) && rol !== "admin") {
    return redirigir("/");
  }

  return response;
}
