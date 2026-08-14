"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordResetConfirmSchema = exports.passwordResetRequestSchema = exports.changePasswordSchema = exports.createGestorSchema = exports.patientLoginSchema = exports.loginSchema = exports.bootstrapGestorSchema = void 0;
const zod_1 = require("zod");
const optionalText = zod_1.z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), zod_1.z.string().trim().optional());
exports.bootstrapGestorSchema = zod_1.z.object({
    empresa: zod_1.z.object({
        nomeFantasia: zod_1.z.string().trim().min(2),
        razaoSocial: optionalText,
        cnpj: optionalText,
        email: optionalText,
        telefone: optionalText,
    }),
    gestor: zod_1.z.object({
        nome: zod_1.z.string().trim().min(2),
        login: zod_1.z.string().trim().min(3),
        email: optionalText,
        cpf: optionalText,
        telefone: optionalText,
        password: zod_1.z.string().min(6),
    }),
});
exports.loginSchema = zod_1.z.object({
    login: zod_1.z.string().trim().min(3),
    password: zod_1.z.string().min(1),
    empresaId: zod_1.z.string().uuid().optional(),
});
exports.patientLoginSchema = zod_1.z.object({
    cpf: zod_1.z.string().trim().min(11),
    password: zod_1.z.string().min(1),
    empresaId: zod_1.z.string().uuid().optional(),
});
exports.createGestorSchema = zod_1.z.object({
    nome: zod_1.z.string().trim().min(2),
    login: zod_1.z.string().trim().min(3),
    email: optionalText,
    cpf: optionalText,
    telefone: optionalText,
    password: zod_1.z.string().min(6),
    perfil: zod_1.z.enum(['gestor', 'dentista', 'atendente']).default('gestor'),
    master: zod_1.z.boolean().default(false),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8),
});
exports.passwordResetRequestSchema = zod_1.z.object({
    email: optionalText,
    cpf: optionalText,
    login: optionalText,
});
exports.passwordResetConfirmSchema = zod_1.z.object({
    token: zod_1.z.string().trim().min(32),
    newPassword: zod_1.z.string().min(8),
});
