import type { NextConfig } from "next";

// El CRM es 100 % dinámico (todo depende de la sesión), así que no usamos
// Cache Components: cada página se renderiza por solicitud.
const nextConfig: NextConfig = {
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
