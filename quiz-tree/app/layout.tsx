import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "퀴즈런 · 함께 달리는 우리 반",
  description: "10명 이상 함께 달리는 실시간 수업 퀴즈",
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
