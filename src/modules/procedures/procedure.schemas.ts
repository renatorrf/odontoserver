import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

export const createProcedureSchema = z.object({
  pacienteId: z.string().uuid(),
  profissionalId: z.string().uuid().optional(),
  catalogoProcedimentoId: z.string().uuid().optional(),
  dataProcedimento: optionalDate,
  descricao: z.string().trim().min(2),
  dente: optionalText,
  profissionalNome: optionalText,
  valor: z.coerce.number().nonnegative().optional(),
  observacoes: optionalText,
});

export const procedureListQuerySchema = z.object({
  pacienteId: z.string().uuid(),
});

export const catalogProcedureSchema = z.object({
  codigo: optionalText,
  nome: z.string().trim().min(2).max(160),
  descricao: optionalText,
  categoria: optionalText,
  duracaoMinutos: z.coerce.number().int().min(5).max(480).default(30),
  valor: z.coerce.number().finite().nonnegative().max(9999999999.99),
  custoVariavel: z.coerce.number().finite().nonnegative().max(9999999999.99).default(0),
  ativo: z.boolean().default(true),
});

export const catalogProcedureListQuerySchema = z.object({
  search: optionalText,
  status: z.enum(['todos', 'ativos', 'inativos']).default('todos'),
});

export const catalogProcedureIdSchema = z.object({
  id: z.string().uuid(),
});

export const catalogProcedureStatusSchema = z.object({
  ativo: z.boolean(),
});

export type CreateProcedureInput = z.infer<typeof createProcedureSchema>;
export type ProcedureListQuery = z.infer<typeof procedureListQuerySchema>;
export type CatalogProcedureInput = z.infer<typeof catalogProcedureSchema>;
export type CatalogProcedureListQuery = z.infer<typeof catalogProcedureListQuerySchema>;
export type CatalogProcedureStatusInput = z.infer<typeof catalogProcedureStatusSchema>;
