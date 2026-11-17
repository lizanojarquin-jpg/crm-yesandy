import "server-only";
import { listTemplates, type Plantilla } from "@/lib/zernio/client";

export type PlantillaUsable = {
  name: string;
  language: string;
  category: string;
  texto: string;
  variables: number;
};

// Las plantillas cambian poco: se guardan 5 minutos en memoria para no consultar a Meta en cada pantalla.
const cache = new Map<string, { hasta: number; datos: Plantilla[] }>();

export async function plantillasDe(accountId: string, { fresco = false } = {}): Promise<Plantilla[]> {
  const c = cache.get(accountId);
  if (!fresco && c && c.hasta > Date.now()) return c.datos;
  const datos = await listTemplates(accountId);
  cache.set(accountId, { hasta: Date.now() + 5 * 60_000, datos });
  return datos;
}

export const cuerpo = (p: Plantilla) => p.components?.find((c) => c.type.toUpperCase() === "BODY")?.text ?? "";

/** Cuántas variables {{1}}, {{2}}… usa el texto. */
export function contarVariables(texto: string) {
  const nums = [...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export function rellenar(texto: string, valores: string[]) {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] ?? `{{${n}}}`);
}

/** Solo las aprobadas y de texto (las que llevan foto o botones con variables no se pueden llenar aquí). */
export async function plantillasUsables(accountId: string): Promise<PlantillaUsable[]> {
  try {
    const todas = await plantillasDe(accountId);
    return todas
      .filter((p) => p.status === "APPROVED")
      .filter((p) => !(p.components ?? []).some((c) => c.type.toUpperCase() === "HEADER" && c.format && c.format !== "TEXT"))
      .map((p) => ({ name: p.name, language: p.language, category: p.category, texto: cuerpo(p), variables: contarVariables(cuerpo(p)) }));
  } catch {
    return [];
  }
}
