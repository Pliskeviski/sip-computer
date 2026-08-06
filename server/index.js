// ─────────────────────────────────────────────────────────────────────────────
// SIP — Servidor de escuta (interrogatório por voz + chat)
// Portado de arquivo-morto-voz/server.js: monta o system prompt do personagem a
// partir da ficha secreta (server/fichas/<fichaId>.json) e gera um token efêmero
// da OpenAI Realtime; o navegador conecta direto via WebRTC. Inclui POST /api/chat
// como fallback de texto (chat/completions).
//
// SEGURANÇA: a OPENAI_API_KEY fica SÓ aqui no servidor (lida do .env / ambiente),
// nunca vai para o navegador.
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR =
  process.env.SIP_CONTENT_DIR ||
  path.join(__dirname, "..", "public", "content", "default");
const FICHAS_DIR = path.join(__dirname, "fichas");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-realtime-mini";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const PORT = process.env.PORT || 3355;

const app = express();
app.use(express.json());

// ── Monta o system prompt do personagem a partir da ficha ────────────────────
function montarInstrucoes(ficha) {
  const p = ficha.personagem;
  const e = ficha.perfil_emocional;
  const g = ficha.guardrails;
  const m = ficha.meta || {};

  // Identificação do caso/vítima vem da própria ficha, com fallbacks genéricos.
  const vitima = m.vitima || "a vítima do caso em investigação";
  const casoRotulo =
    m.caso_id && m.caso_nome
      ? `${m.caso_id} — ${m.caso_nome}`
      : m.caso_nome || m.caso_id || "";

  const gatilhos = e.gatilhos
    .map((t) => `- Se o assunto for "${t.topico}": ${t.reacao}`)
    .join("\n");
  const admite = ficha.o_que_admite_de_bom_grado.map((x) => `- ${x}`).join("\n");
  const segredos = ficha.segredos
    .map(
      (s) =>
        `- [${s.id}] ${s.segredo}\n    → Só admite se: ${s.so_admite_se}\n    → Como admite: ${s.como_admite}`
    )
    .join("\n");
  const furos = ficha.alibi_oficial.furos.map((f) => `  - ${f}`).join("\n");

  return `
Você é ${p.nome}, ${p.idade} anos, ${p.ocupacao}.
Você está atendendo uma ligação de um detetive que investiga a morte de ${vitima}${casoRotulo ? ` (caso ${casoRotulo})` : ""}.
Você NÃO é uma IA. Você é uma pessoa dentro desta história e nunca sai desse papel.

# QUEM VOCÊ É
${p.relacao_com_vitima}
Personalidade: ${p.personalidade}
Como você fala: ${p.estilo_de_fala}

# SEU ESTADO EMOCIONAL
Linha de base: ${e.linha_de_base}
Reaja emocionalmente pela FORMA de falar (hesitação, tom, pausas), nunca descrevendo suas emoções.
Gatilhos que te desestabilizam:
${gatilhos}
Quando encurralado: ${e.quando_encurralado}

# O QUE VOCÊ ADMITE SEM PROBLEMA
${admite}

# SEUS SEGREDOS (não entregue de graça — respeite as condições)
${segredos}

# SEU ÁLIBI OFICIAL
"${ficha.alibi_oficial.declaracao}"
Furos (aparecem se pressionado, mas você tenta encobrir):
${furos}

# REGRAS INVIOLÁVEIS (GUARDRAILS)
1. ${g.canon_lock}
2. ${g.confissao_lock}
3. ${g.anti_jailbreak}
4. ${g.escopo_lock}
5. ${g.sem_narracao}

# RITMO E ENTREGA DA VOZ
Fale SEMPRE em português do Brasil e soe como uma PESSOA REAL numa ligação, não como um
narrador. Use cadência natural de conversa: pequenas hesitações ("olha...", "então...",
"deixa eu ver"), respiração, cortes e mudanças de tom conforme a emoção do momento — mas
NUNCA nomeie ou descreva a emoção, apenas transmita pela voz. Respostas curtas, de uma a
três frases — é uma ligação, não um monólogo. Deixe o detetive conduzir e te interromper.
${ficha.controle_de_ligacao.comportamento_no_limite}
`.trim();
}

// ── Resolução de número → ficha ──────────────────────────────────────────────
const apenasDigitos = (v) => String(v ?? "").replace(/\D/g, "");

