import { Card } from "@/components/ui/card";
import { listarRespuestasRapidas } from "@/lib/inbox/queries";
import { borrarRespuesta } from "./respuestas-actions";
import { RespuestaForm } from "./respuesta-form";

export async function RespuestasRapidas() {
  const respuestas = await listarRespuestasRapidas();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Aparecen en el botón ⚡ al escribir un mensaje. <b>{"{cliente}"}</b> se cambia por el primer nombre del cliente y <b>{"{vendedora}"}</b>{" "}
        por el nombre con que se presenta quien responde (el que pone al entrar).
      </p>
      {respuestas.map((r) => (
        <Card key={r.id} className="flex flex-col gap-2">
          <RespuestaForm id={r.id} titulo={r.title} texto={r.body} />
          <form action={borrarRespuesta.bind(null, r.id)}>
            <button className="text-xs text-muted hover:text-danger">Borrar</button>
          </form>
        </Card>
      ))}
      <Card>
        <RespuestaForm />
      </Card>
    </div>
  );
}
