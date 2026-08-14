"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogProcedureStatusSchema = exports.catalogProcedureIdSchema = exports.catalogProcedureListQuerySchema = exports.catalogProcedureSchema = exports.procedureListQuerySchema = exports.createProcedureSchema = void 0;
const zod_1 = require("zod");
const optionalText = zod_1.z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), zod_1.z.string().trim().optional());
const optionalDate = zod_1.z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());
exports.createProcedureSchema = zod_1.z.object({
    pacienteId: zod_1.z.string().uuid(),
    profissionalId: zod_1.z.string().uuid().optional(),
    catalogoProcedimentoId: zod_1.z.string().uuid().optional(),
    dataProcedimento: optionalDate,
    descricao: zod_1.z.string().trim().min(2),
    dente: optionalText,
    profissionalNome: optionalText,
    valor: zod_1.z.coerce.number().nonnegative().optional(),
    observacoes: optionalText,
});
exports.procedureListQuerySchema = zod_1.z.object({
    pacienteId: zod_1.z.string().uuid(),
});
exports.catalogProcedureSchema = zod_1.z.object({
    codigo: optionalText,
    nome: zod_1.z.string().trim().min(2).max(160),
    descricao: optionalText,
    categoria: optionalText,
    duracaoMinutos: zod_1.z.coerce.number().int().min(5).max(480).default(30),
    valor: zod_1.z.coerce.number().finite().nonnegative().max(9999999999.99),
    custoVariavel: zod_1.z.coerce.number().finite().nonnegative().max(9999999999.99).default(0),
    ativo: zod_1.z.boolean().default(true),
});
exports.catalogProcedureListQuerySchema = zod_1.z.object({
    search: optionalText,
    status: zod_1.z.enum(['todos', 'ativos', 'inativos']).default('todos'),
});
exports.catalogProcedureIdSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
exports.catalogProcedureStatusSchema = zod_1.z.object({
    ativo: zod_1.z.boolean(),
});
