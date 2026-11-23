import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Catálogo de shop.yesandycr.com. La tienda lo publica en assets/productos.js como
// `window.CATALOGO = { categorias, productos }` (sin precios). Se copia a catalog_items
// para que la asesora busque prendas sin depender de la web en cada mensaje.

const TIENDA = "https://shop.yesandycr.com/";
const ARCHIVO = `${TIENDA}assets/productos.js`;
const VIGENCIA_MS = 12 * 60 * 60 * 1000; // se vuelve a copiar si tiene más de 12 h

export const CATEGORIAS: Record<string, string> = {
  dama: "Ropa Dama",
  caballero: "Ropa Caballero",
  ninos: "Ropa Niños",
  navidena: "Ropa Navideña",
  calzado: "Calzado",
  hogar: "Hogar",
  fragancias: "Fragancias",
};

type ProductoWeb = {
  id?: string;
  nombre?: string;
  categoria?: string;
  imagen?: string;
  imagenes?: string[];
  tallas?: string;
  nuevo?: boolean;
  destacado?: boolean;
};

/** Mismo identificador que usa la tienda en producto.html?p=… (assets/app.js). */
export function slug(t: string): string {
  return (
    String(t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "articulo"
  );
}

/**
 * Dirección completa de una foto. La tienda a veces ya trae el nombre codificado
 * ("Cat%C3%A1logo%20…png") y a veces no ("foto con espacio.jpg"): se decodifica primero
 * para no codificarlo dos veces (eso daba direcciones inexistentes: "%25C3%25A1").
 */
export function absoluta(ruta: string) {
  let limpia = ruta;
  try {
    limpia = decodeURI(ruta);
  } catch {
    // nombre con un % suelto: se usa tal cual
  }
  return new URL(encodeURI(limpia), TIENDA).toString();
}

export async function leerCatalogoWeb() {
  const res = await fetch(ARCHIVO, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`La tienda respondió ${res.status}`);
  const js = await res.text();
  const inicio = js.indexOf("{", js.indexOf("window.CATALOGO"));
  const fin = js.lastIndexOf("}");
  if (inicio < 0 || fin < inicio) throw new Error("No encontré el catálogo en productos.js");
  const data = JSON.parse(js.slice(inicio, fin + 1)) as { productos?: ProductoWeb[] };

  const usados = new Set<string>();
  return (data.productos ?? [])
    .filter((p): p is ProductoWeb & { nombre: string } => Boolean(p?.nombre))
    .map((p) => {
      const base = p.id || slug(p.nombre);
      let id = base;
      for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
      usados.add(id);
      const imagen = (p.imagenes?.length ? p.imagenes : p.imagen ? [p.imagen] : []).filter(Boolean)[0];
      const detalles = [p.tallas ? `Tallas ${p.tallas}` : null, p.nuevo ? "Nuevo" : null, p.destacado ? "Destacado" : null];
      return {
        external_id: id,
        name: p.nombre.trim(),
        category: p.categoria ?? null,
        description: detalles.filter(Boolean).join(" · ") || null,
        image_url: imagen ? absoluta(imagen) : null,
        product_url: `${TIENDA}producto.html?p=${encodeURIComponent(id)}`,
      };
    });
}

/** Copia el catálogo de la web a catalog_items y desactiva lo que ya no está. */
export async function sincronizarCatalogo(): Promise<{ total: number }> {
  const productos = await leerCatalogoWeb();
  if (!productos.length) throw new Error("La tienda devolvió un catálogo vacío");
  const db = createAdminClient();
  const ahora = new Date().toISOString();
  for (let i = 0; i < productos.length; i += 200) {
    const lote = productos.slice(i, i + 200).map((p) => ({ ...p, active: true, synced_at: ahora }));
    const { error } = await db.from("catalog_items").upsert(lote, { onConflict: "external_id" });
    if (error) throw error;
  }
  await db.from("catalog_items").update({ active: false }).lt("synced_at", ahora).eq("active", true);
  return { total: productos.length };
}

export type Producto = {
  external_id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  product_url: string | null;
};

/** Productos activos; si la copia es vieja (o no hay), se actualiza antes. */
export async function productosActivos(): Promise<Producto[]> {
  const db = createAdminClient();
  const { data: ultimo } = await db
    .from("catalog_items")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultimo || Date.now() - new Date(ultimo.synced_at).getTime() > VIGENCIA_MS) {
    await sincronizarCatalogo().catch((e) => console.error("catálogo", e));
  }
  const { data } = await db
    .from("catalog_items")
    .select("external_id, name, category, description, image_url, product_url")
    .eq("active", true)
    .limit(2000);
  return data ?? [];
}

const normalizar = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** "blusas" → "blusa", "pantalones" → "pantalon": para que el plural también encuentre. */
const raiz = (w: string) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

/**
 * Busca por palabras (en el nombre) y categoría. Devuelve los que más palabras coinciden;
 * sin palabras, los nuevos y destacados de la categoría.
 */
export function buscarProductos(
  productos: Producto[],
  { categoria, palabras }: { categoria?: string | null; palabras?: string[] },
  max = 10,
): { total: number; resultados: Producto[] } {
  const enCategoria = productos.filter((p) => !categoria || categoria === "todas" || p.category === categoria);
  const claves = (palabras ?? []).flatMap((w) => normalizar(w).split(" ")).filter((w) => w.length >= 2).map(raiz);
  const puntaje = (p: Producto) => {
    const nombre = normalizar(p.name);
    let n = claves.filter((k) => nombre.includes(k)).length * 10;
    if (p.description?.includes("Destacado")) n += 2;
    if (p.description?.includes("Nuevo")) n += 1;
    return n;
  };
  const conPuntaje = enCategoria
    .map((p) => ({ p, n: puntaje(p) }))
    .filter(({ n }) => (claves.length ? n >= 10 : true))
    .sort((a, b) => b.n - a.n);
  return { total: conPuntaje.length, resultados: conPuntaje.slice(0, max).map(({ p }) => p) };
}
