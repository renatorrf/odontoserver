"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const async_handler_1 = require("../../utils/async-handler");
const professional_schemas_1 = require("./professional.schemas");
const professional_service_1 = require("./professional.service");
const router = (0, express_1.Router)();
router.get('/', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = professional_schemas_1.professionalListQuerySchema.parse(req.query);
    const professionals = await (0, professional_service_1.listProfessionals)(req.auth, input);
    res.json({ success: true, professionals });
}));
router.post('/', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = professional_schemas_1.createProfessionalSchema.parse(req.body);
    const professional = await (0, professional_service_1.createProfessional)(req.auth, input);
    res.status(201).json({ success: true, professional });
}));
router.get('/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = professional_schemas_1.professionalIdParamSchema.parse(req.params);
    const professional = await (0, professional_service_1.getProfessional)(req.auth, id);
    res.json({ success: true, professional });
}));
router.put('/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = professional_schemas_1.professionalIdParamSchema.parse(req.params);
    const input = professional_schemas_1.createProfessionalSchema.parse(req.body);
    const professional = await (0, professional_service_1.updateProfessional)(req.auth, id, input);
    res.json({ success: true, professional });
}));
router.patch('/:id/inativar', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = professional_schemas_1.professionalIdParamSchema.parse(req.params);
    await (0, professional_service_1.inactivateProfessional)(req.auth, id);
    res.json({ success: true, message: 'Profissional inativado.' });
}));
router.put('/:id/comissao', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = professional_schemas_1.professionalIdParamSchema.parse(req.params);
    const input = professional_schemas_1.commissionSchema.parse(req.body);
    const commission = await (0, professional_service_1.saveCommission)(req.auth, id, input);
    res.json({ success: true, commission });
}));
exports.default = router;
