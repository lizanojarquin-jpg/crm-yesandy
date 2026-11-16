import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Seguimiento · CRM Yesandy" };

export default function SeguimientoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">Seguimiento</h1>
      <p className="text-sm text-muted">Clientes por etapa: pedido, pago y envío</p>
      <EmptyState
        titulo="Sin clientes en seguimiento"
        descripcion="Aquí vas a ver a quién hay que confirmarle talla, quién ya pagó y qué pedidos van en camino."
      />
    </div>
  );
}
