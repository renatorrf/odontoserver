"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.returnAlertStatusSchema = exports.returnAlertQuerySchema = exports.returnAlertSchema = exports.eventStatusSchema = exports.availabilityQuerySchema = exports.eventIdSchema = exports.scheduleEventSchema = exports.scheduleQuerySchema = void 0;
const zod_1 = require("zod");
const schedule_status_1 = require("./schedule-status");
const optionalText = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().trim().optional());
const optionalUuid = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().uuid().optional());
const optionalDate = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());
const dateTime = zod_1.z.string().datetime({ offset: true });
exports.scheduleQuerySchema = zod_1.z
    .object({
    inicio: dateTime,
    fim: dateTime,
    profissionalIds: optionalText,
})
    .transform((value) => ({
    inicio: value.inicio,
    fim: value.fim,
    profissionalIds: value.profissionalIds
        ? value.profissionalIds.split(',').map((id) => zod_1.z.string().uuid().parse(id.trim()))
        : [],
}));
exports.scheduleEventSchema = zod_1.z
    .object({
    tipo: zod_1.z.enum(['consulta', 'compromisso']),
    profissionalId: optionalUuid,
    pacienteId: optionalUuid,
    titulo: optionalText,
    categoria: optionalText,
    observacoes: optionalText,
    observacoesProcedimentos: zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().trim().max(3000).optional()),
    inicioEm: dateTime,
    fimEm: dateTime,
    diaInteiro: zod_1.z.boolean().default(false),
    primeiraConsulta: zod_1.z.boolean().default(false),
    confirmacaoEnvio: optionalText,
    lembreteEnvio: optionalText,
    motivoRemarcacao: optionalText,
    procedimentos: zod_1.z
        .array(zod_1.z.object({
        catalogoProcedimentoId: zod_1.z.string().uuid(),
        quantidade: zod_1.z.coerce.number().int().min(1).max(99).default(1),
    }))
        .max(20)
        .default([]),
})
    .superRefine((value, context) => {
    if (new Date(value.inicioEm).getTime() >= new Date(value.fimEm).getTime()) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['fimEm'], message: 'Horario final invalido.' });
    }
    if (value.tipo === 'consulta' && !value.pacienteId) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['pacienteId'], message: 'Selecione o paciente.' });
    }
    if (value.tipo === 'consulta' && !value.profissionalId) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['profissionalId'], message: 'Selecione o profissional.' });
    }
    if (value.tipo === 'consulta' && !value.procedimentos.length) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['procedimentos'],
            message: 'Adicione ao menos um procedimento para compor o orcamento da consulta.',
        });
    }
    if (value.tipo === 'compromisso' && !value.titulo) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['titulo'], message: 'Informe o compromisso.' });
    }
});
exports.eventIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.availabilityQuerySchema = zod_1.z.object({
    profissionalId: zod_1.z.string().uuid(),
    inicio: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dias: zod_1.z.coerce.number().int().min(1).max(31).default(14),
    duracaoMinutos: zod_1.z.coerce.number().int().min(5).max(2880),
    diaInteiro: zod_1.z.preprocess((value) => typeof value === 'string' ? ['true', '1'].includes(value.toLowerCase()) : value, zod_1.z.boolean().default(false)),
    ignorarEventoId: optionalUuid,
});
exports.eventStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(schedule_status_1.scheduleStatuses),
    justificativa: optionalText,
}).superRefine((value, context) => {
    if (['cancelado', 'faltou'].includes(value.status) && !value.justificativa) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['justificativa'], message: 'Informe uma justificativa.' });
    }
});
exports.returnAlertSchema = zod_1.z.object({
    pacienteId: zod_1.z.string().uuid(),
    profissionalId: optionalUuid,
    motivo: zod_1.z.string().trim().min(2).max(180),
    retornarEm: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    observacoes: optionalText,
});
exports.returnAlertQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(['pendente', 'agendado', 'concluido', 'cancelado']).default('pendente'),
    ate: optionalDate,
});
exports.returnAlertStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['pendente', 'agendado', 'concluido', 'cancelado']),
    agendaEventoId: optionalUuid,
});
