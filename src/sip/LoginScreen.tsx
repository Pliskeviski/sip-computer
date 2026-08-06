// Tela de login: matrícula + senha, verificação SHA-256 (Web Crypto)
// contra system.loginHash — mesmo padrão do PIN do phone-simulator.
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { SystemContent } from "../engine/types";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function LoginScreen({
  system,
  onUnlock,
}: {
  system: SystemContent;
  onUnlock: () => void;
}) {
  const [matricula, setMatricula] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(false), 2500);
    return () => clearTimeout(t);
  }, [error]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    try {
      const normalized = `${matricula.trim()}:${senha.trim()}`.toLowerCase();
      const hash = await sha256Hex(normalized);
      if (hash === system.loginHash.toLowerCase()) {
        onUnlock();
      } else {
        setError(true);
        setSenha("");
      }
    } catch {
      setError(true);
      setSenha("");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="sip-login">
      <form className={`sip-login-card${error ? " sip-shake" : ""}`} onSubmit={submit}>
        <div className="sip-login-orgao">{system.orgao}</div>
        <h1 className="sip-login-titulo">{system.titulo}</h1>
        <div className="sip-login-sub">ACESSO RESTRITO — USO FUNCIONAL</div>

        <label className="sip-field">
          <span className="sip-field-label">Matrícula</span>
          <input
            className="sip-input"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="sip-field">
          <span className="sip-field-label">Senha</span>
          <input
            className="sip-input"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <div className="sip-login-error">ACESSO NEGADO</div>}

        <button className="sip-button" type="submit" disabled={checking}>
          {checking ? "Verificando…" : "Entrar"}
        </button>

        {system.loginHint && <div className="sip-login-hint">{system.loginHint}</div>}
      </form>
    </div>
  );
}
