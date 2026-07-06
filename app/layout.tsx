import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/firebase/auth";

export const metadata: Metadata = {
  title: "Workout Do",
  description: "Workout tracker",
  icons: { icon: "/favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" style={{ background: "#18191c" }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
