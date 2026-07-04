import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOCIALADZGEN STUDIO — Ad videos in minutes",
  description:
    "AI-made video ads for Indian businesses and agencies. English + Hindi, from a single idea. No crew, no camera, no agency fees.",
};

export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
