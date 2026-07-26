import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME, BACKGROUND_COLOR, PWA_ICONS, THEME_COLOR } from "@/lib/pwa-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Receipts",
    description: APP_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: PWA_ICONS,
  };
}
