# Esquema de conteúdo — SIP (Sistema Integrado de Perícia)

Este documento descreve, em linguagem humana, cada arquivo JSON de
`public/content/<caso>/` (o caso padrão é `default/`). A fonte da verdade técnica é
`src/engine/types.ts` — este arquivo é a versão legível dele e deve ser atualizado
sempre que os tipos mudarem. A última seção cobre as **fichas de voz** usadas pelo
servidor de interrogatório.

## Convenções gerais

- **Timestamps**: ISO 8601 com timezone, sempre `-03:00` (horário de Brasília).
  Ex.: `"2025-03-14T21:52:00-03:00"`. Datas sem hora usam só a data (`"2025-03-15"`).
- **Assets**: valores de campos `arquivo`, `foto` e `anexo` são **nomes de arquivo** que
  vivem em `public/assets/`. Ex.: `"cftv-placeholder-01.mp4"`, `"foto-ricardo.svg"`.
- **Idioma**: todo o conteúdo em pt-BR.
- **Ficção**: nomes, marcas, CPFs (`000.000.000-00`), placas e órgãos são sempre
  fictícios.
- **`dataRef`**: em `modules.json`, aponta para um arquivo JSON de
  `public/content/<caso>/` **sem a extensão**. Ex.: `"numeros"` → `numeros.json`.
- **Sem dicas de relevância**: nenhum JSON marca o que é ou não pista — nada de campos
  como `relevancia`. A triagem é trabalho do jogador.
- **Validação em dev**: cada arquivo é validado contra o espelho zod em
  `src/engine/schema.ts` quando `import.meta.env.DEV`; qualquer aviso no console indica
  conteúdo fora do contrato.

---

## `system.json` — SystemContent

Identidade do caso e da tela de login.

| Campo | Tipo | Significado |
|---|---|---|
| `casoId` | string | Namespace do localStorage (persistência por caso). |
| `titulo` | string | Título exibido no sistema, ex.: `"SIP — Sistema Integrado de Perícia"`. |
| `orgao` | string | Órgão fictício exibido no cabeçalho. |
| `loginHash` | string | SHA-256 hex de `"<matricula>:<senha>"` normalizado (trim + lowercase). |
| `loginHint` | string | Dica exibida na tela de login. |
| `agenteDefault?` | string | Agente exibido na barra superior após o login. |

```json
{ "casoId": "caso-001", "loginHint": "Credenciais no cartão F-09 do protocolo." }
```

## `modules.json` — ModuleEntry[]

Menu lateral do desktop. Cada entrada:

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string | Identificador único do módulo. |
| `label` | string | Nome exibido no menu. |
| `icon` | string | Glifo exibido no menu lateral. |
| `type` | ModuleType | Um de: `"cftv"`, `"placas"`, `"pessoas"`, `"laudos"`, `"interrogatorio"`. |
| `dataRef` | string | JSON de dados sem extensão, ex.: `"cftv"`. |

```json
{ "id": "cftv", "label": "Central de Câmeras", "icon": "◉", "type": "cftv", "dataRef": "cftv" }
```

## `cftv.json` — CftvFile (`{ gravacoes: GravacaoCftv[] }`)

Gravações da Central de Câmeras. Cada gravação:

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string | Único, ex.: `"rec-004"`. |
| `arquivo` | string | MP4 em `public/assets/`. |
| `fonte` | string | Identificação da câmera, ex.: `"CÂM 04"`. |
| `endereco` | string | Local da câmera. |
| `intervaloLabel` | string | Intervalo legível, ex.: `"sexta 21h52–21h57"`. |
| `inicioTs` | string (ISO) | Início da gravação. |
| `duracaoSeg` | number | Duração em segundos (curtas: 180–360). |

```json
{ "id": "rec-004", "arquivo": "cftv-placeholder-01.mp4", "fonte": "CÂM 04",
  "endereco": "Travessa Nestor de Castro, esq. c/ Rua Harmonia — Vila Madalena, São Paulo/SP",
  "intervaloLabel": "sexta 21h52–21h57", "inicioTs": "2025-03-14T21:52:00-03:00", "duracaoSeg": 300 }
```

## `placas.json` — PlacasFile (`{ placas: PlacaRegistro[] }`)

Consulta de placas (formato Mercosul `ABC1D23` ou antigo `ABC-1234`).

| Campo | Tipo | Significado |
|---|---|---|
| `placa` | string | Placa do veículo. |
| `proprietario` | string | Nome do proprietário (pessoa ou empresa fictícia). |
| `cpf?` | string | CPF fictício do proprietário, quando pessoa física. |
| `modelo` | string | Modelo do veículo. |
| `cor` | string | Cor. |
| `ano` | number | Ano. |

```json
{ "placa": "FZK4E19", "proprietario": "Fernanda Salles", "cpf": "315.228.946-02",
  "modelo": "Hyundai Creta", "cor": "branco", "ano": 2021 }
```

## `pessoas.json` — PessoasFile (`{ pessoas: Pessoa[] }`)

