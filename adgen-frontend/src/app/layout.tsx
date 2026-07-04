import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// Locked identity (file 15): Space Grotesk display + Satoshi body (NOT Inter).
// Satoshi is self-hosted — a third-party Fontshare <link> render-blocked first
// paint on slow connections, which this audience (mobile, metered data) can't afford.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const satoshi = localFont({
  variable: "--font-body",
  src: [
    { path: "../fonts/Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Satoshi-700.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "SOCIALADZGEN STUDIO — AI Ad Studio",
  description:
    "Finished ad videos for your business in minutes — English + Hindi. No crew, no camera, no agency fees.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${satoshi.variable} h-full antialiased`}
    >
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
