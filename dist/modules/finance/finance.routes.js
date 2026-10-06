"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const node_path_1 = __importDefault(require("node:path"));
const permissions_1 = require("../../middlewares/permissions");
const async_handler_1 = require("../../utils/async-handler");
const finance_schemas_1 = require("./finance.schemas");
const finance_service_1 = require("./finance.service");
const management_schemas_1 = require("./management.schemas");
const management_service_1 = require("./management.service");
const strategic_dashboard_service_1 = require("./strategic-dashboard.service");
const orthodontics_service_1 = require("./orthodontics.service");
const receivables_schemas_1 = require("./receivables.schemas");
const receivables_service_1 = require("./receivables.service");
const cash_reconciliation_schemas_1 = require("./cash-reconciliation.schemas");
const cash_service_1 = require("./cash.service");
const reconciliation_service_1 = require("./reconciliation.service");
const http_error_1 = require("../../utils/http-error");
const router = (0, express_1.Router)();
const ofxUpload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
router.get('/caixa', (0, permissions_1.requirePermission)('menu.caixa'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { data } = cash_reconciliation_schemas_1.cashQuerySchema.parse(req.query);
    res.json({ success: true, ...(await (0, cash_service_1.getDailyCash)(req.auth, data)) });
}));
router.get('/conciliacao', (0, permissions_1.requirePermission)('menu.conciliacao'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, reconciliation_service_1.listReconciliation)(req.auth, cash_reconciliation_schemas_1.reconciliationQuerySchema.parse(req.query))) });
}));
router.post('/conciliacao/importar-ofx', (0, permissions_1.requirePermission)('financeiro.conciliacao.importar'), ofxUpload.single('arquivo'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { bancoId } = cash_reconciliation_schemas_1.ofxImportSchema.parse(req.body);
    if (!req.file || node_path_1.default.extname(req.file.originalname).toLowerCase() !== '.ofx') {
        throw (0, http_error_1.badRequest)('Selecione um arquivo com extensao .ofx.');
    }
    const resultado = await (0, reconciliation_service_1.importOfx)(req.auth, bancoId, req.file.originalname, req.file.buffer);
    res.status(201).json({ success: true, resultado,
        message: resultado.arquivoDuplicado ? 'Este arquivo ja havia sido importado.' : 'Extrato OFX importado.' });
}));
router.post('/conciliacao/vinculos', (0, permissions_1.requirePermission)('financeiro.conciliacao.conciliar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const resultado = await (0, reconciliation_service_1.reconcileMovements)(req.auth, cash_reconciliation_schemas_1.reconcileSchema.parse(req.body));
    res.status(201).json({ success: true, resultado, message: 'Movimentos conciliados.' });
}));
router.post('/conciliacao/movimentos/:id/desfazer', (0, permissions_1.requirePermission)('financeiro.conciliacao.desfazer.solicitar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = cash_reconciliation_schemas_1.statementMovementParamsSchema.parse(req.params);
    const { justificativa } = cash_reconciliation_schemas_1.undoReconciliationSchema.parse(req.body);
    const resultado = await (0, reconciliation_service_1.undoReconciliation)(req.auth, id, justificativa);
    res.status(202).json({ success: true, resultado, message: 'Desfazer conciliacao enviado para autorizacao.' });
}));
router.get('/contas-receber', (0, permissions_1.requirePermission)('menu.contas_receber'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, receivables_service_1.listReceivables)(req.auth, receivables_schemas_1.receivablesQuerySchema.parse(req.query))) });
}));
router.post('/orcamentos/:id/recebimentos', (0, permissions_1.requirePermission)('financeiro.recebimentos.registrar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = receivables_schemas_1.quoteReceiptParamsSchema.parse(req.params);
    const recebimento = await (0, receivables_service_1.receiveQuote)(req.auth, id, receivables_schemas_1.quoteReceiptSchema.parse(req.body));
    const pending = 'pendenteAprovacao' in recebimento && recebimento.pendenteAprovacao;
    res.status(pending ? 202 : 201).json({ success: true, recebimento,
        message: pending ? 'Recebimento retroativo enviado para autorizacao.' : 'Recebimento registrado.' });
}));
router.post('/recebimentos/:id/estorno', (0, permissions_1.requirePermission)('financeiro.recebimentos.estornar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = receivables_schemas_1.paymentReversalParamsSchema.parse(req.params);
    const estorno = await (0, receivables_service_1.reversePayment)(req.auth, id, receivables_schemas_1.paymentReversalSchema.parse(req.body));
    const pending = 'pendenteAprovacao' in estorno && estorno.pendenteAprovacao;
    res.status(pending ? 202 : 200).json({ success: true, estorno, message: pending
            ? 'Estorno retroativo enviado para autorizacao.'
            : 'Estorno interno registrado. Verifique separadamente o provedor quando aplicavel.' });
}));
router.get('/bancos', (0, permissions_1.requirePermission)('menu.bancos', 'menu.contas_receber', 'menu.conciliacao', 'menu.despesas', 'menu.apuracao'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, bancos: await (0, management_service_1.listBanks)(req.auth) });
}));
router.post('/bancos', (0, permissions_1.requirePermission)('financeiro.bancos.editar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const banco = await (0, management_service_1.createBank)(req.auth, management_schemas_1.bankSchema.parse(req.body));
    res.status(201).json({ success: true, banco });
}));
router.put('/bancos/:id', (0, permissions_1.requirePermission)('financeiro.bancos.editar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = management_schemas_1.entityIdSchema.parse(req.params);
    const banco = await (0, management_service_1.updateBank)(req.auth, id, management_schemas_1.bankSchema.parse(req.body));
    res.json({ success: true, banco });
}));
router.get('/despesas', (0, permissions_1.requirePermission)('menu.despesas'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, management_service_1.listExpenses)(req.auth, management_schemas_1.expenseQuerySchema.parse(req.query))) });
}));
router.post('/despesas', (0, permissions_1.requirePermission)('financeiro.despesas.editar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const despesa = await (0, management_service_1.createExpense)(req.auth, management_schemas_1.expenseSchema.parse(req.body));
    res.status(201).json({ success: true, despesa });
}));
router.put('/despesas/:id', (0, permissions_1.requirePermission)('financeiro.despesas.editar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = management_schemas_1.entityIdSchema.parse(req.params);
    const despesa = await (0, management_service_1.updateExpense)(req.auth, id, management_schemas_1.updateExpenseSchema.parse(req.body));
    res.json({ success: true, despesa });
}));
router.delete('/despesas/:id', (0, permissions_1.requirePermission)('financeiro.despesas.editar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = management_schemas_1.entityIdSchema.parse(req.params);
    const { aplicarProximas } = management_schemas_1.deleteExpenseQuerySchema.parse(req.query);
    const quantidade = await (0, management_service_1.cancelExpense)(req.auth, id, aplicarProximas);
    res.json({ success: true, quantidade, message: 'Despesa(s) excluida(s).' });
}));
router.patch('/despesas/:id/pagamento', (0, permissions_1.requirePermission)('financeiro.despesas.editar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = management_schemas_1.entityIdSchema.parse(req.params);
    const input = management_schemas_1.expensePaymentSchema.parse(req.body);
    const resultado = await (0, management_service_1.updateExpensePayment)(req.auth, id, input);
    const pending = resultado.pendenteAprovacao;
    res.status(pending ? 202 : 200).json({ success: true, resultado,
        despesa: pending ? undefined : resultado.despesa,
        message: pending ? 'Pagamento retroativo enviado para autorizacao.'
            : input.status === 'paga' ? 'Pagamento confirmado.' : 'Despesa reaberta.' });
}));
router.get('/custo-operacional', (0, permissions_1.requirePermission)('menu.custo_basal'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, management_service_1.getOperationalCost)(req.auth, management_schemas_1.reportQuerySchema.parse(req.query))) });
}));
router.put('/custo-operacional/configuracao', (0, permissions_1.requirePermission)('financeiro.despesas.editar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    await (0, management_service_1.saveOperationalCostConfig)(req.auth, management_schemas_1.operationalCostConfigSchema.parse(req.body));
    res.json({ success: true, message: 'Configuracao operacional atualizada.' });
}));
router.get('/dre', (0, permissions_1.requirePermission)('menu.dre'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, management_service_1.getSimplifiedDre)(req.auth, management_schemas_1.reportQuerySchema.parse(req.query))) });
}));
router.get('/resultados', (0, permissions_1.requirePermission)('menu.resultados'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, management_service_1.getOperationalResults)(req.auth, management_schemas_1.reportQuerySchema.parse(req.query))) });
}));
router.get('/painel-estrategico', (0, permissions_1.requirePermission)('menu.painel_estrategico'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, strategic_dashboard_service_1.getStrategicDashboard)(req.auth, management_schemas_1.strategicDashboardQuerySchema.parse(req.query))) });
}));
router.get('/painel-estrategico/categorias/detalhes', (0, permissions_1.requirePermission)('menu.painel_estrategico'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, strategic_dashboard_service_1.listStrategicCategoryProcedures)(req.auth, management_schemas_1.strategicCategoryDetailQuerySchema.parse(req.query))) });
}));
router.get('/ortodontia/retornos', (0, permissions_1.requirePermission)('menu.ortodontia'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, orthodontics_service_1.listOrthodonticFollowUps)(req.auth)) });
}));
router.get('/apuracao', (0, permissions_1.requirePermission)('menu.apuracao'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = finance_schemas_1.financeStatementQuerySchema.parse(req.query);
    const statement = await (0, finance_service_1.getFinanceStatement)(req.auth, input);
    res.json({ success: true, ...statement });
}));
router.post('/faturar', (0, permissions_1.requirePermission)('financeiro.pagamentos.registrar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = finance_schemas_1.billProceduresSchema.parse(req.body);
    const quantidade = await (0, finance_service_1.billProcedures)(req.auth, input);
    res.status(201).json({ success: true, quantidade, message: 'Procedimentos faturados.' });
}));
router.patch('/lancamentos/:id/pagamento', (0, permissions_1.requirePermission)('financeiro.pagamentos.registrar'), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = finance_schemas_1.financialEntryIdSchema.parse(req.params);
    const input = finance_schemas_1.paymentStatusSchema.parse(req.body);
    const result = await (0, finance_service_1.updatePaymentStatus)(req.auth, id, input);
    const pending = result.pendenteAprovacao;
    res.status(pending ? 202 : 200).json({ success: true, resultado: result,
        message: pending ? 'Pagamento retroativo enviado para autorizacao.'
            : input.status === 'pago' ? 'Pagamento confirmado.' : 'Pagamento reaberto.' });
}));
exports.default = router;
