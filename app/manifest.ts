import type { MetadataRoute } from "next";
import { brandConfig } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brandConfig.appName,
    short_name: brandConfig.shortName,
    description: brandConfig.description,
    lang: "es-MX",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F4F7F9",
    theme_color: "#0F766E",
    orientation: "any",
    categories: ["medical", "productivity", "business"],
    icons: [
      { src: "/icons/clinicontrol-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/clinicontrol-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/clinicontrol-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
