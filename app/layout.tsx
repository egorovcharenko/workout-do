import type { Metadata, Viewport } from "next";
import { GeistMono, GeistSans } from "@personal-suite/design-system/fonts";
import "./globals.css";
import "@personal-suite/app-shell/styles.css";
import { AuthProvider } from "@/lib/firebase/auth";
import { SuiteShell } from "@personal-suite/app-shell";
import { PwaRegistrar } from "@personal-suite/pwa";

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
        <SuiteShell currentApp="workouts">
          <PwaRegistrar />
          <AuthProvider>{children}</AuthProvider>
        </SuiteShell>
      </body>
    </html>
  );
}
