import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import RegistrarSW from "@/components/RegistrarSW";

export const metadata: Metadata = {
  title: "Nossas Financas",
  description: "Controle financeiro de casa, pessoal e PJ",
  manifest: "/manifest.webmanifest",
  applicationName: "Nossas Financas",
  icons: {
    icon: [
      { url: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // Faz o iPhone abrir em tela cheia quando adicionado a tela de inicio.
  appleWebApp: {
    capable: true,
    title: "Financas",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  other: {
    // O Next 15 emite apenas "mobile-web-app-capable" (o nome padronizado).
    // iPhone anterior ao iOS 17.4 so entende a versao com prefixo apple- e,
    // sem ela, abre com a barra do Safari em vez de tela cheia.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  // Deixa o conteudo ir ate a borda; o padding do notch vem do CSS.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <Providers>{children}</Providers>
        <RegistrarSW />
      </body>
    </html>
  );
}
