// Consulta de pessoas — stub da fase 1; busca e fichas chegam em fase posterior.
import type { ModuleEntry, PessoasFile } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";

export function PessoasModule({ module, api }: { module: ModuleEntry; api: ModuleApi }) {
  const data = api.content.data[module.dataRef] as PessoasFile | undefined;
  const total = data?.pessoas.length ?? 0;
  return (
    <Panel title={module.label}>
      <p className="sip-stub-note">MÓDULO EM IMPLANTAÇÃO</p>
      <p className="sip-stub-detail">{total} ficha(s) na base.</p>
    </Panel>
  );
}
