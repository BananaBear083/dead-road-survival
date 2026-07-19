import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const imageUrl = `${siteUrl.replace(/\/$/, "")}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "死路求生 · 2D 僵尸射击",
  description: "守住公路，活过一波又一波尸潮。",
  openGraph: {
    title: "死路求生",
    description: "守住公路，活过今天。",
    type: "website",
    images: [{ url: imageUrl, width: 1200, height: 630, alt: "死路求生游戏封面" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "死路求生",
    description: "守住公路，活过今天。",
    images: [imageUrl],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
