import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import RegistrarSW from "@/components/RegistrarSW";

// Serifa editorial: assina a marca e veste os numeros (dinheiro como manchete).
const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// Grotesca humanista: todo o resto da interface.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "We Finance",
  description: "As finanças da casa, do casal e de cada um - no mesmo lugar.",
  manifest: "/manifest.webmanifest",
  applicationName: "We Finance",
  icons: {
    icon: [
      { url: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icone-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    // "default": barra de status com texto escuro legivel sobre o marfim do app
    // (o header verde fica logo abaixo). Evita texto branco invisivel.
    capable: true,
    title: "We Finance",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#1C3A31",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-dvh bg-ivory text-ink antialiased">
        <Providers>{children}</Providers>
        <RegistrarSW />
      </body>
    </html>
  );
}
