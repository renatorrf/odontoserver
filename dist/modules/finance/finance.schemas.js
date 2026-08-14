"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentStatusSchema = exports.financialEntryIdSchema = exports.billProceduresSchema = exports.financeStatementQuerySchema = void 0;
const zod_1 = require("zod");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
exports.financeStatementQuerySchema = zod_1.z
    .object({
    inicio: date,
    fim: date,
    situacao: zod_1.z.enum(['nao_faturados', 'faturados']).default('nao_faturados'),
    pagamento: zod_1.z.enum(['todos', 'pendente', 'pago']).default('todos'),
    profissionalId: zod_1.z.string().uuid().optional(),
})
    .refine((value) => value.inicio <= value.fim, {
    message: 'A data inicial deve ser anterior ou igual a data final.',
    path: ['fim'],
});
exports.billProceduresSchema = zod_1.z.object({
    procedimentoIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(200),
});
exports.financialEntryIdSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.paymentStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['pendente', 'pago']),
    bancoId: zod_1.z.string().uuid().nullable().optional(),
    formaPagamento: zod_1.z.enum(['pix', 'transferencia', 'boleto', 'dinheiro', 'cartao', 'debito_automatico', 'outro']).nullable().optional(),
    referenciaPagamento: zod_1.z.string().trim().max(180).nullable().optional(),
    observacoesPagamento: zod_1.z.string().trim().max(1000).nullable().optional(),
    pagoEm: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