Registro de pessoas, com vínculos navegáveis entre fichas.

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string | Único, referenciado por `vinculos[].pessoaId`. |
| `nome` | string | Nome completo. |
| `cpf` | string | CPF fictício, formato `000.000.000-00`. |
| `foto?` | string | Asset de retrato, ex.: `"foto-ricardo.svg"`. |
| `dataNascimento?` | string (ISO data) | Ex.: `"1977-11-30"`. |
| `endereco` | string | Endereço completo. |
| `profissao?` | string | Profissão/ocupação. |
| `antecedentes` | string[] | Registros anteriores; `[]` quando não há. |
| `vinculos` | `{ pessoaId: string; relacao: string }[]` | Vínculos com outras fichas, ex.: `"cônjuge"`, `"amiga"`. |

```json
{ "id": "fernanda-salles", "nome": "Fernanda Salles", "cpf": "315.228.946-02",
  "foto": "foto-fernanda.svg", "endereco": "Rua Purpurina, 350 — Vila Madalena, São Paulo/SP",
  "antecedentes": [], "vinculos": [ { "pessoaId": "ricardo-salles", "relacao": "cônjuge" } ] }
```

## `laudos.json` — LaudosFile (`{ documentos: Documento[] }`)

Laudos, relatórios e ofícios.

| Campo | Tipo | Significado |
|---|---|---|
| `id` | string | Único. |
| `titulo` | string | Título do documento. |
| `origem` | string | Órgão emissor fictício, ex.: `"Instituto de Criminalística"`. |
| `data` | string (ISO data) | Data do documento. |
| `seloOficio?` | boolean | Se `true`, exibe o selo "RECEBIDO POR OFÍCIO". |
| `corpo` | string | Texto do documento; `\n\n` separa parágrafos. |
| `anexo?` | string | Asset de imagem anexa, ex.: `"anexo-pericia.svg"`. |

```json
{ "id": "doc-digital-001", "titulo": "Relatório de impressões digitais — AP 001/2025",
  "origem": "Instituto de Criminalística", "data": "2025-03-18",
  "corpo": "Refere-se às revelações...\n\nConclusão: resultado inconclusivo." }
```

## `numeros.json` — NumerosFile (`{ numeros: NumeroRegistro[] }`)

Dados do módulo de Interrogatório (discagem).

| Campo | Tipo | Significado |
|---|---|---|
| `numero` | string | Número discável, ex.: `"(11) 98104-6623"`. |
| `fichaId?` | string | Ficha de voz em `fichas/<id>.json` — define quem atende. |
| `comportamento?` | `"atende"` \| `"nao_atende"` | Sem `fichaId` ou `nao_atende`: a ligação não completa. |

```json
{ "numero": "(11) 97745-2210", "fichaId": "fernanda", "comportamento": "atende" }
```

---

## `fichas/<fichaId>.json` — ficha de voz (servidor)

Ficha **secreta** de um interrogável. Vive espelhada em
`public/content/default/fichas/` (referência) e em `server/fichas/` (de onde o servidor
de fato lê) — **nunca é exposta ao cliente**: o servidor (`server/index.js`) a usa para
montar o system prompt do modelo de voz/texto. Contém a solução (ou os furos) do caso.

| Campo | Tipo | Significado |
|---|---|---|
| `meta` | objeto | `caso_id`, `caso_nome`, `suspeito_id`, `versao_ficha`, `papel_secreto` (ex.: `"CULPADO"`, `"INOCENTE"`), `aviso`. |
| `voz` | objeto | `provedor`, `voz_gemini`, `voz_openai` (usada pela Realtime API), `observacao`. |
| `personagem` | objeto | `nome`, `idade`, `ocupacao`, `relacao_com_vitima`, `personalidade`, `estilo_de_fala`. |
| `perfil_emocional` | objeto | `linha_de_base`, `gatilhos[]` (`topico`, `reacao`, `tell`), `quando_encurralado(a)`. |
| `o_que_admite_de_bom_grado` | string[] | Fatos que o personagem conta sem resistência. |
| `segredos[]` | objeto[] | `id`, `segredo`, `so_admite_se` (condição narrativa), `como_admite` (forma da admissão). |
| `alibi_oficial` | objeto | `declaracao` (versão oficial) e `furos[]` (inconsistências exploráveis). |
| `guardrails` | objeto | `canon_lock`, `confissao_lock`, `anti_jailbreak`, `escopo_lock`, `sem_narracao`. |
| `controle_de_ligacao` | objeto | `duracao_alvo_seg`, `comportamento_no_limite`, `desculpas_de_indisponibilidade[]`, `observacao_design`. |

```json
{
  "meta": { "caso_id": "001", "papel_secreto": "INOCENTE" },
  "voz": { "voz_openai": "shimmer" },
  "segredos": [
    { "id": "briga", "segredo": "Brigaram por telefone no fim da tarde de sexta.",
      "so_admite_se": "O investigador demonstrar empatia genuína.",
      "como_admite": "Com culpa e justificativa." }
  ]
}
```

> **Nota de design**: as condições `so_admite_se` são o mecanismo central do
> interrogatório — o jogador precisa trazer evidências (ou empatia) para destravar cada
> camada. O `controle_de_ligacao` limita duração/quantidade de ligações (custo de API).
