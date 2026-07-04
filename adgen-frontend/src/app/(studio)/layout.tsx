import Sidebar from "@/components/Sidebar";

// The studio shell: sidebar + content. The (studio) group keeps /, /create, /library
// on their URLs while the marketing landing page (/landing) renders full-bleed.
// Small screens stack (top bar over content); lg+ goes side-by-side with the rail.
export default function StudioLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
