/// <reference types="vite/client" />
// Carregamento de conteúdo em runtime a partir de /content/default/.
// Tolera arquivos ausentes ou inválidos (fetch 404 / erro de parse → ignora).
import { createContext, useContext } from "react";
import type { LoadedContent, ModuleEntry, SystemContent } from "./types";
import { dataSchemaFor, modulesSchema, systemSchema } from "./schema";
import type { z } from "zod";

const BASE = "/content/default";

/** Caminho público de um asset. */
export function assetUrl(asset: string): string {
  return `/assets/${asset}`;
}

// Sistema padrão usado quando system.json ainda não existe, para que a
// engine funcione mesmo sem nenhum arquivo de conteúdo.
// loginHash = SHA-256 hex de "4177-sp:pericia09".
const FALLBACK_SYSTEM: SystemContent = {
  casoId: "default",
  titulo: "SIP — Sistema Integrado de Perícia",
  orgao: "Polícia Técnico-Científica",
  loginHash: "2d9cf43e749e9d3e1d75f78b946fed34365b47821a51b9b0baa5f0c08e8d6600",
  loginHint: "Credenciais padrão: matrícula 4177-SP / senha pericia09",
};

async function fetchJson(path: string): Promise<unknown | undefined> {
  try {
    const res = await fetch(path);
    if (!res.ok) return undefined;
    return (await res.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** Validação apenas em dev: avisa no console mas nunca bloqueia o conteúdo. */
function devValidate(name: string, schema: z.ZodTypeAny, data: unknown): void {
  if (!import.meta.env.DEV) return;
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[content] ${name} falhou na validação:`, result.error.issues);
  }
}

export async function loadContent(): Promise<LoadedContent> {
  const [systemRaw, modulesRaw] = await Promise.all([
    fetchJson(`${BASE}/system.json`),
    fetchJson(`${BASE}/modules.json`),
  ]);

  if (import.meta.env.DEV) {
    if (systemRaw !== undefined) devValidate("system.json", systemSchema, systemRaw);
    if (modulesRaw !== undefined) devValidate("modules.json", modulesSchema, modulesRaw);
  }

  const system = (systemRaw as SystemContent | undefined) ?? FALLBACK_SYSTEM;
  const modules = (modulesRaw as ModuleEntry[] | undefined) ?? [];

  const data: Record<string, unknown> = {};
  await Promise.all(
    modules.map(async (m) => {
      const raw = await fetchJson(`${BASE}/${m.dataRef}.json`);
      if (raw === undefined) return;
      const schema = dataSchemaFor(m.type);
      if (schema) devValidate(`${m.dataRef}.json`, schema, raw);
      data[m.dataRef] = raw;
    }),
  );

  return { system, modules, data };
}

// ---------- contexto React ----------
const ContentContext = createContext<LoadedContent | null>(null);

export const ContentProvider = ContentContext.Provider;

export function useContent(): LoadedContent {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error("useContent deve ser usado dentro de <ContentProvider>");
  return ctx;
}
