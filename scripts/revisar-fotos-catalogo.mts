// Vuelve a copiar el catálogo de la tienda y revisa que todas las fotos existan (y su peso).
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/revisar-fotos-catalogo.mts
import { absoluta, sincronizarCatalogo } from "../src/lib/ia/catalogo";
import { createAdminClient } from "../src/lib/supabase/admin";

const pruebas: [string, string][] = [
  ["assets/Cat%C3%A1logo%20SilverSoul-4.png", "https://shop.yesandycr.com/assets/Cat%C3%A1logo%20SilverSoul-4.png"],
  ["assets/Catálogo SilverSoul-4.png", "https://shop.yesandycr.com/assets/Cat%C3%A1logo%20SilverSoul-4.png"],
  ["assets/449-1851.jpg", "https://shop.yesandycr.com/assets/449-1851.jpg"],
];
for (const [ruta, esperada] of pruebas) console.log(absoluta(ruta) === esperada ? "✓" : "✗", ruta, "→", absoluta(ruta));

const { total } = await sincronizarCatalogo();
console.log("\nCatálogo copiado:", total, "productos");

const { data } = await createAdminClient().from("catalog_items").select("name, image_url").eq("active", true);
const malas: string[] = [];
let maxKb = 0;
for (let i = 0; i < (data ?? []).length; i += 25) {
  await Promise.all(
    data!.slice(i, i + 25).map(async (p) => {
      const r = await fetch(p.image_url!, { method: "HEAD" });
      if (!r.ok) malas.push(`${r.status} ${p.name}`);
      maxKb = Math.max(maxKb, Number(r.headers.get("content-length") ?? 0) / 1024);
    }),
  );
}
console.log(`Fotos que no cargan: ${malas.length} de ${data?.length}`, malas.slice(0, 5));
console.log(`Foto más pesada: ${Math.round(maxKb)} KB (Instagram acepta hasta 8 MB)`);
