// Consulta veicular — DETRAN (fictício). Máscara de placa (antiga e
// Mercosul), normalização para lookup, terminal de leitura e histórico
// de sessão das placas consultadas.
import { useState } from "react";
import type { FormEvent } from "react";
import type { ModuleEntry, PlacaRegistro, PlacasFile } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";
import "../styles/placas.css";

const RE_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
const RE_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

/** Remove tudo que não é letra/dígito e força maiúsculas. */
function normalizePlaca(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Formata para exibição: ABC-1234 (antiga) ou ABC1D23 (Mercosul). */
function formatPlaca(norm: string): string {
  if (RE_ANTIGA.test(norm)) return `${norm.slice(0, 3)}-${norm.slice(3)}`;
  return norm;
}

function isValidPlaca(norm: string): boolean {
  return RE_ANTIGA.test(norm) || RE_MERCOSUL.test(norm);
}

/** Aplica a máscara durante a digitação: letras maiúsculas, hífen automático. */
function maskInput(raw: string): string {
  const norm = normalizePlaca(raw).slice(0, 7);
  if (norm.length > 3 && /^[A-Z]{3}[0-9]/.test(norm) && !/^[A-Z]{3}[0-9][A-Z]/.test(norm)) {
    return `${norm.slice(0, 3)}-${norm.slice(3)}`;
  }
  return norm;
}

/** Mascara o CPF: mantém o primeiro bloco e os dígitos verificadores. */
function maskCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

type Status =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "hit"; registro: PlacaRegistro }
  | { kind: "miss"; placa: string };

export function PlacasModule({ module, api }: { module: ModuleEntry; api: ModuleApi }) {
  const data = api.content.data[module.dataRef] as PlacasFile | undefined;
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [historico, setHistorico] = useState<string[]>([]);

  function consultar(placaRaw: string) {
    const norm = normalizePlaca(placaRaw);
    if (!norm) return;
    if (!isValidPlaca(norm)) {
      setStatus({ kind: "invalid" });
      return;
    }
    const registro = data?.placas.find((p) => normalizePlaca(p.placa) === norm);
    setStatus(registro ? { kind: "hit", registro } : { kind: "miss", placa: formatPlaca(norm) });
    setHistorico((h) => [formatPlaca(norm), ...h.filter((x) => x !== formatPlaca(norm))].slice(0, 8));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    consultar(input);
  }

  return (
    <Panel title="CONSULTA VEICULAR — DETRAN">
      <form className="plc-busca" onSubmit={onSubmit}>
        <label className="sip-field">
          <span className="sip-field-label">Placa do veículo</span>
          <input
            className="sip-input plc-input"
            value={input}
            onChange={(e) => setInput(maskInput(e.target.value))}
            placeholder="ABC-1234 ou ABC1D23"
            maxLength={8}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="sip-button plc-btn">
          Consultar
        </button>
      </form>

      {status.kind === "invalid" && (
        <div className="plc-terminal plc-terminal-erro">
          <p className="plc-terminal-msg">&gt;&gt; FORMATO INVÁLIDO</p>
          <p className="plc-terminal-sub">
            Padrões aceitos: ABC-1234 (antiga) ou ABC1D23 (Mercosul).
          </p>
        </div>
      )}

      {status.kind === "miss" && (
        <div className="plc-terminal plc-terminal-erro">
          <p className="plc-terminal-placa">{status.placa}</p>
          <p className="plc-terminal-msg">&gt;&gt; VEÍCULO NÃO LOCALIZADO NOS REGISTROS</p>
        </div>
      )}

      {status.kind === "hit" && (
        <div className="plc-terminal">
          <p className="plc-terminal-placa">{formatPlaca(normalizePlaca(status.registro.placa))}</p>
          <dl className="plc-ficha">
            <div className="plc-linha">
              <dt>PROPRIETÁRIO</dt>
              <dd>{status.registro.proprietario.toUpperCase()}</dd>
            </div>
            {status.registro.cpf && (
              <div className="plc-linha">
                <dt>CPF</dt>
                <dd>{maskCpf(status.registro.cpf)}</dd>
              </div>
            )}
            <div className="plc-linha">
              <dt>MODELO</dt>
              <dd>{status.registro.modelo.toUpperCase()}</dd>
            </div>
            <div className="plc-linha">
              <dt>COR</dt>
              <dd>{status.registro.cor.toUpperCase()}</dd>
            </div>
            <div className="plc-linha">
              <dt>ANO</dt>
              <dd>{status.registro.ano}</dd>
            </div>
            <div className="plc-linha">
              <dt>SITUAÇÃO</dt>
              <dd className="plc-ok">REGULAR</dd>
            </div>
          </dl>
        </div>
      )}

      {status.kind === "idle" && (
        <p className="plc-hint">
          Informe a placa para consultar o registro no DETRAN. Base com{" "}
          {data?.placas.length ?? 0} veículo(s).
        </p>
      )}

      {historico.length > 0 && (
        <div className="plc-historico">
          <h3 className="plc-historico-titulo">Consultas nesta sessão</h3>
          <ul className="plc-historico-lista">
            {historico.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  className="plc-historico-item"
                  onClick={() => {
                    setInput(p);
                    consultar(p);
                  }}
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
