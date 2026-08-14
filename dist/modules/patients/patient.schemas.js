"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patientIdParamSchema = exports.patientListQuerySchema = exports.createPatientSchema = void 0;
const zod_1 = require("zod");
const br_validation_1 = require("../../utils/br-validation");
const optionalText = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().trim().optional());
const optionalDate = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());
const optionalCpf = zod_1.z.preprocess((value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value), zod_1.z.string().trim().refine(br_validation_1.isValidCpf, 'CPF invalido.').optional());
const requiredWhatsapp = zod_1.z.string({ required_error: 'Informe o WhatsApp.' })
    .trim()
    .min(1, 'Informe o WhatsApp.')
    .refine(br_validation_1.hasValidPhoneLength, 'WhatsApp invalido.');
exports.createPatientSchema = zod_1.z.object({
    numeroProntuario: optionalText,
    nome: zod_1.z.string({ required_error: 'Informe o nome.' }).trim().min(2, 'Informe o nome completo.'),
    apelido: optionalText,
    nascimento: optionalDate,
    sexo: zod_1.z.enum(['masculino', 'feminino', 'outro', 'nao_informado']).default('nao_informado'),
    cpf: optionalCpf,
    rg: optionalText,
    estadoCivil: optionalText,
    escolaridade: optionalText,
    comoConheceu: optionalText,
    observacoes: optionalText,
    contato: zod_1.z
        .object({
        foneFixo: optionalText,
        celularPais: optionalText,
        celular: requiredWhatsapp,
        usarCelularContato: zod_1.z.boolean().default(false),
        celularContatoDe: optionalText,
        outrosTelefones: optionalText,
        email: optionalText,
        naoPossuiEmail: zod_1.z.boolean().default(false),
    }),
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
    complementares: zod_1.z
        .object({
        profissao: optionalText,
        localTrabalho: optionalText,
        tempoTrabalho: optionalText,
        nomePlano: optionalText,
        numeroPlano: optionalText,
    })
        .default({}),
    filiacao: zod_1.z
        .object({
        nomePai: optionalText,
        cpfPai: optionalText,
        rgPai: optionalText,
        profissaoPai: optionalText,
        nomeMae: optionalText,
        cpfMae: optionalText,
        rgMae: optionalText,
        profissaoMae: optionalText,
    })
        .default({}),
    representanteLegal: zod_1.z
        .object({
        nome: optionalText,
        cpf: optionalText,
        rg: optionalText,
        nascimento: optionalDate,
        telefone: optionalText,
    })
        .default({}),
});
exports.patientListQuerySchema = zod_1.z.object({
    search: optionalText,
});
exports.patientIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
