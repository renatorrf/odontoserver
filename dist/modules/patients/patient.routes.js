"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../../middlewares/auth");
const async_handler_1 = require("../../utils/async-handler");
const patient_schemas_1 = require("./patient.schemas");
const patient_service_1 = require("./patient.service");
const patient_tabs_schemas_1 = require("./patient-tabs.schemas");
const patient_tabs_service_1 = require("./patient-tabs.service");
const router = (0, express_1.Router)();
const documentUpload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
router.get('/', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const query = patient_schemas_1.patientListQuerySchema.parse(req.query);
    const patients = await (0, patient_service_1.listPatients)(req.auth, query);
    res.json({
        success: true,
        patients,
    });
}));
router.post('/', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const payload = patient_schemas_1.createPatientSchema.parse(req.body);
    const patient = await (0, patient_service_1.createPatient)(req.auth, payload);
    res.status(201).json({
        success: true,
        patient,
    });
}));
router.get('/:id/resumo-abas', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    res.json({ success: true, ...(await (0, patient_tabs_service_1.getPatientTabSummary)(req.auth, id)) });
}));
router.get('/:id/orcamentos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    res.json({ success: true, orcamentos: await (0, patient_tabs_service_1.listPatientQuotes)(req.auth, id) });
}));
router.post('/:id/orcamentos/:quoteId/duplicar', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id, quoteId } = patient_tabs_schemas_1.patientQuoteParamsSchema.parse(req.params);
    const orcamento = await (0, patient_tabs_service_1.duplicatePatientQuote)(req.auth, id, quoteId);
    res.status(201).json({ success: true, orcamento });
}));
router.patch('/:id/orcamentos/:quoteId/itens/:itemId/status', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id, quoteId, itemId } = patient_tabs_schemas_1.patientQuoteItemParamsSchema.parse(req.params);
    const { status } = patient_tabs_schemas_1.quoteItemStatusSchema.parse(req.body);
    await (0, patient_tabs_service_1.updateQuoteItemStatus)(req.auth, id, quoteId, itemId, status);
    res.json({ success: true, message: 'Status do procedimento atualizado.' });
}));
router.get('/:id/financeiro', (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    res.json({ success: true, ...(await (0, patient_tabs_service_1.listPatientFinancial)(req.auth, id)) });
}));
router.post('/:id/financeiro', (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    const lancamento = await (0, patient_tabs_service_1.createPatientFinancialEntry)(req.auth, id, patient_tabs_schemas_1.patientFinancialEntrySchema.parse(req.body));
    res.status(201).json({ success: true, lancamento });
}));
router.get('/:id/documentos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    res.json({ success: true, documentos: await (0, patient_tabs_service_1.listPatientDocuments)(req.auth, id) });
}));
router.post('/:id/documentos', documentUpload.single('arquivo'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    const documento = await (0, patient_tabs_service_1.savePatientDocument)(req.auth, id, req.file, patient_tabs_schemas_1.patientDocumentMetadataSchema.parse(req.body));
    res.status(201).json({ success: true, documento });
}));
router.put('/:id/documentos/:documentId', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id, documentId } = patient_tabs_schemas_1.patientDocumentParamsSchema.parse(req.params);
    await (0, patient_tabs_service_1.updatePatientDocument)(req.auth, id, documentId, patient_tabs_schemas_1.patientDocumentUpdateSchema.parse(req.body));
    res.json({ success: true, message: 'Documento atualizado.' });
}));
router.delete('/:id/documentos/:documentId', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id, documentId } = patient_tabs_schemas_1.patientDocumentParamsSchema.parse(req.params);
    await (0, patient_tabs_service_1.deletePatientDocument)(req.auth, id, documentId);
    res.json({ success: true, message: 'Documento excluido.' });
}));
router.get('/:id/documentos/:documentId/arquivo', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id, documentId } = patient_tabs_schemas_1.patientDocumentParamsSchema.parse(req.params);
    const file = await (0, patient_tabs_service_1.getPatientDocumentFile)(req.auth, id, documentId);
    res.type(file.mimeType);
    res.download(file.fullPath, file.fileName);
}));
router.get('/:id/anamnese', (0, auth_1.requirePerfil)(['portal_admin', 'gestor', 'dentista']), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    res.json({ success: true, ...(await (0, patient_tabs_service_1.listPatientAnamneses)(req.auth, id)) });
}));
router.post('/:id/anamnese', (0, auth_1.requirePerfil)(['portal_admin', 'gestor', 'dentista']), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    const anamnese = await (0, patient_tabs_service_1.createPatientAnamnesis)(req.auth, id, patient_tabs_schemas_1.patientAnamnesisSchema.parse(req.body));
    res.status(201).json({ success: true, anamnese });
}));
router.get('/:id/agendamentos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = patient_schemas_1.patientIdParamSchema.parse(req.params);
    const input = patient_tabs_schemas_1.patientAppointmentsQuerySchema.parse(req.query);
    res.json({ success: true, agendamentos: await (0, patient_tabs_service_1.listPatientAppointments)(req.auth, id, input) });
}));
router.get('/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const params = patient_schemas_1.patientIdParamSchema.parse(req.params);
    const patient = await (0, patient_service_1.getPatient)(req.auth, params.id);
    res.json({
        success: true,
        patient,
    });
}));
router.put('/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const params = patient_schemas_1.patientIdParamSchema.parse(req.params);
    const payload = patient_schemas_1.createPatientSchema.parse(req.body);
    const patient = await (0, patient_service_1.updatePatient)(req.auth, params.id, payload);
    res.json({
        success: true,
        patient,
    });
}));
router.patch('/:id/inativar', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const params = patient_schemas_1.patientIdParamSchema.parse(req.params);
    await (0, patient_service_1.inactivatePatient)(req.auth, params.id);
    res.json({
        success: true,
        message: 'Paciente inativado.',
    });
}));
exports.default = router;
