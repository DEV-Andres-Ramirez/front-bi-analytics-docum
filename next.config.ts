import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Higiene de demo: el indicador de desarrollo tapaba "Salir" en el pie del sidebar.
  // Los errores de compilación y de ejecución se siguen mostrando.
  devIndicators: false,
};

export default nextConfig;
