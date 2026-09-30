"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const async_handler_1 = require("../../utils/async-handler");
const client_service_1 = require("./client.service");
const router = (0, express_1.Router)();
router.get('/me', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const patient = await (0, client_service_1.getClientProfile)(req.auth);
    res.json({
        success: true,
        patient,
    });
}));
router.get('/procedimentos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const procedures = await (0, client_service_1.listClientProcedures)(req.auth);
    res.json({
        success: true,
        procedures,
    });
}));
router.get('/agendamentos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, appointments: await (0, client_service_1.listClientAppointments)(req.auth) });
}));
const appointmentParamsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const appointmentAvailabilitySchema = zod_1.z.object({
    inicio: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dias: zod_1.z.coerce.number().int().min(1).max(31).default(14),
});
const appointmentRescheduleSchema = zod_1.z.object({
    inicioEm: zod_1.z.string().datetime({ offset: true }),
});
router.patch('/agendamentos/:id/confirmar', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = appointmentParamsSchema.parse(req.params);
    res.json({
        success: true,
        message: 'Horario confirmado.',
        appointment: await (0, client_service_1.confirmClientAppointment)(req.auth, id),
    });
}));
router.get('/agendamentos/:id/disponibilidade', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = appointmentParamsSchema.parse(req.params);
    const input = appointmentAvailabilitySchema.parse(req.query);
    res.json({
        success: true,
        disponibilidade: await (0, client_service_1.listClientAppointmentAvailability)(req.auth, id, input.inicio, input.dias),
    });
}));
router.patch('/agendamentos/:id/remarcar', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = appointmentParamsSchema.parse(req.params);
    const input = appointmentRescheduleSchema.parse(req.body);
    res.json({
        success: true,
        message: 'Retorno remarcado e confirmado.',
        appointment: await (0, client_service_1.rescheduleClientAppointment)(req.auth, id, input.inicioEm),
    });
}));
router.get('/notificacoes', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, notifications: await (0, client_service_1.listClientNotifications)(req.auth) });
}));
router.patch('/notificacoes/:id/lida', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = zod_1.z.object({ id: zod_1.z.string().uuid() }).parse(req.params);
    await (0, client_service_1.markClientNotificationRead)(req.auth, id);
    res.json({ success: true, message: 'Notificacao marcada como lida.' });
}));
exports.default = router;
