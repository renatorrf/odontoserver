"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.professionalIdParamSchema = exports.professionalListQuerySchema = exports.commissionSchema = exports.createProfessionalSchema = void 0;
const zod_1 = require("zod");
const br_validation_1 = require("../../utils/br-validation");
const optionalText = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().trim().optional());
const optionalDate = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());
const optionalCpf = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().trim().refine(br_validation_1.isValidCpf, 'CPF invalido.').optional());
const requiredWhatsapp = zod_1.z.string({ required_error: 'Informe o WhatsApp.' })
    .trim()
    .min(1, 'Informe o WhatsApp.')
    .refine(br_validation_1.hasValidPhoneLength, 'WhatsApp invalido.');
const professionalCouncil = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().trim().min(2).max(20).default('CRO'));
const availabilitySchema = zod_1.z
    .object({
    diaSemana: zod_1.z.number().int().min(0).max(6),
    horaInicio: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    horaFim: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    intervaloMinutos: zod_1.z.number().int().min(5).max(240).default(30),
})
    .refine((value) => value.horaInicio < value.horaFim, {
    message: 'O horario final deve ser posterior ao inicial.',
    path: ['horaFim'],
});
exports.createProfessionalSchema = zod_1.z.object({
    nome: zod_1.z.string({ required_error: 'Informe o nome.' }).trim().min(2, 'Informe o nome completo.'),
    nascimento: optionalDate,
    sexo: zod_1.z.enum(['masculino', 'feminino', 'outro', 'nao_informado']).default('nao_informado'),
    estadoCivil: optionalText,
    cpf: optionalCpf,
    rg: optionalText,
    conselhoTipo: professionalCouncil,
    conselhoUf: optionalText,
    conselhoNumero: optionalText,
    corAgenda: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#126B62'),
    especialidades: zod_1.z.array(zod_1.z.string().trim().min(2).max(100)).max(20).default([]),
    contato: zod_1.z
        .object({
        email: optionalText,
        celular: requiredWhatsapp,
        foneFixo: optionalText,
    }),
    chavePix: optionalText,
    endereco: zod_1.z
        .object({
        cep: optionalText,
        cidade: optionalText,
        estado: optionalText,
        logradouro: optionalText,
        numero: optionalText,
        bairro: optionalText,
        complemento: optionalText,
    })
        .default({}),
    observacoes: optionalText,
    agendaHabilitada: zod_1.z.boolean().default(true),
    visualizacaoAgenda: zod_1.z.enum(['propria', 'clinica']).default('propria'),
    disponibilidades: zod_1.z.array(availabilitySchema).max(28).default([]),
});
exports.commissionSchema = zod_1.z
    .object({
    validoDesde: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validoAte: optionalDate,
    duracaoIndeterminada: zod_1.z.boolean().default(true),
    requerAprovacao: zod_1.z.boolean().default(false),
    tipo: zod_1.z.enum(['porcentagem', 'valor_fixo']).default('porcentagem'),
    momento: zod_1.z
        .enum(['recebimento_pagamento', 'execucao_procedimento', 'checkout_paciente', 'aprovacao_orcamento'])
        .default('recebimento_pagamento'),
    percentualGeral: zod_1.z.number().min(0).max(100).nullable().optional(),
    percentualPlano: zod_1.z.number().min(0).max(100).nullable().optional(),
    valorFixo: zod_1.z.number().min(0).nullable().optional(),
    descontarImpostos: zod_1.z.boolean().default(false),
    descontarTaxasPagamento: zod_1.z.boolean().default(false),
    gerarPlanoProprioExecucao: zod_1.z.boolean().default(false),
})
    .superRefine((value, context) => {
    if (!value.duracaoIndeterminada && !value.validoAte) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['validoAte'], message: 'Informe o fim da vigencia.' });
    }
    if (value.validoAte && value.validoAte < value.validoDesde) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['validoAte'], message: 'Data final invalida.' });
    }
    if (value.tipo === 'porcentagem' && value.percentualGeral == null) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['percentualGeral'], message: 'Informe a comissao geral.' });
    }
    if (value.tipo === 'valor_fixo' && value.valorFixo == null) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['valorFixo'], message: 'Informe o valor fixo.' });
    }
});
exports.professionalListQuerySchema = zod_1.z.object({ search: optionalText });
exports.professionalIdParamSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
