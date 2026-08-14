"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const env_1 = require("./config/env");
const auth_1 = require("./middlewares/auth");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const client_routes_1 = __importDefault(require("./modules/client/client.routes"));
const commercial_routes_1 = __importDefault(require("./modules/commercial/commercial.routes"));
const finance_routes_1 = __importDefault(require("./modules/finance/finance.routes"));
const patient_routes_1 = __importDefault(require("./modules/patients/patient.routes"));
const professional_routes_1 = __importDefault(require("./modules/professionals/professional.routes"));
const procedure_routes_1 = __importDefault(require("./modules/procedures/procedure.routes"));
const projection_routes_1 = __importDefault(require("./modules/projection/projection.routes"));
const schedule_routes_1 = __importDefault(require("./modules/schedule/schedule.routes"));
const http_error_1 = require("./utils/http-error");
exports.app = (0, express_1.default)();
exports.app.use((0, cors_1.default)({
    origin: env_1.env.corsOrigin,
}));
exports.app.use(express_1.default.json({ limit: '1mb' }));
exports.app.get('/health', (_req, res) => {
    res.json({
        success: true,
        service: 'odonto-backend',
        timestamp: new Date().toISOString(),
    });
});
exports.app.use('/api/auth', auth_routes_1.default);
exports.app.use('/api/pacientes', auth_1.authenticate, (0, auth_1.requirePerfil)(['portal_admin', 'gestor', 'dentista', 'atendente']), patient_routes_1.default);
exports.app.use('/api/profissionais', auth_1.authenticate, (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), professional_routes_1.default);
exports.app.use('/api/agenda', auth_1.authenticate, (0, auth_1.requirePerfil)(['portal_admin', 'gestor', 'dentista', 'atendente']), schedule_routes_1.default);
exports.app.use('/api/procedimentos', auth_1.authenticate, (0, auth_1.requirePerfil)(['portal_admin', 'gestor', 'dentista', 'atendente']), procedure_routes_1.default);
exports.app.use('/api/financeiro', auth_1.authenticate, (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), finance_routes_1.default);
exports.app.use('/api/projecao', auth_1.authenticate, (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), projection_routes_1.default);
exports.app.use('/api/comercial', auth_1.authenticate, (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), commercial_routes_1.default);
exports.app.use('/api/cliente', auth_1.authenticate, (0, auth_1.requirePerfil)(['paciente']), client_routes_1.default);
exports.app.use((_req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota nao encontrada.',
    });
});
exports.app.use((error, _req, res, _next) => {
    if (error instanceof multer_1.default.MulterError) {
        res.status(400).json({
            success: false,
            message: error.code === 'LIMIT_FILE_SIZE' ? 'O arquivo deve ter no maximo 10 MB.' : 'Falha ao receber o arquivo.',
        });
        return;
    }
    if (error instanceof zod_1.ZodError) {
        const firstIssue = error.issues[0];
        res.status(400).json({
            success: false,
            message: firstIssue?.message || 'Dados invalidos.',
            details: error.flatten(),
        });
        return;
    }
    if (error instanceof http_error_1.HttpError) {
        res.status(error.statusCode).json({
            success: false,
            message: error.message,
            details: error.details,
        });
        return;
    }
    console.error(error);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor.',
    });
});
