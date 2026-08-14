"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const async_handler_1 = require("../../utils/async-handler");
const procedure_schemas_1 = require("./procedure.schemas");
const procedure_service_1 = require("./procedure.service");
const router = (0, express_1.Router)();
router.get('/catalogo', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = procedure_schemas_1.catalogProcedureListQuerySchema.parse(req.query);
    res.json({ success: true, procedimentos: await (0, procedure_service_1.listCatalogProcedures)(req.auth, input) });
}));
router.post('/catalogo', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = procedure_schemas_1.catalogProcedureSchema.parse(req.body);
    res.status(201).json({ success: true, procedimento: await (0, procedure_service_1.createCatalogProcedure)(req.auth, input) });
}));
router.get('/catalogo/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = procedure_schemas_1.catalogProcedureIdSchema.parse(req.params);
    res.json({ success: true, procedimento: await (0, procedure_service_1.getCatalogProcedure)(req.auth, id) });
}));
router.put('/catalogo/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = procedure_schemas_1.catalogProcedureIdSchema.parse(req.params);
    const input = procedure_schemas_1.catalogProcedureSchema.parse(req.body);
    res.json({ success: true, procedimento: await (0, procedure_service_1.updateCatalogProcedure)(req.auth, id, input) });
}));
router.patch('/catalogo/:id/status', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = procedure_schemas_1.catalogProcedureIdSchema.parse(req.params);
    const input = procedure_schemas_1.catalogProcedureStatusSchema.parse(req.body);
    await (0, procedure_service_1.updateCatalogProcedureStatus)(req.auth, id, input);
    res.json({ success: true, message: input.ativo ? 'Procedimento reativado.' : 'Procedimento inativado.' });
}));
router.get('/', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const params = procedure_schemas_1.procedureListQuerySchema.parse(req.query);
    const procedures = await (0, procedure_service_1.listProcedures)(req.auth, params);
    res.json({
        success: true,
        procedures,
    });
}));
router.post('/', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = procedure_schemas_1.createProcedureSchema.parse(req.body);
    const procedure = await (0, procedure_service_1.createProcedure)(req.auth, payload);
    res.status(201).json({
        success: true,
        procedure,
    });
}));
exports.default = router;
