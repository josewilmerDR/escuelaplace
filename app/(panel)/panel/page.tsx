/**
 * Panel del comercio — resumen (/panel).
 * Ruta privada (requiere Auth, rol 'comercio'/'admin'). Render de cliente: aquí el
 * dueño verá métricas, estado de suscripción y accesos para editar su perfil.
 */
export default function PanelHome() {
  return (
    <main>
      <h1 className="text-2xl font-bold">Panel del comercio</h1>
      <p className="mt-2 text-gray-600">
        Desde aquí vas a administrar tu perfil, fotos, descuento y ver tus
        métricas. (Pendiente de implementar.)
      </p>
    </main>
  );
}
