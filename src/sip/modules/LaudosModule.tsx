// Laudos e ofícios — lista ordenada por data e leitor com papel timbrado,
// selo de ofício, corpo em parágrafos e anexo.
import { useMemo, useState } from "react";
import type { LaudosFile, ModuleEntry } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { assetUrl } from "../../engine/loadContent";
import { Panel } from "../components/Panel";
import "../styles/laudos.css";

function formatDataLonga(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDataCurta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

/** Deriva um número de ofício a partir do id (ex.: "doc-001" → "Nº 001"). */
function numeroOficio(id: string): string {
  const digitos = id.replace(/\D/g, "");
  return digitos ? `Nº ${digitos}` : id.toUpperCase();
}

export function LaudosModule({ module, api }: { module: ModuleEntry; api: ModuleApi }) {
  const data = api.content.data[module.dataRef] as LaudosFile | undefined;
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const documentos = useMemo(
    () =>
      [...(data?.documentos ?? [])].sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
      ),
    [data],
  );

  const aberto = abertoId ? documentos.find((d) => d.id === abertoId) : undefined;

  return (
    <Panel title="LAUDOS E OFÍCIOS">
      {!aberto && (
        <>
          {documentos.length === 0 ? (
            <p className="lau-hint">Nenhum documento anexado ao caso.</p>
          ) : (
            <ul className="lau-lista">
              {documentos.map((d) => (
                <li key={d.id}>
                  <button type="button" className="lau-item" onClick={() => setAbertoId(d.id)}>
                    <span className="lau-item-titulo">{d.titulo}</span>
                    <span className="lau-item-meta">
                      <span className="lau-item-origem">{d.origem}</span>
                      <span className="lau-item-data">{formatDataCurta(d.data)}</span>
                    </span>
                    {d.seloOficio && <span className="lau-badge">Recebido por ofício</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {aberto && (
        <div className="lau-reader">
          <button
            type="button"
            className="sip-button sip-button-ghost lau-voltar"
            onClick={() => setAbertoId(null)}
          >
            ← Voltar à lista
          </button>

          <article className="lau-doc">
            <header className="lau-doc-head">
              <p className="lau-doc-orgao">{api.content.system.orgao.toUpperCase()}</p>
              <p className="lau-doc-origem">{aberto.origem.toUpperCase()}</p>
              <p className="lau-doc-oficio">
                OFÍCIO {numeroOficio(aberto.id)} — {formatDataLonga(aberto.data)}
              </p>
              {aberto.seloOficio && <span className="lau-selo">RECEBIDO POR OFÍCIO</span>}
            </header>

            <h3 className="lau-doc-titulo">{aberto.titulo}</h3>

            <div className="lau-doc-corpo">
              {aberto.corpo.split(/\n{2,}/).map((paragrafo, i) => (
                <p key={i}>
                  {paragrafo.split("\n").map((linha, j) => (
                    <span key={j}>
                      {j > 0 && <br />}
                      {linha}
                    </span>
                  ))}
                </p>
              ))}
            </div>

            {aberto.anexo && (
              <figure className="lau-anexo">
                <figcaption className="lau-anexo-titulo">ANEXO — {aberto.anexo}</figcaption>
                <img src={assetUrl(aberto.anexo)} alt={`Anexo do documento ${aberto.titulo}`} />
              </figure>
            )}
          </article>
        </div>
      )}
    </Panel>
  );
}
