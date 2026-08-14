"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentReversalSchema = exports.paymentReversalParamsSchema = exports.quoteReceiptSchema = exports.quoteReceiptParamsSchema = exports.receivablesQuerySchema = void 0;
const zod_1 = require("zod");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
exports.receivablesQuerySchema = zod_1.z.object({
    inicio: date,
    fim: date,
    status: zod_1.z.enum(['todos', 'pendente', 'parcialmente_pago', 'pago', 'vencido']).default('todos'),
    search: zod_1.z.string().trim().max(120).default(''),
}).refine((value) => value.inicio <= value.fim, { path: ['fim'], message: 'Periodo invalido.' });
exports.quoteReceiptParamsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.quoteReceiptSchema = zod_1.z.object({
    valor: zod_1.z.coerce.number().positive().max(9999999999.99),
    formaPagamento: zod_1.z.enum(['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'boleto', 'transferencia', 'convenio', 'outra']),
    parcelasCartao: zod_1.z.coerce.number().int().min(1).max(48).nullable().optional(),
    bancoId: zod_1.z.string().uuid().nullable().optional(),
    recebidoEm: zod_1.z.string().datetime({ offset: true }).optional(),
    referencia: zod_1.z.string().trim().max(120).nullable().optional(),
    observacoes: zod_1.z.string().trim().max(1000).nullable().optional(),
    desconto: zod_1.z.coerce.number().min(0).max(9999999999.99).default(0),
    acrescimo: zod_1.z.coerce.number().min(0).max(9999999999.99).default(0),
    idempotencyKey: zod_1.z.string().uuid(),
    origem: zod_1.z.enum(['contas_receber', 'agenda', 'financeiro_paciente', 'orcamento']).default('contas_receber'),
    agendamentoId: zod_1.z.string().uuid().nullable().optional(),
}).superRefine((value, context) => {
    if (value.formaPagamento !== 'cartao_credito' && value.parcelasCartao != null) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['parcelasCartao'], message: 'Parcelas sao permitidas apenas no cartao de credito.' });
    }
});
exports.paymentReversalParamsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.paymentReversalSchema = zod_1.z.object({
    justificativa: zod_1.z.string().trim().min(5).max(1000),
    referencia: zod_1.z.string().trim().max(120).nullable().optional(),
    tipo: zod_1.z.enum(['interno', 'solicitado_provedor', 'confirmado_provedor']).default('interno'),
    origem: zod_1.z.enum(['contas_receber', 'agenda', 'financeiro_paciente']).default('contas_receber'),
});
