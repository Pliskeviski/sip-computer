// Painel base dos módulos: cabeçalho com título + corpo.
import type { ReactNode } from "react";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sip-panel">
      <header className="sip-panel-head">
        <h2 className="sip-panel-title">{title}</h2>
      </header>
      <div className="sip-panel-body">{children}</div>
    </section>
  );
}
