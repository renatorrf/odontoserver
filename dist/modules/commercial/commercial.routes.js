"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const async_handler_1 = require("../../utils/async-handler");
const commercial_schemas_1 = require("./commercial.schemas");
const commercial_service_1 = require("./commercial.service");
const quote_service_1 = require("./quote.service");
const router = (0, express_1.Router)();
router.get('/pasta-vermelha', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, commercial_service_1.listRedFolder)(req.auth, commercial_schemas_1.redFolderQuerySchema.parse(req.query))) });
}));
router.post('/pasta-vermelha/:id/contato', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = commercial_schemas_1.redFolderPatientSchema.parse(req.params);
    const result = await (0, commercial_service_1.sendRetentionContact)(req.auth, id, commercial_schemas_1.retentionContactSchema.parse(req.body));
    res.status(201).json({ success: true, ...result });
}));
router.get('/orcamentos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, quote_service_1.listQuotes)(req.auth, commercial_schemas_1.quoteListQuerySchema.parse(req.query))) });
}));
router.post('/orcamentos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const orcamento = await (0, quote_service_1.createQuote)(req.auth, commercial_schemas_1.quotePayloadSchema.parse(req.body));
    res.status(201).json({ success: true, orcamento });
}));
router.get('/orcamentos/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = commercial_schemas_1.quoteIdSchema.parse(req.params);
    res.json({ success: true, orcamento: await (0, quote_service_1.getQuote)(req.auth, id) });
}));
router.put('/orcamentos/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = commercial_schemas_1.quoteIdSchema.parse(req.params);
    res.json({ success: true, orcamento: await (0, quote_service_1.updateQuote)(req.auth, id, commercial_schemas_1.quotePayloadSchema.parse(req.body)) });
}));
router.patch('/orcamentos/:id/status', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = commercial_schemas_1.quoteIdSchema.parse(req.params);
    res.json({ success: true, orcamento: await (0, quote_service_1.updateQuoteStatus)(req.auth, id, commercial_schemas_1.quoteStatusSchema.parse(req.body)) });
}));
router.post('/orcamentos/:id/enviar', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = commercial_schemas_1.quoteIdSchema.parse(req.params);
    res.status(201).json({ success: true, ...(await (0, quote_service_1.sendQuote)(req.auth, id, commercial_schemas_1.quoteSendSchema.parse(req.body))) });
}));
router.post('/orcamentos/:id/aprovar-agendamento', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = commercial_schemas_1.quoteIdSchema.parse(req.params);
    res.status(201).json({
        success: true,
        ...(await (0, quote_service_1.approveAndScheduleQuote)(req.auth, id, commercial_schemas_1.quoteScheduleSchema.parse(req.body))),
    });
}));
exports.default = router;
