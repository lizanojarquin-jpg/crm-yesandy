import { ETAPAS, PLATAFORMAS, type Etapa, type Plataforma } from "./etiquetas";

export type Filtros = {
  canal?: Plataforma;
  etapa?: Etapa;
  ver?: "sin_leer" | "mias" | "comentarios";
  cerradas?: boolean;
};

type SP = Record<string, string | string[] | undefined>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function leerFiltros(sp: SP): Filtros {
  const canal = uno(sp.canal);
  const etapa = uno(sp.etapa);
  const ver = uno(sp.ver);
  return {
    canal: PLATAFORMAS.some((p) => p.valor === canal) ? (canal as Plataforma) : undefined,
    etapa: ETAPAS.some((e) => e.valor === etapa) ? (etapa as Etapa) : undefined,
    ver: ver === "sin_leer" || ver === "mias" || ver === "comentarios" ? ver : undefined,
    cerradas: uno(sp.estado) === "cerradas" || undefined,
  };
}

/** Query string con los filtros (sin "?"). */
export function qs(f: Filtros, cambios: Partial<Filtros> = {}) {
  const x = { ...f, ...cambios };
  const p = new URLSearchParams();
  if (x.canal) p.set("canal", x.canal);
  if (x.etapa) p.set("etapa", x.etapa);
  if (x.ver) p.set("ver", x.ver);
  if (x.cerradas) p.set("estado", "cerradas");
  return p.toString();
}

export const conQs = (path: string, q: string) => (q ? `${path}?${q}` : path);
