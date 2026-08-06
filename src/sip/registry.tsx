// Registro de módulos: despacha por module.type para o componente
// correspondente (padrão do phone-simulator).
import type { ReactNode } from "react";
import type { LoadedContent, ModuleEntry } from "../engine/types";
import { CftvModule } from "./modules/CftvModule";
import { PlacasModule } from "./modules/PlacasModule";
import { PessoasModule } from "./modules/PessoasModule";
import { LaudosModule } from "./modules/LaudosModule";
import { InterrogatorioModule } from "./modules/InterrogatorioModule";

export interface ModuleApi {
  content: LoadedContent;
  close: () => void;
  openModule: (moduleId: string) => void;
}

export function renderModule(module: ModuleEntry, api: ModuleApi): ReactNode {
  const props = { module, api };
  switch (module.type) {
    case "cftv":
      return <CftvModule {...props} />;
    case "placas":
      return <PlacasModule {...props} />;
    case "pessoas":
      return <PessoasModule {...props} />;
    case "laudos":
      return <LaudosModule {...props} />;
    case "interrogatorio":
      return <InterrogatorioModule {...props} />;
  }
}
