import Sidebar from "@/components/Sidebar";

// The studio shell: sidebar + content. The (studio) group keeps /, /create, /library
// on their URLs while the marketing landing page (/landing) renders full-bleed.
export default function StudioLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
