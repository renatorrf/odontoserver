import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const receivablesQuerySchema = z.object({
  inicio: date,
  fim: date,
  status: z.enum(['todos', 'pendente', 'parcialmente_pago', 'pago', 'vencido']).default('todos'),
  search: z.string().trim().max(120).default(''),
}).refine((value) => value.inicio <= value.fim, { path: ['fim'], message: 'Periodo invalido.' });

export const quoteReceiptParamsSchema = z.object({ id: z.string().uuid() });

export const quoteReceiptSchema = z.object({
  valor: z.coerce.number().positive().max(9999999999.99),
  formaPagamento: z.enum(['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'boleto', 'transferencia', 'convenio', 'outra']),
  parcelasCartao: z.coerce.number().int().min(1).max(48).nullable().optional(),
  bancoId: z.string().uuid().nullable().optional(),
  recebidoEm: z.string().datetime({ offset: true }).optional(),
  referencia: z.string().trim().max(120).nullable().optional(),
  observacoes: z.string().trim().max(1000).nullable().optional(),
  desconto: z.coerce.number().min(0).max(9999999999.99).default(0),
  acrescimo: z.coerce.number().min(0).max(9999999999.99).default(0),
  idempotencyKey: z.string().uuid(),
  origem: z.enum(['contas_receber', 'agenda', 'financeiro_paciente', 'orcamento']).default('contas_receber'),
  agendamentoId: z.string().uuid().nullable().optional(),
}).superRefine((value, context) => {
  if (value.formaPagamento !== 'cartao_credito' && value.parcelasCartao != null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['parcelasCartao'], message: 'Parcelas sao permitidas apenas no cartao de credito.' });
  }
});

export type ReceivablesQuery = z.infer<typeof receivablesQuerySchema>;
export type QuoteReceiptInput = z.infer<typeof quoteReceiptSchema>;

export const paymentReversalParamsSchema = z.object({ id: z.string().uuid() });
export const paymentReversalSchema = z.object({
  justificativa: z.string().trim().min(5).max(1000),
  referencia: z.string().trim().max(120).nullable().optional(),
  tipo: z.enum(['interno', 'solicitado_provedor', 'confirmado_provedor']).default('interno'),
  origem: z.enum(['contas_receber', 'agenda', 'financeiro_paciente']).default('contas_receber'),
});
export type PaymentReversalInput = z.infer<typeof paymentReversalSchema>;
