import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const financeStatementQuerySchema = z
  .object({
    inicio: date,
    fim: date,
    situacao: z.enum(['nao_faturados', 'faturados']).default('nao_faturados'),
    pagamento: z.enum(['todos', 'pendente', 'pago']).default('todos'),
    profissionalId: z.string().uuid().optional(),
  })
  .refine((value) => value.inicio <= value.fim, {
    message: 'A data inicial deve ser anterior ou igual a data final.',
    path: ['fim'],
  });

export const billProceduresSchema = z.object({
  procedimentoIds: z.array(z.string().uuid()).min(1).max(200),
});

export const financialEntryIdSchema = z.object({
  id: z.string().uuid(),
});

export const paymentStatusSchema = z.object({
  status: z.enum(['pendente', 'pago']),
  bancoId: z.string().uuid().nullable().optional(),
  formaPagamento: z.enum(['pix', 'transferencia', 'boleto', 'dinheiro', 'cartao', 'debito_automatico', 'outro']).nullable().optional(),
  referenciaPagamento: z.string().trim().max(180).nullable().optional(),
  observacoesPagamento: z.string().trim().max(1000).nullable().optional(),
  pagoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export type FinanceStatementQuery = z.infer<typeof financeStatementQuerySchema>;
export type BillProceduresInput = z.infer<typeof billProceduresSchema>;
export type PaymentStatusInput = z.infer<typeof paymentStatusSchema>;
