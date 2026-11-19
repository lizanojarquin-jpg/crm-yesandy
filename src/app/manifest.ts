import type { MetadataRoute } from "next";

// Permite instalar el CRM en la pantalla de inicio del celular (y en la computadora).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM Yesandy",
    short_name: "Yesandy",
    description: "Mensajes y seguimiento de clientes de Almacén Yesandy",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f6f4",
    theme_color: "#9d2a4e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
