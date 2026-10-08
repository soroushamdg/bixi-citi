import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { THEME_BOOT } from "@/components/ThemeToggle";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-unbounded" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "BIXI Story",
  description:
    "An unofficial, interactive 3D portrait of BIXI Montréal: live station status and a real day of rides from the open trip history.",
  applicationName: "BIXI Story",
  authors: [{ name: "Sora Bon (Soroush Bonab)", url: "https://linktr.ee/soroucsh" }],
  creator: "Sora Bon (Soroush Bonab)",
  openGraph: {
    title: "BIXI Story · Montréal, ride by ride",
    description: "Live station pulses and a real day of BIXI rides over a 3D model of Montréal. Unofficial.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e6e9ef" },
    { media: "(prefers-color-scheme: dark)", color: "#1c2029" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="auto" suppressHydrationWarning className={`${unbounded.variable} ${geist.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
