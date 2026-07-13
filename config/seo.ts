import { brandConfig } from "@/config/brand";

export const seoConfig = {
  title: `${brandConfig.appName} | Gestión para médicos y clínicas pequeñas`,
  description: brandConfig.description,
  siteName: brandConfig.appName
} as const;
