"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const async_handler_1 = require("../../utils/async-handler");
const projection_schemas_1 = require("./projection.schemas");
const projection_service_1 = require("./projection.service");
const router = (0, express_1.Router)();
router.get('/procedimentos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = projection_schemas_1.projectionQuerySchema.parse(req.query);
    res.json({ success: true, ...(await (0, projection_service_1.getRevenueProjection)(req.auth, input)) });
}));
router.post('/eventos/:id/notificacoes', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = projection_schemas_1.projectionEventIdSchema.parse(req.params);
    const input = projection_schemas_1.sendProjectionNotificationSchema.parse(req.body);
    const resultados = await (0, projection_service_1.sendProjectionNotification)(req.auth, id, input);
    res.status(201).json({ success: true, resultados });
}));
exports.default = router;
