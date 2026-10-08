import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { THEME_BOOT } from "@/components/ThemeToggle";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-unbounded" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://bixi-citi.vercel.app"),
  title: "BIXI Citi",
  description:
    "Storytelling with BIXI Montréal data: an unofficial, interactive 3D portrait of live station status, a real day of rides and every season since 2014.",
  applicationName: "BIXI Citi",
  authors: [{ name: "Sora Bon (Soroush Bonab)", url: "https://linktr.ee/soroucsh" }],
  creator: "Sora Bon (Soroush Bonab)",
  openGraph: {
    title: "BIXI Citi · storytelling with BIXI data",
    description: "Live stations, real rides and 13 seasons of BIXI Montréal over a 3D model of the city. Unofficial.",
    type: "website",
    images: [{ url: "/video/poster.jpg", width: 1280, height: 720, alt: "BIXI Citi: live BIXI stations over a 3D model of Montréal at night" }],
    videos: [{ url: "/video/bixi-citi-showreel.mp4", type: "video/mp4", width: 1920, height: 1080 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BIXI Citi · storytelling with BIXI data",
    description: "Live stations, real rides and 13 seasons of BIXI Montréal over a 3D model of the city. Unofficial.",
    images: ["/video/poster.jpg"],
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
