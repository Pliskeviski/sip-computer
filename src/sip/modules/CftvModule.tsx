// Central de Câmeras (CFTV) — lista de gravações + player pericial:
// velocidades 1x–8x, avanço quadro a quadro (1/30s), linha do tempo com
// miniaturas extraídas do próprio vídeo e HUD de "carimbo queimado".
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { CftvFile, GravacaoCftv, ModuleEntry } from "../../engine/types";
import { assetUrl } from "../../engine/loadContent";
import type { ModuleApi } from "../registry";
import { Panel } from "../components/Panel";
import "../styles/cftv.css";

const THUMB_COUNT = 40;
const THUMB_W = 160;
const FRAME = 1 / 30;
const SPEEDS = [1, 2, 4, 8];

/** "M:SS" ou "H:MM:SS". */
function fmtTempo(seg: number): string {
  if (!Number.isFinite(seg) || seg < 0) seg = 0;
  const s = Math.floor(seg);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

const hudFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Relógio do HUD: inicioTs + tempo decorrido do vídeo. */
function hudClock(inicioTs: string, elapsed: number): string {
  const base = Date.parse(inicioTs);
  if (Number.isNaN(base)) return "--/--/---- --:--:--";
  return hudFmt.format(new Date(base + elapsed * 1000));
}

export function CftvModule({ module, api }: { module: ModuleEntry; api: ModuleApi }) {
  const data = api.content.data[module.dataRef] as CftvFile | undefined;
  const gravacoes = data?.gravacoes ?? [];

  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const sel: GravacaoCftv | undefined =
    gravacoes.find((g) => g.id === selecionadaId) ?? gravacoes[0];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);

  const [reproduzindo, setReproduzindo] = useState(false);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [duracaoMidia, setDuracaoMidia] = useState<number | null>(null);
  const [velocidade, setVelocidade] = useState(1);
  const [erroMidia, setErroMidia] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [hover, setHover] = useState<{ x: number; frac: number } | null>(null);

  const duracao = duracaoMidia ?? sel?.duracaoSeg ?? 0;

  function selecionar(g: GravacaoCftv) {
    setSelecionadaId(g.id);
    setReproduzindo(false);
    setTempoAtual(0);
    setDuracaoMidia(null);
    setErroMidia(false);
    setHover(null);
  }

  // Aplica a velocidade ao elemento de vídeo.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = velocidade;
  }, [velocidade, sel?.id]);

  // Geração preguiçosa de miniaturas: vídeo oculto busca N pontos
  // uniformes e desenha cada quadro num canvas → dataURL em cache.
  useEffect(() => {
    setThumbs([]);
    if (!sel || erroMidia) return;

    let cancelado = false;
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.muted = true;
    vid.src = assetUrl(sel.arquivo);

    const onMeta = () => {
      if (cancelado) return;
      const dur = vid.duration;
      if (!Number.isFinite(dur) || dur <= 0 || vid.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_W;
      canvas.height = Math.max(1, Math.round((THUMB_W * vid.videoHeight) / vid.videoWidth));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let i = 0;
      const proximo = () => {
        if (cancelado || i >= THUMB_COUNT) return;
        vid.currentTime = Math.min((i * dur) / (THUMB_COUNT - 1), Math.max(0, dur - 0.05));
      };
      vid.addEventListener("seeked", () => {
        if (cancelado) return;
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL("image/jpeg", 0.6);
        const idx = i;
        setThumbs((prev) => {
          const next = [...prev];
          next[idx] = url;
          return next;
        });
        i += 1;
        proximo();
      });
      proximo();
    };

    vid.addEventListener("loadedmetadata", onMeta);
    // Erro aqui é silencioso: o player principal já exibe o aviso.
    return () => {
      cancelado = true;
      vid.removeEventListener("loadedmetadata", onMeta);
      vid.removeAttribute("src");
      vid.load();
    };
  }, [sel?.id, sel?.arquivo, erroMidia]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarReproducao() {
    const v = videoRef.current;
    if (!v || erroMidia) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }

  function passoQuadro(dir: 1 | -1) {
    const v = videoRef.current;
    if (!v || erroMidia) return;
    v.pause();
    const limite = Number.isFinite(v.duration) ? v.duration : duracao;
    v.currentTime = Math.min(Math.max(0, v.currentTime + dir * FRAME), limite);
  }

  function ciclarVelocidade(dir: 1 | -1) {
    const idx = SPEEDS.indexOf(velocidade);
    const prox = Math.min(Math.max(0, idx + dir), SPEEDS.length - 1);
    setVelocidade(SPEEDS[prox]);
  }

  function buscar(t: number) {
    const v = videoRef.current;
    setTempoAtual(t);
    if (v) v.currentTime = t;
  }

  function onScrubberMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrubberRef.current;
    if (!el || duracao <= 0) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const x = Math.min(Math.max(frac * rect.width, 82), rect.width - 82);
    setHover({ x, frac });
  }

  function onTeclas(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case " ":
        e.preventDefault();
        alternarReproducao();
        break;
      case "ArrowLeft":
        e.preventDefault();
        passoQuadro(-1);
        break;
      case "ArrowRight":
        e.preventDefault();
        passoQuadro(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        ciclarVelocidade(1);
        break;
      case "ArrowDown":
        e.preventDefault();
        ciclarVelocidade(-1);
        break;
      case "1":
      case "2":
      case "4":
      case "8":
        setVelocidade(Number(e.key));
        break;
    }
  }

  const hoverTempo = hover ? hover.frac * duracao : 0;
  const hoverThumb = hover ? thumbs[Math.round(hover.frac * (THUMB_COUNT - 1))] : undefined;

  return (
    <Panel title={module.label}>
      {gravacoes.length === 0 ? (
        <p className="cftv-vazio">NENHUMA GRAVAÇÃO INDEXADA NESTE CASO</p>
      ) : (
        <div className="cftv-layout">
          <aside className="cftv-list" aria-label="Gravações disponíveis">
            <div className="cftv-list-head">
              {gravacoes.length} gravação(ões) — arquivos brutos, sem marcações
            </div>
            {gravacoes.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`cftv-item${sel?.id === g.id ? " active" : ""}`}
                onClick={() => selecionar(g)}
              >
                <span className="cftv-item-fonte">{g.fonte}</span>
                <span className="cftv-item-endereco">{g.endereco}</span>
                <span className="cftv-item-meta">
                  <span>{g.intervaloLabel}</span>
                  <span>{fmtTempo(g.duracaoSeg)}</span>
                </span>
              </button>
            ))}
          </aside>

          {sel && (
            <div
              className="cftv-player"
              tabIndex={0}
              onKeyDown={onTeclas}
              aria-label={`Player de vídeo — ${sel.fonte}`}
            >
              <div className="cftv-screen">
                <video
                  key={sel.id}
                  ref={videoRef}
                  className="cftv-video"
                  src={assetUrl(sel.arquivo)}
                  preload="metadata"
                  onPlay={() => setReproduzindo(true)}
                  onPause={() => setReproduzindo(false)}
                  onTimeUpdate={(e) => setTempoAtual(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    setDuracaoMidia(Number.isFinite(d) ? d : null);
                    e.currentTarget.playbackRate = velocidade;
                  }}
                  onEnded={() => setReproduzindo(false)}
                  onError={() => setErroMidia(true)}
                />
                {!erroMidia && (
                  <div className="cftv-hud">
                    <div className="cftv-hud-top">
                      <span className="cftv-hud-rec">
                        <span className="cftv-hud-rec-dot">●</span> REC
                      </span>
                      <span className="cftv-hud-fonte">{sel.fonte}</span>
                    </div>
                    <div className="cftv-hud-clock">{hudClock(sel.inicioTs, tempoAtual)}</div>
                  </div>
                )}
                {erroMidia && (
                  <div className="cftv-sinal-erro">
                    <span className="cftv-sinal-erro-titulo">SINAL INDISPONÍVEL</span>
                    <span className="cftv-sinal-erro-detalhe">
                      ARQUIVO CORROMPIDO OU NÃO LOCALIZADO NO SERVIDOR DE EVIDÊNCIAS
                    </span>
                  </div>
                )}
              </div>

              <div className="cftv-controls">
                <button
                  type="button"
                  className="cftv-btn cftv-btn-play"
                  onClick={alternarReproducao}
                  disabled={erroMidia}
                  title="Reproduzir / pausar (espaço)"
                >
                  {reproduzindo ? "❚❚" : "▶"}
                </button>
                <button
                  type="button"
                  className="cftv-btn"
                  onClick={() => passoQuadro(-1)}
                  disabled={erroMidia}
                  title="Quadro anterior (←)"
                >
                  ◀❚
                </button>
                <button
                  type="button"
                  className="cftv-btn"
                  onClick={() => passoQuadro(1)}
                  disabled={erroMidia}
                  title="Próximo quadro (→)"
                >
                  ❚▶
                </button>
                <div className="cftv-speeds" role="group" aria-label="Velocidade">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`cftv-btn cftv-btn-speed${velocidade === s ? " active" : ""}`}
                      onClick={() => setVelocidade(s)}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                <span className="cftv-tempo">
                  {fmtTempo(tempoAtual)} / {fmtTempo(duracao)}
                </span>
              </div>

              <div
                ref={scrubberRef}
                className="cftv-scrubber"
                onPointerMove={onScrubberMove}
                onPointerLeave={() => setHover(null)}
              >
                <input
                  type="range"
                  className="cftv-range"
                  min={0}
                  max={duracao}
                  step={FRAME}
                  value={Math.min(tempoAtual, duracao)}
                  disabled={erroMidia || duracao <= 0}
                  onChange={(e) => buscar(Number(e.target.value))}
                  aria-label="Linha do tempo da gravação"
                />
                {hover && !erroMidia && (
                  <div className="cftv-tooltip" style={{ left: hover.x }}>
                    {hoverThumb && (
                      <img className="cftv-tooltip-img" src={hoverThumb} alt="" />
                    )}
                    <span className="cftv-tooltip-tempo">{fmtTempo(hoverTempo)}</span>
                  </div>
                )}
              </div>

              {!erroMidia && thumbs.length < THUMB_COUNT && (
                <div className="cftv-thumbs-status">
                  INDEXANDO QUADROS PARA PRÉ-VISUALIZAÇÃO… {thumbs.length}/{THUMB_COUNT}
                </div>
              )}

              <p className="cftv-atalhos">
                Atalhos: <kbd>espaço</kbd> reproduz/pausa · <kbd>←</kbd>
                <kbd>→</kbd> quadro a quadro · <kbd>↑</kbd>
                <kbd>↓</kbd> ou <kbd>1</kbd>/<kbd>2</kbd>/<kbd>4</kbd>/<kbd>8</kbd> velocidade
              </p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
