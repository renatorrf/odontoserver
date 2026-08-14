import { z } from 'zod';

export const redFolderQuerySchema = z.object({
  dias: z.coerce.number().int().refine((value) => [30, 60, 90].includes(value), 'Periodo invalido.').default(30),
  tipo: z.enum(['todos', 'inativos', 'orcamentos']).default('todos'),
});

export const redFolderPatientSchema = z.object({ id: z.string().uuid() });

export const retentionContactSchema = z.object({
  canais: z.array(z.enum(['aplicativo', 'whatsapp'])).min(1).max(2),
  procedimentoId: z.string().uuid().nullable().optional(),
  mensagem: z.string().trim().min(10).max(1000).optional(),
});

export const quoteIdSchema = z.object({ id: z.string().uuid() });

export const quoteListQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  status: z.enum(['todos', 'rascunho', 'enviado', 'aprovado', 'nao_aprovado', 'expirado', 'cancelado']).default('todos'),
});

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const quotePayloadSchema = z.object({
  pacienteId: z.string().uuid().nullable().optional(),
  nomeContato: z.string().trim().min(2).max(180),
  whatsapp: z.string().trim().min(8).max(30).refine(
    (value) => {
      const length = value.replace(/\D/g, '').length;
      return length >= 8 && length <= 15;
    },
    'WhatsApp invalido.',
  ),
  origem: z.enum(['rapido', 'pasta_vermelha', 'consulta']).default('rapido'),
  status: z.enum(['rascunho', 'enviado', 'aprovado', 'nao_aprovado', 'expirado', 'cancelado']).default('rascunho'),
  validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  descontoValor: z.coerce.number().min(0).max(99999999.99).default(0),
  descontoTipo: z.enum(['valor', 'percentual']).default('valor'),
  descontoPercentual: z.coerce.number().min(0).max(100).nullable().optional(),
  descontoJustificativa: nullableText(1000),
  observacoes: nullableText(3000),
  motivoNaoAprovacao: nullableText(1000),
  itens: z.array(z.object({
    catalogoProcedimentoId: z.string().uuid(),
    quantidade: z.coerce.number().int().min(1).max(99).default(1),
    valorUnitario: z.coerce.number().min(0).max(99999999.99),
    cortesia: z.boolean().default(false),
    cortesiaJustificativa: nullableText(1000),
    descontoValor: z.coerce.number().min(0).max(99999999.99).default(0),
    descontoJustificativa: nullableText(1000),
  })).min(1).max(100),
}).superRefine((value, context) => {
  if ((value.descontoValor > 0 || (value.descontoPercentual ?? 0) > 0) && !value.descontoJustificativa) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['descontoJustificativa'], message: 'Justifique o desconto.' });
  }
  value.itens.forEach((item, index) => {
    if (item.cortesia && !item.cortesiaJustificativa) context.addIssue({ code: z.ZodIssueCode.custom, path: ['itens', index, 'cortesiaJustificativa'], message: 'Justifique a cortesia.' });
    if (item.descontoValor > 0 && !item.descontoJustificativa) context.addIssue({ code: z.ZodIssueCode.custom, path: ['itens', index, 'descontoJustificativa'], message: 'Justifique o desconto do procedimento.' });
    if (item.descontoValor > item.quantidade * item.valorUnitario) context.addIssue({ code: z.ZodIssueCode.custom, path: ['itens', index, 'descontoValor'], message: 'O desconto nao pode superar o valor do procedimento.' });
  });
});

export const quoteStatusSchema = z.object({
  status: z.enum(['rascunho', 'enviado', 'aprovado', 'nao_aprovado', 'expirado', 'cancelado']),
  motivoNaoAprovacao: nullableText(1000),
});

export const quoteSendSchema = z.object({
  canais: z.array(z.enum(['aplicativo', 'whatsapp'])).min(1).max(2),
  mensagem: z.string().trim().min(10).max(1500).optional(),
});

export const quoteScheduleSchema = z.object({
  profissionalId: z.string().uuid(),
  inicioEm: z.string().datetime({ offset: true }),
  diaInteiro: z.boolean().default(false),
  cpf: z.string().trim().refine((value) => value.replace(/\D/g, '').length === 11, 'CPF invalido.'),
});

export type RedFolderQuery = z.infer<typeof redFolderQuerySchema>;
export type RetentionContactInput = z.infer<typeof retentionContactSchema>;
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
export type QuotePayload = z.infer<typeof quotePayloadSchema>;
export type QuoteStatusInput = z.infer<typeof quoteStatusSchema>;
export type QuoteSendInput = z.infer<typeof quoteSendSchema>;
export type QuoteScheduleInput = z.infer<typeof quoteScheduleSchema>;