async function carregarNumeros() {
  const raw = await fs.readFile(path.join(CONTENT_DIR, "numeros.json"), "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data?.numeros) ? data.numeros : [];
}

/**
 * Resolve o número discado para a ficha do personagem.
 * Retorna null quando o número é desconhecido, não atende ou não tem ficha.
 */
async function resolverFicha(numeroDiscado) {
  const digitos = apenasDigitos(numeroDiscado);
  if (!digitos) return null;
  const numeros = await carregarNumeros();
  const registro = numeros.find((n) => apenasDigitos(n.numero) === digitos);
  if (!registro || registro.comportamento === "nao_atende" || !registro.fichaId) {
    return null;
  }
  // fichaId vem de conteúdo do projeto, mas sanitizamos mesmo assim.
  if (!/^[\w-]+$/.test(registro.fichaId)) return null;
  try {
    const raw = await fs.readFile(
      path.join(FICHAS_DIR, `${registro.fichaId}.json`),
      "utf8"
    );
    return JSON.parse(raw);
  } catch {
    console.warn(`[sip] ficha não encontrada para fichaId="${registro.fichaId}"`);
    return null;
  }
}

const SEM_CHAVE = {
  error: "sem_chave",
  message: "Sistema de escuta indisponível — chave não configurada.",
};
const FORA_DE_AREA = { error: "fora_de_area" };

function logCall(rota, numero, inicio, extra = "") {
  const ms = Date.now() - inicio;
  console.log(
    `[sip] ${rota} numero=${apenasDigitos(numero) || "(vazio)"} ${ms}ms${extra ? " " + extra : ""}`
  );
}

// ── POST /api/session — token efêmero para WebRTC (voz) ──────────────────────
app.post("/api/session", async (req, res) => {
  const inicio = Date.now();
  const numero = req.body?.numero;
  try {
    const ficha = await resolverFicha(numero);
    if (!ficha) {
      logCall("/api/session", numero, inicio, "→ 404 fora_de_area");
      return res.status(404).json(FORA_DE_AREA);
    }
    if (!OPENAI_API_KEY) {
      logCall("/api/session", numero, inicio, "→ 503 sem_chave");
      return res.status(503).json(SEM_CHAVE);
    }

    const instructions = montarInstrucoes(ficha);
    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: MODEL,
          instructions,
          audio: { output: { voice: ficha.voz?.voz_openai || "ash" } },
        },
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("[sip] erro OpenAI ao criar sessão:", JSON.stringify(data));
      logCall("/api/session", numero, inicio, `→ ${r.status} openai`);
      return res.status(r.status).json({
        error: "openai",
        message: data?.error?.message || "Falha ao abrir sessão de voz.",
      });
    }
    logCall("/api/session", numero, inicio, `→ 200 (${ficha.personagem.nome})`);
    res.json({
      client_secret: data.value || data.client_secret?.value,
      model: MODEL,
      nome: ficha.personagem.nome,
    });
  } catch (err) {
    console.error("[sip] erro no /api/session:", err);
    logCall("/api/session", numero, inicio, "→ 500");
    res.status(500).json({
      error: "falha_interna",
      message: "Falha no sistema de escuta. Tente novamente.",
    });
  }
});

// ── POST /api/chat — entrevista por texto (fallback) ─────────────────────────
app.post("/api/chat", async (req, res) => {
  const inicio = Date.now();
  const numero = req.body?.numero;
  try {
    const ficha = await resolverFicha(numero);
    if (!ficha) {
      logCall("/api/chat", numero, inicio, "→ 404 fora_de_area");
      return res.status(404).json(FORA_DE_AREA);
    }
    if (!OPENAI_API_KEY) {
      logCall("/api/chat", numero, inicio, "→ 503 sem_chave");
      return res.status(503).json(SEM_CHAVE);
    }

    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const mensagens = history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content }));

    const instructions =
      montarInstrucoes(ficha) +
      "\nResponda sempre em texto, como em uma entrevista por mensagem.";

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "system", content: instructions }, ...mensagens],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("[sip] erro OpenAI no chat:", JSON.stringify(data));
      logCall("/api/chat", numero, inicio, `→ ${r.status} openai`);
      return res.status(r.status).json({
        error: "openai",
        message: data?.error?.message || "Falha ao enviar mensagem.",
      });
    }
    const reply = data.choices?.[0]?.message?.content ?? "";
    logCall("/api/chat", numero, inicio, `→ 200 (${ficha.personagem.nome})`);
    res.json({ reply, nome: ficha.personagem.nome });
  } catch (err) {
    console.error("[sip] erro no /api/chat:", err);
    logCall("/api/chat", numero, inicio, "→ 500");
    res.status(500).json({
      error: "falha_interna",
      message: "Falha no sistema de escuta. Tente novamente.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`[sip] servidor de escuta em http://localhost:${PORT}`);
  console.log(`[sip] voz: ${MODEL} · chat: ${CHAT_MODEL} · conteúdo: ${CONTENT_DIR}`);
  console.log(
    OPENAI_API_KEY
      ? "[sip] OPENAI_API_KEY carregada."
      : "[sip] OPENAI_API_KEY não definida — escuta indisponível (503)."
  );
});
