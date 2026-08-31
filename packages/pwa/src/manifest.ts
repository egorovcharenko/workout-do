type ManifestOptions = {
  name: string;
  shortName: string;
  description: string;
  backgroundColor: string;
  themeColor: string;
  startUrl?: string;
  scope?: string;
};

export function createPwaManifest({
  name,
  shortName,
  description,
  backgroundColor,
  themeColor,
  startUrl = "/",
  scope = "/",
}: ManifestOptions) {
  return {
    name,
    short_name: shortName,
    description,
    id: startUrl,
    start_url: startUrl,
    scope,
    display: "standalone" as const,
    display_override: ["window-controls-overlay" as const, "standalone" as const],
    background_color: backgroundColor,
    theme_color: themeColor,
    orientation: "any" as const,
    prefer_related_applications: false,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" as const },
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" as const },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" as const },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" as const },
    ],
  };
}
