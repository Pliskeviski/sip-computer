// Esquemas zod que espelham types.ts. Usados para validação APENAS em dev
// (import.meta.env.DEV); em produção o JSON é confiado como está.
import { z } from "zod";

const iso = z.string();

// ---------- system.json ----------
export const systemSchema = z.object({
  casoId: z.string(),
  titulo: z.string(),
  orgao: z.string(),
  loginHash: z.string(),
  loginHint: z.string(),
  agenteDefault: z.string().optional(),
});

// ---------- modules.json ----------
export const moduleEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
  type: z.enum(["cftv", "placas", "pessoas", "laudos", "interrogatorio"]),
  dataRef: z.string(),
});
export const modulesSchema = z.array(moduleEntrySchema);

// ---------- cftv.json ----------
export const cftvFileSchema = z.object({
  gravacoes: z.array(
    z.object({
      id: z.string(),
      arquivo: z.string(),
      fonte: z.string(),
      endereco: z.string(),
      intervaloLabel: z.string(),
      inicioTs: iso,
      duracaoSeg: z.number(),
    }),
  ),
});

// ---------- placas.json ----------
export const placasFileSchema = z.object({
  placas: z.array(
    z.object({
      placa: z.string(),
      proprietario: z.string(),
      cpf: z.string().optional(),
      modelo: z.string(),
      cor: z.string(),
      ano: z.number(),
    }),
  ),
});

// ---------- pessoas.json ----------
export const pessoasFileSchema = z.object({
  pessoas: z.array(
    z.object({
      id: z.string(),
      nome: z.string(),
      cpf: z.string(),
      foto: z.string().optional(),
      dataNascimento: iso.optional(),
      endereco: z.string(),
      profissao: z.string().optional(),
      antecedentes: z.array(z.string()),
      vinculos: z.array(z.object({ pessoaId: z.string(), relacao: z.string() })),
    }),
  ),
});

// ---------- laudos.json ----------
export const laudosFileSchema = z.object({
  documentos: z.array(
    z.object({
      id: z.string(),
      titulo: z.string(),
      origem: z.string(),
      data: iso,
      seloOficio: z.boolean().optional(),
      corpo: z.string(),
      anexo: z.string().optional(),
    }),
  ),
});

// ---------- numeros.json ----------
export const numerosFileSchema = z.object({
  numeros: z.array(
    z.object({
      numero: z.string(),
      fichaId: z.string().optional(),
      comportamento: z.enum(["atende", "nao_atende"]).optional(),
    }),
  ),
});

/** Esquema do arquivo de dados associado a cada tipo de módulo (quando houver). */
export function dataSchemaFor(type: string): z.ZodTypeAny | undefined {
  switch (type) {
    case "cftv":
      return cftvFileSchema;
    case "placas":
      return placasFileSchema;
    case "pessoas":
      return pessoasFileSchema;
    case "laudos":
      return laudosFileSchema;
    case "interrogatorio":
      return numerosFileSchema;
    default:
      return undefined;
  }
}
