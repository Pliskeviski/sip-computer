// Interrogatório (voz + chat) — stub da fase 1; discagem, WebRTC e chat
// chegam em fases posteriores, com o servidor Express em server/index.js.
import type { ModuleEntry, NumerosFile } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";

export function InterrogatorioModule({
  module,
  api,
}: {
  module: ModuleEntry;
  api: ModuleApi;
}) {
  const data = api.content.data[module.dataRef] as NumerosFile | undefined;
  const total = data?.numeros.length ?? 0;
  return (
    <Panel title={module.label}>
      <p className="sip-stub-note">MÓDULO EM IMPLANTAÇÃO</p>
      <p className="sip-stub-detail">{total} número(s) autorizado(s) para escuta.</p>
    </Panel>
  );
}
