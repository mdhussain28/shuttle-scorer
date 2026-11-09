import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Roboto } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

// Roboto is bundled at build time, so every phone and computer shows the same font.
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: "Shuttle Scorer",
  description: "Badminton tournaments and match scoring",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Shuttle" },
};

export const viewport: Viewport = {
  themeColor: "#0f3f9e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={roboto.variable}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
