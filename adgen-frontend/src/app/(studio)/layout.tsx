import Sidebar from "@/components/Sidebar";

// The studio shell: sidebar + content. The (studio) group holds /dashboard, /create,
// /library etc. while the marketing landing page owns "/" full-bleed via (marketing).
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
