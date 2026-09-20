import type { Metadata, Viewport } from "next";
import { GeistMono, GeistSans } from "@personal-suite/design-system/fonts";
import "./globals.css";
import "@personal-suite/design-system/styles.css";
import { PwaRegistrar } from "@personal-suite/pwa";
import { ChartTooltips } from "@/components/ChartTooltips";
import { ScreenWakeLock } from "@/components/ScreenWakeLock";

export const metadata: Metadata = {
  title: "Workouts",
  description: "Workout tracker",
  applicationName: "Workouts",
  appleWebApp: { capable: true, title: "Workouts", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#18191c",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased" style={{ background: "#18191c" }}>
        <PwaRegistrar />
        <ScreenWakeLock />
        <ChartTooltips />
        {children}
      </body>
    </html>
  );
}
