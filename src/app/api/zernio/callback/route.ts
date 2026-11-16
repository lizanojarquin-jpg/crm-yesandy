import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { syncChannelAccounts } from "@/lib/zernio/ingest";

// Zernio vuelve aquí después de conectar un canal (?connected=whatsapp&accountId=...
// o ?error=...). Solo el admin llega hasta acá; guardamos las cuentas y volvemos a Configuración.
export async function GET(request: NextRequest) {
  const usuario = await getUsuarioActual();
  const destino = new URL("/configuracion", request.url);
  if (usuario.rol !== "admin") return NextResponse.redirect(new URL("/", request.url));

  const params = request.nextUrl.searchParams;
  const error = params.get("error");
  if (error) {
    destino.searchParams.set("error", params.get("error_message") ?? error);
    return NextResponse.redirect(destino);
  }
  try {
    await syncChannelAccounts();
    destino.searchParams.set("conectado", params.get("connected") ?? "canal");
  } catch {
    destino.searchParams.set("error", "Se conectó en Zernio pero no se pudo guardar. Pulsa Sincronizar.");
  }
  return NextResponse.redirect(destino);
}
