import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "CS2 战队老板 · 职业经理生涯",
  description: "创建俱乐部、招募真实职业选手，带队从 Challenger 一路打进 Major 决赛。",
  openGraph: {
    title: "CS2 战队老板",
    description: "创建你的战队，签下真实职业选手，冲击世界第一。",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "CS2 战队老板",
    description: "创建你的战队，签下真实职业选手，冲击世界第一。",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
