"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteItemStatusSchema = exports.patientFinancialEntrySchema = exports.patientAppointmentsQuerySchema = exports.patientAnamnesisSchema = exports.anamnesisAnswers = exports.patientDocumentUpdateSchema = exports.patientDocumentMetadataSchema = exports.patientQuoteItemParamsSchema = exports.patientQuoteParamsSchema = exports.patientDocumentParamsSchema = void 0;
const zod_1 = require("zod");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().trim().optional());
const optionalDate = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), date.optional());
const optionalUuid = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().uuid().optional());
exports.patientDocumentParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    documentId: zod_1.z.string().uuid(),
});
exports.patientQuoteParamsSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    quoteId: zod_1.z.string().uuid(),
});
exports.patientQuoteItemParamsSchema = exports.patientQuoteParamsSchema.extend({
    itemId: zod_1.z.string().uuid(),
});
exports.patientDocumentMetadataSchema = zod_1.z.object({
    categoria: zod_1.z.enum([
        'laudo', 'radiografia', 'foto_inicial', 'foto_acompanhamento', 'foto_final',
        'receita', 'termo', 'documento', 'outro',
    ]).default('documento'),
    descricao: optionalText,
    dataDocumento: optionalDate,
    orcamentoId: optionalUuid,
    procedimentoRealizadoId: optionalUuid,
});
exports.patientDocumentUpdateSchema = exports.patientDocumentMetadataSchema.pick({
    categoria: true,
    descricao: true,
    dataDocumento: true,
});
exports.anamnesisAnswers = [
    'alergia',
    'medicamento_continuo',
    'diabetes',
    'hipertensao',
    'doenca_cardiaca',
    'coagulacao',
    'gravidez_amamentacao',
    'reacao_anestesia',
    'cirurgia_recente',
    'doenca_infectocontagiosa',
    'fumante',
    'outra_condicao',
];
exports.patientAnamnesisSchema = zod_1.z.object({
    observacoes: optionalText,
    aceitePaciente: zod_1.z.boolean().default(false),
    assinaturaNome: optionalText,
    respostas: zod_1.z.array(zod_1.z.object({
        codigo: zod_1.z.enum(exports.anamnesisAnswers),
        resposta: zod_1.z.enum(['sim', 'nao', 'nao_informado']),
        detalhes: optionalText,
    })).length(exports.anamnesisAnswers.length),
}).superRefine((value, context) => {
    const requiredDetail = new Set(['alergia', 'medicamento_continuo', 'reacao_anestesia', 'outra_condicao']);
    for (const answer of value.respostas) {
        if (answer.resposta === 'sim' && requiredDetail.has(answer.codigo) && !answer.detalhes) {
            context.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['respostas', answer.codigo, 'detalhes'],
                message: 'Informe os detalhes da resposta.',
            });
        }
    }
    if (value.aceitePaciente && !value.assinaturaNome) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['assinaturaNome'],
            message: 'Informe o nome usado no aceite.',
        });
    }
});
exports.patientAppointmentsQuerySchema = zod_1.z.object({
    inicio: optionalDate,
    fim: optionalDate,
    profissionalId: optionalUuid,
    status: zod_1.z.enum([
        'todos', 'agendado', 'confirmado', 'em_espera', 'em_atendimento', 'atendido',
        'concluido', 'atrasado', 'faltou', 'cancelado',
    ]).default('todos'),
    periodo: zod_1.z.enum(['todos', 'futuros', 'anteriores']).default('todos'),
}).refine((value) => !value.inicio || !value.fim || value.inicio <= value.fim, {
    path: ['fim'],
    message: 'A data final deve ser posterior a inicial.',
});
exports.patientFinancialEntrySchema = zod_1.z.object({
    orcamentoId: zod_1.z.string().uuid().nullable().optional(),
    descricao: zod_1.z.string().trim().min(2).max(180),
    vencimento: date,
    valor: zod_1.z.coerce.number().positive().max(9999999999.99),
    numeroParcela: zod_1.z.coerce.number().int().min(1).default(1),
    totalParcelas: zod_1.z.coerce.number().int().min(1).default(1),
}).refine((value) => value.numeroParcela <= value.totalParcelas, {
    path: ['numeroParcela'],
    message: 'Numero da parcela invalido.',
});
exports.quoteItemStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['planejado', 'autorizado', 'em_execucao', 'concluido', 'suspenso', 'cancelado']),
});
