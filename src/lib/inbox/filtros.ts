import { ETAPAS, PLATAFORMAS, type Etapa, type Plataforma } from "./etiquetas";

export type Filtros = {
  canal?: Plataforma;
  etapa?: Etapa;
  ver?: "mias" | "comentarios";
  /** Solo las que tienen mensajes sin leer. Se combina con "Mías" y con la vendedora. */
  sinLeer?: boolean;
  cerradas?: boolean;
  /** Búsqueda por nombre o teléfono del cliente (abiertas y cerradas). */
  buscar?: string;
  /** Administración: conversaciones de una persona del equipo (id) o las que nadie tomó ("libres"). */
  vendedora?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valor válido del filtro de vendedora: un id de perfil o "libres". */
export function leerVendedora(v: string | undefined) {
  return v === "libres" || (v && UUID.test(v)) ? v : undefined;
}

/** Texto de búsqueda seguro para el filtro de la base de datos (sin comas, paréntesis ni comodines). */
function limpiarBusqueda(v: string | undefined) {
  const t = (v ?? "").replace(/[,()*%\\:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return t.length >= 2 ? t : undefined;
}

type SP = Record<string, string | string[] | undefined>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function leerFiltros(sp: SP): Filtros {
  const canal = uno(sp.canal);
  const etapa = uno(sp.etapa);
  const ver = uno(sp.ver);
  return {
    canal: PLATAFORMAS.some((p) => p.valor === canal) ? (canal as Plataforma) : undefined,
    etapa: ETAPAS.some((e) => e.valor === etapa) ? (etapa as Etapa) : undefined,
    ver: ver === "mias" || ver === "comentarios" ? ver : undefined,
    // "ver=sin_leer" es la dirección vieja: se sigue aceptando.
    sinLeer: uno(sp.sin_leer) === "1" || ver === "sin_leer" || undefined,
    cerradas: uno(sp.estado) === "cerradas" || undefined,
    buscar: limpiarBusqueda(uno(sp.buscar)),
    vendedora: leerVendedora(uno(sp.vendedora)),
  };
}

/** Query string con los filtros (sin "?"). */
export function qs(f: Filtros, cambios: Partial<Filtros> = {}) {
  const x = { ...f, ...cambios };
  const p = new URLSearchParams();
  if (x.canal) p.set("canal", x.canal);
  if (x.etapa) p.set("etapa", x.etapa);
  if (x.ver) p.set("ver", x.ver);
  if (x.sinLeer) p.set("sin_leer", "1");
  if (x.cerradas) p.set("estado", "cerradas");
  if (x.buscar) p.set("buscar", x.buscar);
  if (x.vendedora) p.set("vendedora", x.vendedora);
  return p.toString();
}

export const conQs = (path: string, q: string) => (q ? `${path}?${q}` : path);
