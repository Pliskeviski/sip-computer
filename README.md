# Arquivo Morto — SIP (Sistema Integrado de Perícia)

SPA (Vite + React + TypeScript) que simula o computador da polícia para o jogo de
investigação — o **terceiro simulador** do projeto, depois do celular da vítima
(`phone-simulator`) e das ligações com suspeitos (`arquivo-morto-voz`). Conteúdo 100%
dirigido por JSON — trocar de caso = trocar a pasta de conteúdo.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5191
npm run build    # tsc strict + vite build

# interrogatório por voz/texto (OpenAI Realtime + fallback de chat)
cp .env.example .env   # preencha OPENAI_API_KEY
npm run server         # http://localhost:3355 (o dev server faz proxy de /api)
```

O `.env` precisa de uma `OPENAI_API_KEY` própria de cada ambiente — **não copie chaves
de outro lugar**, cada um gera a sua no painel da OpenAI. Sem a chave, o restante do
sistema funciona normalmente e o módulo de interrogatório responde "indisponível".

## Login da demo

- **Matrícula:** `4177-SP`
- **Senha:** `pericia09`

O `system.json` guarda apenas o hash SHA-256 de `"<matricula>:<senha>"` (normalizado,
trim + lowercase) — as credenciais nunca aparecem em texto claro no cliente. Na ficção,
elas vêm impressas no **cartão F-09** que acompanha o protocolo do caso; este README é o
único lugar do repositório onde elas constam.

## Estrutura

```
src/engine/       contrato (types.ts), loader, zod (validação em dev), storage, format
src/sip/          casca do desktop: LoginScreen, Desktop, modules/, components/
public/content/default/   JSONs do caso (fonte da verdade)
public/content/default/fichas/  fichas de voz dos interrogáveis (espelho de server/fichas/)
public/assets/            placeholders (vídeo CFTV, fotos de arquivo, logo, anexos)
server/           escuta: token efêmero da Realtime API + fallback de chat (/api/chat)
server/fichas/    fichas SECRETAS lidas só pelo servidor (contêm a solução do caso)
docs/CONTENT-SCHEMA.md    definição completa de cada JSON
```

## Módulos da demo

- **Central de Câmeras** (`cftv`) — gravações de CFTV com fonte, endereço e intervalo.
- **Consulta de Placas** (`placas`) — proprietário, modelo e ano por placa.
- **Registro de Pessoas** (`pessoas`) — fichas com CPF, antecedentes e vínculos navegáveis.
- **Laudos e Ofícios** (`laudos`) — documentos periciais com selo de ofício e anexos.
- **Interrogatório** (`numeros`) — discar um número liga (voz) para a ficha associada.

## Conceitos

- **Casos**: copie `public/content/default/` para `public/content/<caso>/`, reescreva os
  JSONs e ajuste o loader (ou aguarde seleção de caso na UI).
- **`dataRef`**: cada entrada de `modules.json` aponta para um JSON de conteúdo sem a
  extensão (`"cftv"` → `cftv.json`).
- **Estado do jogador** (localStorage, namespace por `casoId`): login, progresso por
  módulo. Botão **Reiniciar** limpa.
- **Sem pistas na UI**: os JSONs não marcam o que é relevante para a solução — cabe ao
  jogador cruzar câmeras, placas, pessoas e laudos.

## Interrogatório (voz) e custo

`npm run server` sobe a escuta: o navegador pede um token efêmero em `/api/session` e
conecta **direto** na OpenAI Realtime via WebRTC — a chave fica só no servidor. O
system prompt é montado a partir da ficha secreta do personagem (`server/fichas/<id>.json`):
personalidade, gatilhos, segredos com condições de admissão, álibi com furos e guardrails.
Há fallback de texto em `/api/chat` (modelo `gpt-4o-mini`).

A Realtime API é cobrada por minuto de áudio — o modelo padrão é `gpt-realtime`
(qualidade máxima); para conter custo, use `OPENAI_MODEL=gpt-realtime-mini` (~3× mais
barato, qualidade inferior). As fichas têm `controle_de_ligacao` para encerrar
ligações longas (~2–3 min). Evite deixar sessões abertas sem uso.

## Convenções de conteúdo

Ver `docs/CONTENT-SCHEMA.md`. Resumo: timestamps ISO com `-03:00`; assets referenciados
por nome de arquivo em `public/assets/`; tudo em pt-BR; **nomes, marcas, CPFs e placas
sempre fictícios**.
