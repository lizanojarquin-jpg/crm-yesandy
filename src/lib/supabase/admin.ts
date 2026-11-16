import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente con la clave secreta (service role). SOLO en el servidor:
// se salta RLS. "server-only" hace fallar el build si alguien lo importa
// desde un componente del navegador.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
