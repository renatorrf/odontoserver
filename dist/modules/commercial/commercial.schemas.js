"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteScheduleSchema = exports.quoteSendSchema = exports.quoteStatusSchema = exports.quotePayloadSchema = exports.quoteListQuerySchema = exports.quoteIdSchema = exports.retentionContactSchema = exports.redFolderPatientSchema = exports.redFolderQuerySchema = void 0;
const zod_1 = require("zod");
exports.redFolderQuerySchema = zod_1.z.object({
    dias: zod_1.z.coerce.number().int().refine((value) => [30, 60, 90].includes(value), 'Periodo invalido.').default(30),
    tipo: zod_1.z.enum(['todos', 'inativos', 'orcamentos']).default('todos'),
});
exports.redFolderPatientSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.retentionContactSchema = zod_1.z.object({
    canais: zod_1.z.array(zod_1.z.enum(['aplicativo', 'whatsapp'])).min(1).max(2),
    procedimentoId: zod_1.z.string().uuid().nullable().optional(),
    mensagem: zod_1.z.string().trim().min(10).max(1000).optional(),
});
exports.quoteIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.quoteListQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(120).default(''),
    status: zod_1.z.enum(['todos', 'rascunho', 'enviado', 'aprovado', 'nao_aprovado', 'expirado', 'cancelado']).default('todos'),
});
const nullableText = (max) => zod_1.z.string().trim().max(max).nullable().optional();
exports.quotePayloadSchema = zod_1.z.object({
    pacienteId: zod_1.z.string().uuid().nullable().optional(),
    nomeContato: zod_1.z.string().trim().min(2).max(180),
    whatsapp: zod_1.z.string().trim().min(8).max(30).refine((value) => {
        const length = value.replace(/\D/g, '').length;
        return length >= 8 && length <= 15;
    }, 'WhatsApp invalido.'),
    origem: zod_1.z.enum(['rapido', 'pasta_vermelha', 'consulta']).default('rapido'),
    status: zod_1.z.enum(['rascunho', 'enviado', 'aprovado', 'nao_aprovado', 'expirado', 'cancelado']).default('rascunho'),
    validade: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    descontoValor: zod_1.z.coerce.number().min(0).max(99999999.99).default(0),
    descontoTipo: zod_1.z.enum(['valor', 'percentual']).default('valor'),
    descontoPercentual: zod_1.z.coerce.number().min(0).max(100).nullable().optional(),
    descontoJustificativa: nullableText(1000),
    observacoes: nullableText(3000),
    motivoNaoAprovacao: nullableText(1000),
    itens: zod_1.z.array(zod_1.z.object({
        catalogoProcedimentoId: zod_1.z.string().uuid(),
        quantidade: zod_1.z.coerce.number().int().min(1).max(99).default(1),
        valorUnitario: zod_1.z.coerce.number().min(0).max(99999999.99),
        cortesia: zod_1.z.boolean().default(false),
        cortesiaJustificativa: nullableText(1000),
        descontoValor: zod_1.z.coerce.number().min(0).max(99999999.99).default(0),
        descontoJustificativa: nullableText(1000),
    })).min(1).max(100),
}).superRefine((value, context) => {
    if ((value.descontoValor > 0 || (value.descontoPercentual ?? 0) > 0) && !value.descontoJustificativa) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['descontoJustificativa'], message: 'Justifique o desconto.' });
    }
    value.itens.forEach((item, index) => {
        if (item.cortesia && !item.cortesiaJustificativa)
            context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['itens', index, 'cortesiaJustificativa'], message: 'Justifique a cortesia.' });
        if (item.descontoValor > 0 && !item.descontoJustificativa)
            context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['itens', index, 'descontoJustificativa'], message: 'Justifique o desconto do procedimento.' });
        if (item.descontoValor > item.quantidade * item.valorUnitario)
            context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['itens', index, 'descontoValor'], message: 'O desconto nao pode superar o valor do procedimento.' });
    });
});
exports.quoteStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['rascunho', 'enviado', 'aprovado', 'nao_aprovado', 'expirado', 'cancelado']),
    motivoNaoAprovacao: nullableText(1000),
});
exports.quoteSendSchema = zod_1.z.object({
    canais: zod_1.z.array(zod_1.z.enum(['aplicativo', 'whatsapp'])).min(1).max(2),
    mensagem: zod_1.z.string().trim().min(10).max(1500).optional(),
});
exports.quoteScheduleSchema = zod_1.z.object({
    profissionalId: zod_1.z.string().uuid(),
    inicioEm: zod_1.z.string().datetime({ offset: true }),
    diaInteiro: zod_1.z.boolean().default(false),
    cpf: zod_1.z.string().trim().refine((value) => value.replace(/\D/g, '').length === 11, 'CPF invalido.'),
});
