import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "作業日報入力 | 日報自動入力システム",
  description:
    "現場作業者向けの作業日報自動入力システム。プルダウン選択のみで簡単に日報を入力できます。",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {/* 下部タブバーの高さ（3.75rem）ぶん、内容の下に余白を取る */}
        <div style={{ paddingBottom: "calc(3.75rem + env(safe-area-inset-bottom))" }}>{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
