import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AedesLoop 360 · Smart Mosquito Control",
  description: "AedesLoop 360 Smart Mosquito Control: fictional four-block drone, smart ovitrap and command dashboard demonstration",
  icons: { icon: "/brand/aedesloop-emblem-transparent.png", apple: "/brand/aedesloop-emblem-transparent.png" },
};
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) {
  // Browser extensions (e.g. Grammarly) inject attributes such as
  // data-gr-ext-installed onto <body> before React hydrates, which would
  // otherwise surface as a hydration mismatch. Suppress warnings for this
  // element's own attributes only; children are still checked normally.
  return <html lang="en"><body suppressHydrationWarning>{children}</body></html>;
}
