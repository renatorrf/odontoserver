import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);
const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  date.optional(),
);

export const expenseCategories = [
  'operacional',
  'aluguel',
  'insumos',
  'laboratorio',
  'pessoal',
  'impostos',
  'marketing',
  'tecnologia',
  'manutencao',
  'investimento',
  'utilidades',
  'financeiro',
  'assinaturas',
  'outros',
] as const;

export const paymentMethodSchema = z.enum([
  'pix',
  'transferencia',
  'boleto',
  'dinheiro',
  'cartao',
  'debito_automatico',
  'outro',
]);

export const bankSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  codigoBanco: optionalText,
  agencia: optionalText,
  conta: optionalText,
  tipoConta: z.enum(['corrente', 'poupanca', 'pagamento', 'caixa']).default('corrente'),
  titular: optionalText,
  documentoTitular: optionalText,
  chavePix: optionalText,
  ativo: z.boolean().default(true),
});

export const entityIdSchema = z.object({ id: z.string().uuid() });

export const expenseQuerySchema = z.object({
  inicio: date,
  fim: date,
  status: z.enum(['todos', 'pendente', 'paga']).default('todos'),
  categoria: z.enum(expenseCategories).optional(),
  bancoId: z.string().uuid().optional(),
});

export const expenseSchema = z.object({
  descricao: z.string().trim().min(2).max(180),
  categoria: z.enum(expenseCategories),
  fornecedor: optionalText,
  centroCusto: optionalText,
  documento: optionalText,
  competencia: date,
  vencimento: date,
  valor: z.coerce.number().finite().nonnegative().max(9999999999.99),
  bancoId: z.string().uuid().nullable().optional(),
  observacoes: optionalText,
  recorrente: z.boolean().default(false),
  recorrencia: z.enum(['semanal', 'mensal', 'anual']).optional(),
  recorrenciaFim: optionalDate,
}).superRefine((value, context) => {
  if (value.recorrente && !value.recorrencia) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recorrencia'], message: 'Informe a recorrencia.' });
  }
  if (value.recorrenciaFim && value.recorrenciaFim < value.vencimento) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recorrenciaFim'], message: 'Data final invalida.' });
  }
});

export const updateExpenseSchema = expenseSchema.and(z.object({ aplicarProximas: z.boolean().default(false) }));

export const deleteExpenseQuerySchema = z.object({
  aplicarProximas: z.preprocess((value) => value === 'true' || value === true, z.boolean().default(false)),
});

export const expensePaymentSchema = z.object({
  status: z.enum(['pendente', 'paga']),
  bancoId: z.string().uuid().nullable().optional(),
  formaPagamento: paymentMethodSchema.nullable().optional(),
  referenciaPagamento: optionalText,
  observacoes: optionalText,
  pagaEm: optionalDate,
});

export const reportQuerySchema = z.object({
  inicio: date,
  fim: date,
}).refine((value) => value.inicio <= value.fim, {
  path: ['fim'],
  message: 'A data final deve ser posterior a inicial.',
});

export const operationalCostConfigSchema = z.object({
  quantidadeCadeiras: z.coerce.number().int().min(1).max(100),
  horasProdutivasCadeiraMes: z.coerce.number().positive().max(744),
});

export type BankInput = z.infer<typeof bankSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;
export type ExpensePaymentInput = z.infer<typeof expensePaymentSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type OperationalCostConfigInput = z.infer<typeof operationalCostConfigSchema>;
