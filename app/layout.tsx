import type { Metadata, Viewport } from "next";
import { Unbounded, DM_Sans } from "next/font/google";
import { PageTransition } from "@/components/motion/PageTransition";
import "./globals.css";

const unbounded = Unbounded({
  subsets: ["latin"],
  variable: "--font-unbounded",
  weight: ["400", "600", "800", "900"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://burgh-quarterly.vercel.app",
  ),
  title: "Signal Pittsburgh",
  description:
    "The businesses Pittsburgh is talking about, ranked every quarter. Published by Relay.",
};

export const viewport: Viewport = {
  themeColor: "#0F0F0F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body bg-editorial paper-grain">
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
