// Fase 1: stub do servidor de voz/chat. Os endpoints reais
// (POST /api/session com OpenAI Realtime e POST /api/chat como
// fallback de texto) chegam na fase do módulo de interrogatório.
import express from "express";

const app = express();
app.use(express.json());

const notImplemented = (_req, res) =>
  res.status(501).json({ error: "Sistema de escuta em implantação." });

app.post("/api/session", notImplemented);
app.post("/api/chat", notImplemented);

const port = process.env.PORT || 3355;
app.listen(port, () => {
  console.log(`[sip] servidor de escuta na porta ${port} (stub — fase 1)`);
});
