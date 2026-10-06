import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data invalida.');

export const cashQuerySchema = z.object({ data: date });

export const reconciliationQuerySchema = z.object({
  bancoId: z.string().uuid(),
  inicio: date,
  fim: date,
  status: z.enum(['todos', 'pendentes', 'conciliados']).default('pendentes'),
}).refine((value) => value.inicio <= value.fim, { path: ['fim'], message: 'Periodo invalido.' });

export const ofxImportSchema = z.object({ bancoId: z.string().uuid() });

export const reconcileSchema = z.object({
  extratoMovimentoId: z.string().uuid(),
  modo: z.enum(['manual', 'sugerido']).default('manual'),
  movimentosSistema: z.array(z.object({
    origem: z.enum(['recebimento', 'despesa', 'comissao']),
    id: z.string().uuid(),
  })).min(1).max(100),
});

export const statementMovementParamsSchema = z.object({ id: z.string().uuid() });

export const undoReconciliationSchema = z.object({
  justificativa: z.string().trim().min(5).max(1000),
});

export type ReconciliationQuery = z.infer<typeof reconciliationQuerySchema>;
export type ReconcileInput = z.infer<typeof reconcileSchema>;
