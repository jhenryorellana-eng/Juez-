import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Diagnóstico — Evalúa tu caso de asilo",
  description:
    "Sube tu caso de asilo y recibe un diagnóstico claro de la probabilidad de que un juez lo apruebe — y qué debes reforzar.",
};

export const viewport: Viewport = {
  themeColor: "#eef3fb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${grotesk.variable} ${mono.variable}`}>
      <body className="min-h-[100dvh] font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
