import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AedesLoop 360 · Smart Mosquito Control",
  description: "AedesLoop 360 Smart Mosquito Control: fictional four-block drone, smart ovitrap and command dashboard demonstration",
  icons: { icon: "/brand/aedesloop-emblem-transparent.png", apple: "/brand/aedesloop-emblem-transparent.png" },
};
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
