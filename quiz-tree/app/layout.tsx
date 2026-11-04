import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "라이온즈 퀴즈런 · 월간 홈런 리그",
  description: "같은 이름의 월간 누적점수, 최고 스피드왕, 야구장 레이스",
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
