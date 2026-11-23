import "server-only";
import { cookies } from "next/headers";

// Cada vez que alguien de ventas entra, confirma con qué nombre se presenta a los clientes.
// La confirmación dura un turno de trabajo (14 h) y es por usuario y dispositivo.
export const COOKIE_NOMBRE = "yesandy_nombre";
export const DURACION_TURNO = 14 * 60 * 60;

export async function nombreConfirmado(usuarioId: string) {
  return (await cookies()).get(COOKIE_NOMBRE)?.value === usuarioId;
}
