"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationalCostConfigSchema = exports.reportQuerySchema = exports.expensePaymentSchema = exports.deleteExpenseQuerySchema = exports.updateExpenseSchema = exports.expenseSchema = exports.expenseQuerySchema = exports.entityIdSchema = exports.bankSchema = exports.paymentMethodSchema = exports.expenseCategories = void 0;
const zod_1 = require("zod");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = zod_1.z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), zod_1.z.string().trim().optional());
const optionalDate = zod_1.z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), date.optional());
exports.expenseCategories = [
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
];
exports.paymentMethodSchema = zod_1.z.enum([
    'pix',
    'transferencia',
    'boleto',
    'dinheiro',
    'cartao',
    'debito_automatico',
    'outro',
]);
exports.bankSchema = zod_1.z.object({
    nome: zod_1.z.string().trim().min(2).max(120),
    codigoBanco: optionalText,
    agencia: optionalText,
    conta: optionalText,
    tipoConta: zod_1.z.enum(['corrente', 'poupanca', 'pagamento', 'caixa']).default('corrente'),
    titular: optionalText,
    documentoTitular: optionalText,
    chavePix: optionalText,
    ativo: zod_1.z.boolean().default(true),
});
exports.entityIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.expenseQuerySchema = zod_1.z.object({
    inicio: date,
    fim: date,
    status: zod_1.z.enum(['todos', 'pendente', 'paga']).default('todos'),
    categoria: zod_1.z.enum(exports.expenseCategories).optional(),
    bancoId: zod_1.z.string().uuid().optional(),
});
exports.expenseSchema = zod_1.z.object({
    descricao: zod_1.z.string().trim().min(2).max(180),
    categoria: zod_1.z.enum(exports.expenseCategories),
    fornecedor: optionalText,
    centroCusto: optionalText,
    documento: optionalText,
    competencia: date,
    vencimento: date,
    valor: zod_1.z.coerce.number().finite().nonnegative().max(9999999999.99),
    bancoId: zod_1.z.string().uuid().nullable().optional(),
    observacoes: optionalText,
    recorrente: zod_1.z.boolean().default(false),
    recorrencia: zod_1.z.enum(['semanal', 'mensal', 'anual']).optional(),
    recorrenciaFim: optionalDate,
}).superRefine((value, context) => {
    if (value.recorrente && !value.recorrencia) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['recorrencia'], message: 'Informe a recorrencia.' });
    }
    if (value.recorrenciaFim && value.recorrenciaFim < value.vencimento) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['recorrenciaFim'], message: 'Data final invalida.' });
    }
});
exports.updateExpenseSchema = exports.expenseSchema.and(zod_1.z.object({ aplicarProximas: zod_1.z.boolean().default(false) }));
exports.deleteExpenseQuerySchema = zod_1.z.object({
    aplicarProximas: zod_1.z.preprocess((value) => value === 'true' || value === true, zod_1.z.boolean().default(false)),
});
exports.expensePaymentSchema = zod_1.z.object({
    status: zod_1.z.enum(['pendente', 'paga']),
    bancoId: zod_1.z.string().uuid().nullable().optional(),
    formaPagamento: exports.paymentMethodSchema.nullable().optional(),
    referenciaPagamento: optionalText,
    observacoes: optionalText,
    pagaEm: optionalDate,
});
exports.reportQuerySchema = zod_1.z.object({
    inicio: date,
    fim: date,
}).refine((value) => value.inicio <= value.fim, {
    path: ['fim'],
    message: 'A data final deve ser posterior a inicial.',
});
exports.operationalCostConfigSchema = zod_1.z.object({
    quantidadeCadeiras: zod_1.z.coerce.number().int().min(1).max(100),
    horasProdutivasCadeiraMes: zod_1.z.coerce.number().positive().max(744),
});
