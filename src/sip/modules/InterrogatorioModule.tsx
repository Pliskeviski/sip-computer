// Interrogatório — linha segura: dois fluxos separados em abas.
// LIGAÇÃO: discagem estilo CSI, chamada de voz via OpenAI Realtime (WebRTC,
// portado de arquivo-morto-voz/public/index.html).
// ZAPTALK: conversa por texto com cara de ZapTalk (o app de mensagens do
// phone-simulator), via POST /api/chat.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ModuleEntry, NumerosFile } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";
import "../styles/interrogatorio.css";

type ChatMsg = { role: "user" | "assistant"; content: string; ts?: string };
type TranscriptLine = { who: "suspeito" | "investigador"; text: string; responseId?: string };
type CallPhase = "idle" | "chamando" | "conectando" | "em_chamada" | "falha";
type Tab = "ligacao" | "zaptalk";
type ZtErro = "" | "sem_zaptalk" | "indisponivel" | "falha";

// ---------- número ----------

const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 11);

function maskPhone(digits: string): string {
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// ---------- falhas ficcionais da discagem ----------

const FLAVORS_NAO_ATENDE = [
  "CHAMANDO… NÃO ATENDE",
  "CHAMANDO… CAIXA POSTAL",
];
const FLAVORS_FORA_DE_SERVICO = [
  "NÚMERO FORA DE SERVIÇO",
  "FORA DE ÁREA — SEM SINAL",
];

// ---------- storage (mesma convenção sip:<casoId>: de engine/storage) ----------

function chatStorageKey(casoId: string, numero: string): string {
  return `sip:${casoId}:chat:${numero}`;
}

function loadChat(casoId: string, numero: string): ChatMsg[] {
  try {
    const raw = localStorage.getItem(chatStorageKey(casoId, numero));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is ChatMsg =>
          !!m &&
          typeof m === "object" &&
          ((m as ChatMsg).role === "user" || (m as ChatMsg).role === "assistant") &&
          typeof (m as ChatMsg).content === "string",
      )
      .map((m) =>
        typeof m.ts === "string" ? { role: m.role, content: m.content, ts: m.ts } : { role: m.role, content: m.content },
      );
  } catch {
    return [];
  }
}

function saveChat(casoId: string, numero: string, chat: ChatMsg[]): void {
  try {
    localStorage.setItem(chatStorageKey(casoId, numero), JSON.stringify(chat));
  } catch {
    // armazenamento indisponível — ignora
  }
}

function clearChat(casoId: string, numero: string): void {
  try {
    localStorage.removeItem(chatStorageKey(casoId, numero));
  } catch {
    // ignora
  }
}

// ---------- formatação ----------

