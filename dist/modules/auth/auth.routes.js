"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middlewares/auth");
const async_handler_1 = require("../../utils/async-handler");
const auth_schemas_1 = require("./auth.schemas");
const auth_service_1 = require("./auth.service");
const router = (0, express_1.Router)();
router.post('/bootstrap-gestor', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schemas_1.bootstrapGestorSchema.parse(req.body);
    const result = await (0, auth_service_1.bootstrapGestor)(payload);
    res.status(201).json({
        success: true,
        ...result,
    });
}));
router.post('/login', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schemas_1.loginSchema.parse(req.body);
    const result = await (0, auth_service_1.login)(payload);
    res.json({
        success: true,
        ...result,
    });
}));
router.post('/paciente/login', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schemas_1.patientLoginSchema.parse(req.body);
    const result = await (0, auth_service_1.loginPaciente)(payload);
    res.json({
        success: true,
        ...result,
    });
}));
router.post('/alterar-senha', auth_1.authenticate, (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schemas_1.changePasswordSchema.parse(req.body);
    await (0, auth_service_1.changePassword)(req.auth, payload);
    res.json({
        success: true,
        message: 'Senha alterada com sucesso.',
    });
}));
router.post('/senha/solicitar-reset', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schemas_1.passwordResetRequestSchema.parse(req.body);
    await (0, auth_service_1.requestPasswordReset)(payload);
    res.json({
        success: true,
        message: 'Se houver um e-mail cadastrado, as instrucoes serao enviadas.',
    });
}));
router.post('/senha/resetar', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schemas_1.passwordResetConfirmSchema.parse(req.body);
    await (0, auth_service_1.resetPassword)(payload);
    res.json({
        success: true,
        message: 'Senha redefinida com sucesso.',
    });
}));
router.post('/gestores', auth_1.authenticate, (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schemas_1.createGestorSchema.parse(req.body);
    const result = await (0, auth_service_1.createGestor)(req.auth, payload);
    res.status(201).json({
        success: true,
        gestor: result,
    });
}));
exports.default = router;
