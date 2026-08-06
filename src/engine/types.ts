// ============================================================
// CONTRATO DE CONTEÚDO — SIP: Sistema Integrado de Perícia
// Cada interface abaixo espelha um arquivo JSON em public/content/<caso>/.
// Este arquivo é a fonte da verdade; docs/CONTENT-SCHEMA.md é a versão legível.
// Timestamps: ISO 8601 com timezone, ex.: "2025-03-14T19:05:00-03:00".
// Assets: nomes de arquivo em public/assets/, ex.: "foto-fernanda.svg".
// ============================================================

// ---------- system.json ----------
export interface SystemContent {
  casoId: string;              // usado como namespace do localStorage
  titulo: string;              // ex.: "SIP — Sistema Integrado de Perícia"
  orgao: string;               // órgão exibido no cabeçalho
  loginHash: string;           // SHA-256 hex de "<matricula>:<senha>" normalizado (trim + lowercase)
  loginHint: string;           // dica exibida na tela de login
  agenteDefault?: string;      // agente exibido na barra superior após o login
}

// ---------- modules.json ----------
export type ModuleType = "cftv" | "placas" | "pessoas" | "laudos" | "interrogatorio";

export interface ModuleEntry {
  id: string;
  label: string;
  icon: string;                // glifo exibido no menu lateral
  type: ModuleType;
  dataRef: string;             // arquivo JSON sem extensão, ex.: "cftv"
}

// ---------- cftv.json ----------
export interface GravacaoCftv {
  id: string;
  arquivo: string;             // mp4 em public/assets/
  fonte: string;               // ex.: "Câmera 03 — Posto Nevada"
  endereco: string;
  intervaloLabel: string;      // ex.: "18:40 — 19:20"
  inicioTs: string;            // ISO — início da gravação
  duracaoSeg: number;
}
export interface CftvFile { gravacoes: GravacaoCftv[]; }

// ---------- placas.json ----------
export interface PlacaRegistro {
  placa: string;               // Mercosul ou antiga, ex.: "FZK4E19"
  proprietario: string;
  cpf?: string;
  modelo: string;
  cor: string;
  ano: number;
}
export interface PlacasFile { placas: PlacaRegistro[]; }

// ---------- pessoas.json ----------
export interface Vinculo {
  pessoaId: string;            // id de outra ficha — vínculos são navegáveis
  relacao: string;             // ex.: "cônjuge", "sócio"
}
export interface Pessoa {
  id: string;
  nome: string;
  cpf: string;
  foto?: string;               // asset de retrato
  dataNascimento?: string;     // ISO (data)
  endereco: string;
  profissao?: string;
  antecedentes: string[];
  vinculos: Vinculo[];
}
export interface PessoasFile { pessoas: Pessoa[]; }

// ---------- laudos.json ----------
export interface Documento {
  id: string;
  titulo: string;
  origem: string;              // ex.: "Instituto de Criminalística"
  data: string;                // ISO (data)
  seloOficio?: boolean;        // exibe selo "RECEBIDO POR OFÍCIO"
  corpo: string;               // \n para parágrafos
  anexo?: string;              // asset de anexo (imagem)
}
export interface LaudosFile { documentos: Documento[]; }

// ---------- numeros.json ----------
export interface NumeroRegistro {
  numero: string;              // ex.: "(11) 98211-4477"
  fichaId?: string;            // ficha de voz em fichas/<id>.json (interrogatório)
  comportamento?: "atende" | "nao_atende";
}
export interface NumerosFile { numeros: NumeroRegistro[]; }

// ---------- agregado carregado ----------
export interface LoadedContent {
  system: SystemContent;
  modules: ModuleEntry[];
  // coleções indexadas por dataRef (sem extensão)
  data: Record<string, unknown>;
}
