import Link from "next/link";

/**
 * Layout del grupo de rutas privadas (panel del comercio).
 * El grupo `(panel)` no agrega segmento a la URL: las rutas viven en /panel/*.
 *
 * TODO (features): proteger con Auth. Verificar sesión (rol 'comercio'/'admin')
 * en un componente cliente o middleware antes de renderizar el panel.
 */
export default function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
      <aside className="w-48 shrink-0 border-r pr-4 text-sm">
        <nav className="flex flex-col gap-2">
          <Link href="/panel">Resumen</Link>
          <Link href="/panel/comercios">Mis comercios</Link>
          <Link href="/panel/suscripcion">Suscripción</Link>
        </nav>
      </aside>
      <section className="flex-1">{children}</section>
    </div>
  );
}
