// Laudos e ofícios — stub da fase 1; viewer chega em fase posterior.
import type { LaudosFile, ModuleEntry } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";

export function LaudosModule({ module, api }: { module: ModuleEntry; api: ModuleApi }) {
  const data = api.content.data[module.dataRef] as LaudosFile | undefined;
  const total = data?.documentos.length ?? 0;
  return (
    <Panel title={module.label}>
      <p className="sip-stub-note">MÓDULO EM IMPLANTAÇÃO</p>
      <p className="sip-stub-detail">{total} documento(s) protocolado(s).</p>
    </Panel>
  );
}
