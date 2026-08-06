// Chrome do sistema: barra superior (órgão/título/agente + encerrar sessão),
// menu lateral de módulos (vira barra inferior em telas estreitas — ver sip.css)
// e área principal que hospeda o módulo aberto via registry.
import type { LoadedContent } from "../engine/types";
import { renderModule } from "./registry";

export function Desktop({
  content,
  openModuleId,
  onOpenModule,
  onLogout,
}: {
  content: LoadedContent;
  openModuleId: string | null;
  onOpenModule: (moduleId: string | null) => void;
  onLogout: () => void;
}) {
  const { system, modules } = content;
  const openModule = openModuleId
    ? modules.find((m) => m.id === openModuleId)
    : undefined;

  return (
    <div className="sip-desktop">
      <header className="sip-topbar">
        <button
          className="sip-topbar-brand"
          onClick={() => onOpenModule(null)}
          title="Ir para a visão geral"
        >
          <span className="sip-topbar-orgao">{system.orgao}</span>
          <span className="sip-topbar-titulo">{system.titulo}</span>
        </button>
        <div className="sip-topbar-right">
          {system.agenteDefault && (
            <span className="sip-topbar-agente">{system.agenteDefault}</span>
          )}
          <button className="sip-button sip-button-ghost" onClick={onLogout}>
            Encerrar sessão
          </button>
        </div>
      </header>

      <div className="sip-body">
        <nav className="sip-sidebar" aria-label="Módulos">
          {modules.map((m) => (
            <button
              key={m.id}
              className={`sip-menu-item${m.id === openModuleId ? " active" : ""}`}
              onClick={() => onOpenModule(m.id)}
            >
              <span className="sip-menu-icon" aria-hidden="true">{m.icon}</span>
              <span className="sip-menu-label">{m.label}</span>
            </button>
          ))}
        </nav>

        <main className="sip-main">
          {openModule ? (
            renderModule(openModule, {
              content,
              close: () => onOpenModule(null),
              openModule: onOpenModule,
            })
          ) : (
            <div className="sip-home">
              <div className="sip-home-caso">CASO {system.casoId.toUpperCase()}</div>
              <h2 className="sip-home-titulo">{system.titulo}</h2>
              <p className="sip-home-texto">
                Selecione um módulo no menu para consultar os registros do caso.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
