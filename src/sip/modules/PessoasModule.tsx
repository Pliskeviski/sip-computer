// Consulta de pessoas — busca por nome/CPF, ficha completa com vínculos
// navegáveis e pilha de "voltar" interna ao módulo.
import { useMemo, useState } from "react";
import type { ModuleEntry, Pessoa, PessoasFile } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { assetUrl } from "../../engine/loadContent";
import { Panel } from "../components/Panel";
import "../styles/pessoas.css";

/** Remove acentos e normaliza caixa, para busca accent-insensitive. */
function norm(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function formatData(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function Silhueta() {
  return (
    <svg className="pes-silhueta" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="22" r="12" fill="currentColor" />
      <path d="M8 58c2-14 12-20 24-20s22 6 24 20z" fill="currentColor" />
    </svg>
  );
}

function Foto({ pessoa }: { pessoa: Pessoa }) {
  const [erro, setErro] = useState(false);
  return (
    <div className="pes-foto">
      {pessoa.foto && !erro ? (
        <img
          src={assetUrl(pessoa.foto)}
          alt={`Foto de ${pessoa.nome}`}
          onError={() => setErro(true)}
        />
      ) : (
        <Silhueta />
      )}
    </div>
  );
}

export function PessoasModule({ module, api }: { module: ModuleEntry; api: ModuleApi }) {
  const data = api.content.data[module.dataRef] as PessoasFile | undefined;
  const pessoas = useMemo(() => data?.pessoas ?? [], [data]);

  const [query, setQuery] = useState("");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [pilha, setPilha] = useState<string[]>([]);

  const resultados = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    const qCpf = normCpf(query);
    return pessoas.filter(
      (p) => norm(p.nome).includes(q) || (qCpf.length > 0 && normCpf(p.cpf).includes(qCpf)),
    );
  }, [pessoas, query]);

  const ficha = fichaId ? pessoas.find((p) => p.id === fichaId) : undefined;

  function abrirFicha(id: string) {
    if (fichaId) setPilha((s) => [...s, fichaId]);
    setFichaId(id);
  }

  function voltar() {
    const anterior = pilha[pilha.length - 1];
    setPilha((s) => s.slice(0, -1));
    setFichaId(anterior ?? null);
  }

  function sairDaFicha() {
    setFichaId(null);
    setPilha([]);
  }

  return (
    <Panel title="CONSULTA DE PESSOAS">
      {!ficha && (
        <div className="pes-busca-view">
          <label className="sip-field pes-busca">
            <span className="sip-field-label">Nome ou CPF</span>
            <input
              className="sip-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex.: Fernanda Salles ou 402.118.775-09"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          {query.trim() === "" ? (
            <p className="pes-hint">
              Pesquise por nome (parcial, sem acentos) ou CPF. Base com {pessoas.length}{" "}
              ficha(s).
            </p>
          ) : resultados.length === 0 ? (
            <p className="pes-vazio">&gt;&gt; NENHUM REGISTRO ENCONTRADO</p>
          ) : (
            <ul className="pes-resultados">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button type="button" className="pes-resultado" onClick={() => abrirFicha(p.id)}>
                    <span className="pes-resultado-nome">{p.nome}</span>
                    <span className="pes-resultado-cpf">CPF {p.cpf}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {ficha && (
        <article className="pes-ficha-card">
          <header className="pes-ficha-head">
            <span className="pes-ficha-num">FICHA Nº {ficha.id.toUpperCase()}</span>
            <div className="pes-ficha-nav">
              {pilha.length > 0 && (
                <button type="button" className="sip-button sip-button-ghost" onClick={voltar}>
                  ← Voltar
                </button>
              )}
              <button type="button" className="sip-button sip-button-ghost" onClick={sairDaFicha}>
                Nova consulta
              </button>
            </div>
          </header>

          <div className="pes-ficha-corpo">
            <Foto pessoa={ficha} />
            <dl className="pes-dados">
              <div className="pes-linha">
                <dt>NOME</dt>
                <dd>{ficha.nome.toUpperCase()}</dd>
              </div>
              <div className="pes-linha">
                <dt>CPF</dt>
                <dd>{ficha.cpf}</dd>
              </div>
              {ficha.dataNascimento && (
                <div className="pes-linha">
                  <dt>NASCIMENTO</dt>
                  <dd>{formatData(ficha.dataNascimento)}</dd>
                </div>
              )}
              <div className="pes-linha">
                <dt>ENDEREÇO</dt>
                <dd>{ficha.endereco}</dd>
              </div>
              {ficha.profissao && (
                <div className="pes-linha">
                  <dt>PROFISSÃO</dt>
                  <dd>{ficha.profissao}</dd>
                </div>
              )}
            </dl>
          </div>

          <section className="pes-antecedentes">
            <h3 className="pes-secao-titulo">Antecedentes</h3>
            {ficha.antecedentes.length === 0 ? (
              <p className="pes-nada-consta">NADA CONSTA</p>
            ) : (
              <ul className="pes-antecedentes-lista">
                {ficha.antecedentes.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="pes-vinculos">
            <h3 className="pes-secao-titulo">Vínculos</h3>
            {ficha.vinculos.length === 0 ? (
              <p className="pes-hint">Nenhum vínculo registrado.</p>
            ) : (
              <div className="pes-vinculos-chips">
                {ficha.vinculos.map((v) => {
                  const alvo = pessoas.find((p) => p.id === v.pessoaId);
                  return (
                    <button
                      key={v.pessoaId}
                      type="button"
                      className="pes-chip"
                      disabled={!alvo}
                      title={alvo ? `Abrir ficha de ${alvo.nome}` : "Ficha não localizada"}
                      onClick={() => alvo && abrirFicha(alvo.id)}
                    >
                      <span className="pes-chip-relacao">{v.relacao}</span>
                      <span className="pes-chip-nome">{alvo ? alvo.nome : "registro indisponível"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </article>
      )}
    </Panel>
  );
}
