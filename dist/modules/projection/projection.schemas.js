"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendProjectionNotificationSchema = exports.projectionEventIdSchema = exports.projectionQuerySchema = void 0;
const zod_1 = require("zod");
const date = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
exports.projectionQuerySchema = zod_1.z
    .object({
    inicio: date,
    fim: date,
    profissionalId: zod_1.z.string().uuid().optional(),
})
    .refine((value) => value.inicio <= value.fim, {
    message: 'A data inicial deve ser anterior ou igual a data final.',
    path: ['fim'],
});
exports.projectionEventIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.sendProjectionNotificationSchema = zod_1.z.object({
    canais: zod_1.z.array(zod_1.z.enum(['aplicativo', 'whatsapp'])).min(1).max(2),
});
