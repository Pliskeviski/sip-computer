// Central de Câmeras (CFTV) — stub da fase 1; player chega em fase posterior.
import type { CftvFile, ModuleEntry } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";

export function CftvModule({ module, api }: { module: ModuleEntry; api: ModuleApi }) {
  const data = api.content.data[module.dataRef] as CftvFile | undefined;
  const total = data?.gravacoes.length ?? 0;
  return (
    <Panel title={module.label}>
      <p className="sip-stub-note">MÓDULO EM IMPLANTAÇÃO</p>
      <p className="sip-stub-detail">{total} gravação(ões) indexada(s) no caso.</p>
    </Panel>
  );
}
