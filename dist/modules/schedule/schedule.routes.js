"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const async_handler_1 = require("../../utils/async-handler");
const schedule_schemas_1 = require("./schedule.schemas");
const availability_service_1 = require("./availability.service");
const schedule_service_1 = require("./schedule.service");
const router = (0, express_1.Router)();
router.get('/disponibilidade', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = schedule_schemas_1.availabilityQuerySchema.parse(req.query);
    res.json({ success: true, disponibilidade: await (0, availability_service_1.listProfessionalAvailability)(req.auth, input) });
}));
router.get('/eventos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = schedule_schemas_1.scheduleQuerySchema.parse(req.query);
    res.json({ success: true, eventos: await (0, schedule_service_1.listEvents)(req.auth, input) });
}));
router.post('/eventos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = schedule_schemas_1.scheduleEventSchema.parse(req.body);
    res.status(201).json({ success: true, evento: await (0, schedule_service_1.createEvent)(req.auth, input) });
}));
router.get('/eventos/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = schedule_schemas_1.eventIdSchema.parse(req.params);
    res.json({ success: true, evento: await (0, schedule_service_1.getEvent)(req.auth, id) });
}));
router.put('/eventos/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = schedule_schemas_1.eventIdSchema.parse(req.params);
    const input = schedule_schemas_1.scheduleEventSchema.parse(req.body);
    res.json({ success: true, evento: await (0, schedule_service_1.updateEvent)(req.auth, id, input) });
}));
router.patch('/eventos/:id/status', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = schedule_schemas_1.eventIdSchema.parse(req.params);
    const input = schedule_schemas_1.eventStatusSchema.parse(req.body);
    await (0, schedule_service_1.updateEventStatus)(req.auth, id, input);
    res.json({ success: true, message: 'Status do agendamento atualizado.', evento: await (0, schedule_service_1.getEvent)(req.auth, id) });
}));
router.get('/alertas-retorno', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = schedule_schemas_1.returnAlertQuerySchema.parse(req.query);
    res.json({ success: true, alertas: await (0, schedule_service_1.listReturnAlerts)(req.auth, input) });
}));
router.post('/alertas-retorno', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = schedule_schemas_1.returnAlertSchema.parse(req.body);
    res.status(201).json({ success: true, alerta: await (0, schedule_service_1.createReturnAlert)(req.auth, input) });
}));
router.patch('/alertas-retorno/:id/status', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = schedule_schemas_1.eventIdSchema.parse(req.params);
    const input = schedule_schemas_1.returnAlertStatusSchema.parse(req.body);
    await (0, schedule_service_1.updateReturnAlertStatus)(req.auth, id, input);
    res.json({ success: true, message: 'Alerta de retorno atualizado.' });
}));
exports.default = router;
