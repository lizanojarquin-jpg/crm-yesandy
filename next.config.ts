import type { NextConfig } from "next";

// El CRM es 100 % dinámico (todo depende de la sesión), así que no usamos
// Cache Components: cada página se renderiza por solicitud.
const nextConfig: NextConfig = {
  experimental: {
    // Fotos enviadas desde la bandeja (se comprimen en el navegador; 4 MB de margen).
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
