// Consulta de placas — stub da fase 1; lookup chega em fase posterior.
import type { ModuleEntry, PlacasFile } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";

export function PlacasModule({ module, api }: { module: ModuleEntry; api: ModuleApi }) {
  const data = api.content.data[module.dataRef] as PlacasFile | undefined;
  const total = data?.placas.length ?? 0;
  return (
    <Panel title={module.label}>
      <p className="sip-stub-note">MÓDULO EM IMPLANTAÇÃO</p>
      <p className="sip-stub-detail">{total} veículo(s) na base.</p>
    </Panel>
  );
}