function fmtSegundos(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtHora(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------- avatar genérico (mesma linguagem do phone-simulator) ----------

const AVATAR_COLORS = [
  "#5b8def",
  "#9b51e0",
  "#e15f41",
  "#27ae60",
  "#c0790b",
  "#c13584",
  "#007d74",
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------- componente ----------

export function InterrogatorioModule({
  module,
  api,
}: {
  module: ModuleEntry;
  api: ModuleApi;
}) {
  const data = api.content.data[module.dataRef] as NumerosFile | undefined;
  const numeros = data?.numeros ?? [];
  const casoId = api.content.system.casoId;

  const [tab, setTab] = useState<Tab>("ligacao");

  // ---------- ligação (voz) ----------
  const [digits, setDigits] = useState("");
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [failMsg, setFailMsg] = useState("");
  const [nome, setNome] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [semChave, setSemChave] = useState(false);
  const [micNegado, setMicNegado] = useState(false);

  // ---------- zaptalk (texto) ----------
  const [ztDigits, setZtDigits] = useState("");
  const [ztAtivo, setZtAtivo] = useState(false);
  const [ztNome, setZtNome] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatEnviando, setChatEnviando] = useState(false);
  const [ztErro, setZtErro] = useState<ZtErro>("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flavorIdxRef = useRef(0);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const numeroValido = digits.length >= 10;
  const ztNumeroValido = ztDigits.length >= 10;
  const emLigacao = phase === "chamando" || phase === "conectando" || phase === "em_chamada";

  // ---------- ciclo de vida da chamada ----------

  const desligar = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // ignora
      }
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.srcObject = null;
      } catch {
        // ignora
      }
      audioRef.current = null;
    }
    setPhase((p) => (p === "falha" ? p : "idle"));
    setSegundos(0);
  }, []);

  // limpeza ao desmontar
  useEffect(() => desligar, [desligar]);

  // transcrição ao vivo (best-effort — tolera ausência de eventos)
  const handleRealtimeEvent = useCallback((msg: Record<string, unknown>) => {
    const type = typeof msg.type === "string" ? msg.type : "";

    if (type === "response.output_audio_transcript.delta") {
      const responseId = String(msg.response_id ?? "");
      const delta = String(msg.delta ?? "");
      if (!delta) return;
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.who === "suspeito" && last.responseId === responseId) {
          const next = [...prev];
          next[next.length - 1] = { ...last, text: last.text + delta };
          return next;
        }
        return [...prev, { who: "suspeito", responseId, text: delta }];
      });
    } else if (type === "response.output_audio_transcript.done") {
      const responseId = String(msg.response_id ?? "");
      const full = String(msg.transcript ?? "");
      if (!full) return;
      setTranscript((prev) => {
        let idx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].who === "suspeito" && prev[i].responseId === responseId) {
            idx = i;
            break;
          }
        }
        if (idx >= 0) {
          if (prev[idx].text === full) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], text: full };
          return next;
        }
        const last = prev[prev.length - 1];
        if (last && last.who === "suspeito" && last.text === full) return prev;
        return [...prev, { who: "suspeito", responseId, text: full }];
      });
    } else if (type === "conversation.item.input_audio_transcription.completed") {
      const full = String(msg.transcript ?? "");
      if (!full) return;
      setTranscript((prev) => [...prev, { who: "investigador", text: full }]);
    }
  }, []);

  const conectarWebRTC = useCallback(
    async (sess: { client_secret: string; model: string; nome: string }) => {
      setPhase("conectando");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // áudio que vem do modelo → toca no navegador
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // microfone → envia pro modelo (com cancelamento de eco)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        desligar();
        setMicNegado(true);
        setPhase("falha");
        setFailMsg("MICROFONE BLOQUEADO — AUTORIZE O ACESSO OU USE O ZAPTALK");
        return;
      }
      streamRef.current = stream;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // canal de dados (eventos do Realtime — transcrição ao vivo, best-effort)
      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = (ev) => {
        try {
          handleRealtimeEvent(JSON.parse(String(ev.data)) as Record<string, unknown>);
        } catch {
          // evento não-JSON — ignora
        }
      };

      // handshake SDP com a Realtime API usando o token efêmero
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const resp = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(sess.model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${sess.client_secret}`,
            "Content-Type": "application/sdp",
          },
        },
      );
      if (!resp.ok) {
        throw new Error(`handshake WebRTC falhou (${resp.status})`);
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await resp.text() });

      pc.onconnectionstatechange = () => {
        const state = pcRef.current?.connectionState;
        if (state === "failed" || state === "disconnected") {
          desligar();
          setPhase("falha");
          setFailMsg("A LIGAÇÃO CAIU — INSTABILIDADE NA LINHA");
        }
      };

      // conectado
      setNome(sess.nome);
      setPhase("em_chamada");
      setSegundos(0);
      timerRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    },
    [desligar, handleRealtimeEvent],
  );

  const ligar = useCallback(async () => {
    if (!numeroValido || emLigacao) return;
    setFailMsg("");
    setSemChave(false);
    setMicNegado(false);
    setTranscript([]);
    setPhase("chamando");

    const falharComoForaDeArea = () => {
      const registro = numeros.find((n) => onlyDigits(n.numero) === digits);
      const flavors =
        registro?.comportamento === "nao_atende" ? FLAVORS_NAO_ATENDE : FLAVORS_FORA_DE_SERVICO;
      const i = flavorIdxRef.current++ % flavors.length;
      setPhase("falha");
      setFailMsg(flavors[i]);
    };

    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: digits }),
      });

      if (res.status === 404) {
        falharComoForaDeArea();
        return;
      }
      if (res.status === 503) {
        setPhase("idle");
        setSemChave(true);
        return;
      }
      if (!res.ok) {
        setPhase("falha");
        setFailMsg("FALHA NA CENTRAL DE ESCUTA — TENTE NOVAMENTE");
        return;
      }

      const sess = (await res.json()) as { client_secret?: string; model?: string; nome?: string };
      if (!sess.client_secret || !sess.model) {
        setPhase("falha");
        setFailMsg("FALHA NA CENTRAL DE ESCUTA — TENTE NOVAMENTE");
        return;
      }
      await conectarWebRTC({
        client_secret: sess.client_secret,
        model: sess.model,
        nome: sess.nome ?? "INTERLOCUTOR DESCONHECIDO",
      });
    } catch {
      desligar();
      setPhase("falha");
      setFailMsg("FALHA NA CENTRAL DE ESCUTA — TENTE NOVAMENTE");
    }
  }, [digits, numeroValido, emLigacao, numeros, conectarWebRTC, desligar]);

  // ---------- zaptalk ----------

  // abre a conversa do número digitado, carregando o histórico persistido
  const iniciarConversa = useCallback(() => {
    if (!ztNumeroValido) return;
    setChat(loadChat(casoId, ztDigits));
    setZtNome("");
    setZtErro("");
    setChatInput("");
    setZtAtivo(true);
  }, [ztDigits, ztNumeroValido, casoId]);

  const enviarTexto = useCallback(async () => {
    const content = chatInput.trim();
    if (!content || chatEnviando || !ztNumeroValido) return;
    const next: ChatMsg[] = [
      ...chat,
      { role: "user", content, ts: new Date().toISOString() },
    ];
    setChat(next);
    saveChat(casoId, ztDigits, next);
    setChatInput("");
    setZtErro("");
    setChatEnviando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: ztDigits, history: next }),
      });
      if (res.status === 503) {
        setZtErro("indisponivel");
        return;
      }
      if (res.status === 404) {
        // desfaz a mensagem otimista — na ficção, ela nunca saiu
        setChat(chat);
        saveChat(casoId, ztDigits, chat);
        setZtErro("sem_zaptalk");
        return;
      }
      if (!res.ok) {
        setZtErro("falha");
        return;
      }
      const dataRes = (await res.json()) as { reply?: string; nome?: string };
      const withReply: ChatMsg[] = [
        ...next,
        { role: "assistant", content: dataRes.reply ?? "", ts: new Date().toISOString() },
      ];
      setChat(withReply);
      saveChat(casoId, ztDigits, withReply);
      if (dataRes.nome) setZtNome(dataRes.nome);
    } catch {
      setZtErro("falha");
    } finally {
      setChatEnviando(false);
    }
  }, [chat, chatInput, chatEnviando, ztNumeroValido, casoId, ztDigits]);

  const limparConversa = useCallback(() => {
    clearChat(casoId, ztDigits);
    setChat([]);
    setZtErro("");
    setZtNome("");
  }, [casoId, ztDigits]);

  const trocarNumero = useCallback(() => {
    setZtAtivo(false);
    setZtErro("");
    setChatInput("");
  }, []);

  // auto-scroll da transcrição e do chat
  useEffect(() => {
    transcriptScrollRef.current?.scrollTo({ top: transcriptScrollRef.current.scrollHeight });
  }, [transcript]);
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [chat, chatEnviando, ztAtivo]);

  // ---------- render ----------

  const statusLabel =
    phase === "chamando"
      ? "CHAMANDO…"
      : phase === "conectando"
        ? "ESTABELECENDO LINHA SEGURA…"
        : phase === "em_chamada"
          ? fmtSegundos(segundos)
          : phase === "falha"
            ? failMsg
            : "PRONTO PARA DISCAR";

  const ztContato = ztNome || "Desconhecido";

  return (
    <Panel title="INTERROGATÓRIO — LINHA SEGURA">
      <div className="itg-root">
        <div className="itg-modes" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "ligacao"}
            className={`itg-mode ${tab === "ligacao" ? "active" : ""}`}
            onClick={() => setTab("ligacao")}
          >
            LIGAÇÃO
            {emLigacao && tab !== "ligacao" && (
              <span className="itg-tab-badge">● EM CHAMADA</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "zaptalk"}
            className={`itg-mode ${tab === "zaptalk" ? "active" : ""}`}
            onClick={() => setTab("zaptalk")}
          >
            ZAPTALK (MENSAGEM)
          </button>
        </div>

        {tab === "ligacao" ? (
          <>
            {semChave && (
              <div className="itg-aviso">
                <strong>SISTEMA DE ESCUTA INDISPONÍVEL</strong>
                <span>
                  A central de áudio está fora do ar. Você pode tentar{" "}
                  <button type="button" className="itg-aviso-link" onClick={() => setTab("zaptalk")}>
                    conversar via ZapTalk
                  </button>
                  .
                </span>
              </div>
            )}

            <div className="itg-grid">
              {/* ---------- discador ---------- */}
              <div className="itg-dialer">
                <label className="sip-field-label" htmlFor="itg-numero">
                  Número autorizado
                </label>
                <input
                  id="itg-numero"
                  className="itg-display"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="(00) 00000-0000"
                  value={maskPhone(digits)}
                  onChange={(e) => setDigits(onlyDigits(e.target.value))}
                  disabled={emLigacao}
                />

                <div className="itg-keypad">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="itg-key"
                      disabled={emLigacao}
                      onClick={() => setDigits((d) => onlyDigits(d + k))}
                    >
                      {k}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="itg-key itg-key-fn"
                    disabled={emLigacao}
                    onClick={() => setDigits((d) => d.slice(0, -1))}
                    aria-label="Apagar último dígito"
                  >
                    ⌫
                  </button>
                  <button
                    type="button"
                    className="itg-key"
                    disabled={emLigacao}
                    onClick={() => setDigits((d) => onlyDigits(d + "0"))}
                  >
                    0
                  </button>
                  <button
                    type="button"
                    className="itg-key itg-key-fn"
                    disabled={emLigacao}
                    onClick={() => setDigits("")}
                    aria-label="Limpar número"
                  >
                    C
                  </button>
                </div>

                <div className={`itg-status ${phase === "falha" ? "falha" : ""} ${phase === "em_chamada" ? "vivo" : ""}`}>
                  {statusLabel}
                </div>

                {phase === "em_chamada" ? (
                  <button type="button" className="itg-desligar" onClick={desligar}>
                    DESLIGAR
                  </button>
                ) : (
                  <button
                    type="button"
                    className="itg-ligar"
                    disabled={!numeroValido || emLigacao}
                    onClick={ligar}
                  >
                    {phase === "chamando" || phase === "conectando" ? "LIGANDO…" : "LIGAR"}
                  </button>
                )}

                {micNegado && (
                  <p className="itg-mic-aviso">
                    Sem acesso ao microfone não há escuta por voz.{" "}
                    <button type="button" className="itg-aviso-link" onClick={() => setTab("zaptalk")}>
                      Conversar via ZapTalk
                    </button>
                  </p>
                )}

                <p className="itg-dica">
                  {numeros.length} número(s) autorizado(s) para escuta neste caso. Fale como um
                  detetive — pode interromper a fala do interrogado a qualquer momento.
                </p>
              </div>

              {/* ---------- chamada ---------- */}
              <div className="itg-chamada">
                {phase === "em_chamada" ? (
                  <>
                    <div className="itg-em-chamada-head">
                      <span className="itg-ao-vivo">● AO VIVO</span>
                      <span className="itg-nome">{nome.toUpperCase()}</span>
                      <span className="itg-cron">{fmtSegundos(segundos)}</span>
                    </div>
                    <div className="itg-ondas" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </>
                ) : (
                  <div className="itg-chamada-vazia">
                    {phase === "chamando" || phase === "conectando"
                      ? "Aguarde o estabelecimento da linha segura…"
                      : "Disque um número autorizado e inicie a escuta."}
                  </div>
                )}

                {transcript.length > 0 && (
                  <div className="itg-transcript" ref={transcriptScrollRef}>
                    <div className="itg-transcript-head">TRANSCRIÇÃO (MELHOR ESFORÇO)</div>
                    {transcript.map((l, i) => (
                      <p key={i} className={`itg-transcript-line ${l.who}`}>
                        <span className="itg-transcript-quem">
                          {l.who === "suspeito" ? nome || "INTERLOCUTOR" : "INVESTIGADOR"}
                        </span>
                        {l.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="zt-wrap">
            {!ztAtivo ? (
              /* ---------- entrada: número com ZapTalk ---------- */
              <div className="itg-dialer zt-form">
                <label className="sip-field-label" htmlFor="zt-numero">
                  Número com ZapTalk
                </label>
                <input
                  id="zt-numero"
                  className="itg-display"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="(00) 00000-0000"
                  value={maskPhone(ztDigits)}
                  onChange={(e) => setZtDigits(onlyDigits(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") iniciarConversa();
                  }}
                />
                <button
                  type="button"
                  className="itg-ligar"
                  disabled={!ztNumeroValido}
                  onClick={iniciarConversa}
                >
                  INICIAR CONVERSA
                </button>
                <p className="itg-dica">
                  Entrevista por texto interceptada via ZapTalk. O histórico de cada número fica
                  registrado neste terminal.
                </p>
              </div>
            ) : (
              /* ---------- conversa com cara de ZapTalk ---------- */
              <>
                <div className="zt-phone">
                  <div className="zt-header">
                    <div
                      className="zt-avatar"
                      style={{ background: ztNome ? colorFor(ztNome) : "#8e8e93" }}
                      aria-hidden="true"
                    >
                      {ztNome ? initialsOf(ztNome) : "?"}
                    </div>
                    <div className="zt-header-texts">
                      <div className="zt-header-nome">{ztContato}</div>
                      <div className={`zt-header-status ${chatEnviando ? "digitando" : ""}`}>
                        {chatEnviando ? "digitando…" : "online"}
                      </div>
                    </div>
                  </div>

                  <div className="zt-msgs" ref={chatScrollRef}>
                    {ztErro === "sem_zaptalk" ? (
                      <div className="zt-vazio">
                        <strong>NÚMERO SEM ZAPTALK ATIVO</strong>
                        <span>
                          Este número não possui conta no ZapTalk ou está fora de serviço.
                        </span>
                      </div>
                    ) : (
                      <>
                        {chat.length === 0 && !chatEnviando && (
                          <div className="zt-vazio">
                            <span>Nenhuma mensagem por aqui. Puxe conversa.</span>
                          </div>
                        )}
                        {chat.map((m, i) => {
                          const mine = m.role === "user";
                          const hora = fmtHora(m.ts);
                          return (
                            <div key={i} className={`zt-bubble-row${mine ? " mine" : ""}`}>
                              <div className={`zt-bubble${mine ? " mine" : ""}`}>
                                <div className="zt-bubble-text">{m.content}</div>
                                <div className="zt-bubble-meta">
                                  {hora && <span>{hora}</span>}
                                  {mine && <span className="zt-ticks">✓✓</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {chatEnviando && (
                          <div className="zt-bubble-row">
                            <div className="zt-bubble zt-typing" aria-label="Digitando">
                              <span />
                              <span />
                              <span />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="zt-inputbar">
                    <input
                      className="zt-input"
                      placeholder="Mensagem"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") enviarTexto();
                      }}
                    />
                    <button
                      type="button"
                      className="zt-send"
                      disabled={!chatInput.trim() || chatEnviando}
                      onClick={enviarTexto}
                      aria-label="Enviar mensagem"
                    >
                      ↑
                    </button>
                  </div>
                </div>

                {ztErro === "indisponivel" && (
                  <div className="itg-aviso zt-aviso">
                    <strong>SISTEMA INDISPONÍVEL</strong>
                    <span>A central de mensagens está fora do ar. Tente novamente mais tarde.</span>
                  </div>
                )}
                {ztErro === "falha" && (
                  <p className="itg-chat-erro">Falha de comunicação com a central. Tente novamente.</p>
                )}

                <div className="zt-actions">
                  <button type="button" className="itg-limpar" onClick={trocarNumero}>
                    TROCAR NÚMERO
                  </button>
                  <button
                    type="button"
                    className="itg-limpar"
                    disabled={chat.length === 0}
                    onClick={limparConversa}
                  >
                    LIMPAR CONVERSA
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
