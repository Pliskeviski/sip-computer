// Interrogatório — linha segura: discagem estilo CSI, chamada de voz via
// OpenAI Realtime (WebRTC, portado de arquivo-morto-voz/public/index.html) e
// entrevista por texto como fallback (POST /api/chat).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ModuleEntry, NumerosFile } from "../../engine/types";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";
import "../styles/interrogatorio.css";

type ChatMsg = { role: "user" | "assistant"; content: string };
type TranscriptLine = { who: "suspeito" | "investigador"; text: string };
type CallPhase = "idle" | "chamando" | "conectando" | "em_chamada" | "falha";
type Mode = "voz" | "texto";

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
    return parsed.filter(
      (m): m is ChatMsg =>
        !!m &&
        typeof m === "object" &&
        ((m as ChatMsg).role === "user" || (m as ChatMsg).role === "assistant") &&
        typeof (m as ChatMsg).content === "string",
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

  const [digits, setDigits] = useState("");
  const [mode, setMode] = useState<Mode>("voz");

  // voz
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [failMsg, setFailMsg] = useState("");
  const [nome, setNome] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [semChave, setSemChave] = useState(false);
  const [micNegado, setMicNegado] = useState(false);

  // texto
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatEnviando, setChatEnviando] = useState(false);
  const [chatErro, setChatErro] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flavorIdxRef = useRef(0);
  // id da resposta do modelo cuja transcrição está em andamento
  const pendingResponseRef = useRef<string | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const numeroValido = digits.length >= 10;
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
    pendingResponseRef.current = null;
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
        if (pendingResponseRef.current === responseId && prev.length > 0) {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, text: last.text + delta };
          return next;
        }
        pendingResponseRef.current = responseId;
        return [...prev, { who: "suspeito", text: delta }];
      });
    } else if (type === "response.output_audio_transcript.done") {
      const full = String(msg.transcript ?? "");
      if (!full) return;
      setTranscript((prev) => {
        if (pendingResponseRef.current != null && prev.length > 0) {
          const next = [...prev];
          next[next.length - 1] = { who: "suspeito", text: full };
          return next;
        }
        return [...prev, { who: "suspeito", text: full }];
      });
      pendingResponseRef.current = null;
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
        setFailMsg("MICROFONE BLOQUEADO — AUTORIZE O ACESSO OU USE O MODO TEXTO");
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

  // ---------- modo texto ----------

  // carrega o histórico persistido do número discado ao entrar no modo texto
  useEffect(() => {
    if (mode !== "texto") return;
    setChat(digits ? loadChat(casoId, digits) : []);
    setChatErro("");
  }, [mode, digits, casoId]);

  const enviarTexto = useCallback(async () => {
    const content = chatInput.trim();
    if (!content || chatEnviando || !numeroValido) return;
    const next: ChatMsg[] = [...chat, { role: "user", content }];
    setChat(next);
    saveChat(casoId, digits, next);
    setChatInput("");
    setChatErro("");
    setChatEnviando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: digits, history: next }),
      });
      if (res.status === 503) {
        setChatErro("SISTEMA DE ESCUTA INDISPONÍVEL — chave não configurada.");
        return;
      }
      if (res.status === 404) {
        setChatErro("Este número não consta no cadastro de escutas autorizadas.");
        return;
      }
      if (!res.ok) {
        setChatErro("Falha de comunicação com a central. Tente novamente.");
        return;
      }
      const dataRes = (await res.json()) as { reply?: string; nome?: string };
      const withReply: ChatMsg[] = [
        ...next,
        { role: "assistant", content: dataRes.reply ?? "" },
      ];
      setChat(withReply);
      saveChat(casoId, digits, withReply);
      if (dataRes.nome) setNome(dataRes.nome);
    } catch {
      setChatErro("Falha de comunicação com a central. Tente novamente.");
    } finally {
      setChatEnviando(false);
    }
  }, [chat, chatInput, chatEnviando, numeroValido, casoId, digits]);

  const limparConversa = useCallback(() => {
    clearChat(casoId, digits);
    setChat([]);
    setChatErro("");
  }, [casoId, digits]);

  // auto-scroll da transcrição e do chat
  useEffect(() => {
    transcriptScrollRef.current?.scrollTo({ top: transcriptScrollRef.current.scrollHeight });
  }, [transcript]);
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [chat, chatEnviando]);

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

  return (
    <Panel title="INTERROGATÓRIO — LINHA SEGURA">
      <div className="itg-root">
        <div className="itg-modes" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "voz"}
            className={`itg-mode ${mode === "voz" ? "active" : ""}`}
            onClick={() => setMode("voz")}
          >
            LIGAÇÃO DE VOZ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "texto"}
            className={`itg-mode ${mode === "texto" ? "active" : ""}`}
            onClick={() => setMode("texto")}
          >
            ENTREVISTAR POR TEXTO
          </button>
        </div>

        {semChave && (
          <div className="itg-aviso">
            <strong>SISTEMA DE ESCUTA INDISPONÍVEL</strong>
            <span>
              A central de áudio está fora do ar. Você pode tentar{" "}
              <button type="button" className="itg-aviso-link" onClick={() => setMode("texto")}>
                entrevistar por texto
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
                <button type="button" className="itg-aviso-link" onClick={() => setMode("texto")}>
                  Usar modo texto
                </button>
              </p>
            )}

            <p className="itg-dica">
              {numeros.length} número(s) autorizado(s) para escuta neste caso. Fale como um
              detetive — pode interromper a fala do interrogado a qualquer momento.
            </p>
          </div>

          {/* ---------- lado direito: chamada ou chat ---------- */}
          {mode === "voz" ? (
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
          ) : (
            <div className="itg-chat-wrap">
              <div className="itg-chat" ref={chatScrollRef}>
                {chat.length === 0 && !chatEnviando && (
                  <p className="itg-chat-vazio">
                    {numeroValido
                      ? "Nenhuma mensagem registrada para este número. Inicie a entrevista."
                      : "Disque um número autorizado para iniciar a entrevista por texto."}
                  </p>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={`itg-msg ${m.role === "user" ? "investigador" : "suspeito"}`}>
                    <span className="itg-msg-quem">
                      {m.role === "user" ? "INVESTIGADOR" : (nome || "INTERLOCUTOR").toUpperCase()}
                    </span>
                    {m.content}
                  </div>
                ))}
                {chatEnviando && (
                  <div className="itg-msg suspeito itg-typing" aria-label="Digitando">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>

              {chatErro && <p className="itg-chat-erro">{chatErro}</p>}

              <div className="itg-chat-form">
                <input
                  className="itg-chat-input"
                  placeholder="Digite a pergunta do investigador…"
                  value={chatInput}
                  disabled={!numeroValido}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") enviarTexto();
                  }}
                />
                <button
                  type="button"
                  className="itg-enviar"
                  disabled={!numeroValido || !chatInput.trim() || chatEnviando}
                  onClick={enviarTexto}
                >
                  ENVIAR
                </button>
                <button
                  type="button"
                  className="itg-limpar"
                  disabled={chat.length === 0}
                  onClick={limparConversa}
                >
                  LIMPAR
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
