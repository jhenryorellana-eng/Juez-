import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Diagnóstico — Evalúa tu caso de inmigración",
  description:
    "Responde unas preguntas y recibe un diagnóstico claro de la probabilidad de éxito de tu caso de inmigración en EE. UU.",
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
    <html lang="es" className={inter.variable}>
      <body className="min-h-[100dvh] font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
