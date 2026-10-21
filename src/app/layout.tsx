import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "余白の美術館 — その気持ちに、ひとつの美術館を。",
  description:
    "今の気持ちをことばにして、八角形の部屋で8つの実在する絵画と出会う。あなただけの、静かな3D美術館。",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f3",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
