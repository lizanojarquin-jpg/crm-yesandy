const TZ = "America/Costa_Rica";

const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // AAAA-MM-DD

/** Hora corta para listas: "14:05", "ayer", "lun", "12/11". */
export function horaCorta(iso: string | null | undefined, ahora = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = dia(ahora);
  const ayer = dia(new Date(ahora.getTime() - 86_400_000));
  if (dia(d) === hoy) return d.toLocaleTimeString("es-CR", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  if (dia(d) === ayer) return "ayer";
  if (ahora.getTime() - d.getTime() < 6 * 86_400_000)
    return d.toLocaleDateString("es-CR", { timeZone: TZ, weekday: "short" }).replace(".", "");
  return d.toLocaleDateString("es-CR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

export function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CR", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

/** Encabezado de día en la conversación: "Hoy", "Ayer", "lunes 10 de noviembre". */
export function encabezadoDia(iso: string, ahora = new Date()) {
  const d = new Date(iso);
  if (dia(d) === dia(ahora)) return "Hoy";
  if (dia(d) === dia(new Date(ahora.getTime() - 86_400_000))) return "Ayer";
  return d.toLocaleDateString("es-CR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

export const claveDia = (iso: string) => dia(new Date(iso));

/** Fecha AAAA-MM-DD (hora de Costa Rica) para un <input type="date">. */
export function fechaInput(iso: string | null | undefined) {
  return iso ? dia(new Date(iso)) : "";
}

export function fechaLarga(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}
