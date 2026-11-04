import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "퀴즈나무 · 함께 오르는 우리 반",
  description: "최대 10명이 함께 도전하는 실시간 수업 퀴즈",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
