import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AedesLoop 360 · Command", description: "Fictional four-block surveillance and inspection demonstration" };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
