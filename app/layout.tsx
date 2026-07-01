import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "El Juez — Evalúa tu caso de inmigración",
  description:
    "Cuenta tu historia de migración y descubre con IA qué probabilidad de éxito tiene tu caso en EE. UU.",
};

export const viewport: Viewport = {
  themeColor: "#e6e6eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans text-label antialiased">{children}</body>
    </html>
  );
}
