// Reglas de usuarios del CRM, compartidas por el login y el script crear-usuarios.
// Las personas entran con un nombre de usuario ("Ventas 1") y un PIN de 6 dígitos.
// Supabase Auth trabaja con correo, así que cada usuario tiene un correo interno
// que nunca recibe mensajes (el registro público está apagado).

export const DOMINIO_INTERNO = "crm.yesandycr.com";

export type Rol = "admin" | "seller";

/** "Ventas 1" → "ventas1" (sin tildes, espacios ni símbolos). */
export function normalizarUsuario(usuario: string): string {
  return usuario
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function correoInterno(usuario: string): string {
  return `${normalizarUsuario(usuario)}@${DOMINIO_INTERNO}`;
}

export function esPinValido(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}
