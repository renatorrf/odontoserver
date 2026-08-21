"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middlewares/auth");
const async_handler_1 = require("../../utils/async-handler");
const finance_schemas_1 = require("./finance.schemas");
const finance_service_1 = require("./finance.service");
const management_schemas_1 = require("./management.schemas");
const management_service_1 = require("./management.service");
const strategic_dashboard_service_1 = require("./strategic-dashboard.service");
const receivables_schemas_1 = require("./receivables.schemas");
const receivables_service_1 = require("./receivables.service");
const router = (0, express_1.Router)();
router.get('/contas-receber', (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, receivables_service_1.listReceivables)(req.auth, receivables_schemas_1.receivablesQuerySchema.parse(req.query))) });
}));
router.post('/orcamentos/:id/recebimentos', (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = receivables_schemas_1.quoteReceiptParamsSchema.parse(req.params);
    const recebimento = await (0, receivables_service_1.receiveQuote)(req.auth, id, receivables_schemas_1.quoteReceiptSchema.parse(req.body));
    res.status(201).json({ success: true, recebimento, message: 'Recebimento registrado.' });
}));
router.post('/recebimentos/:id/estorno', (0, auth_1.requirePerfil)(['portal_admin', 'gestor']), (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = receivables_schemas_1.paymentReversalParamsSchema.parse(req.params);
    const estorno = await (0, receivables_service_1.reversePayment)(req.auth, id, receivables_schemas_1.paymentReversalSchema.parse(req.body));
    res.json({ success: true, estorno, message: 'Estorno interno registrado. Verifique separadamente o provedor quando aplicavel.' });
}));
router.get('/bancos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, bancos: await (0, management_service_1.listBanks)(req.auth) });
}));
router.post('/bancos', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const banco = await (0, management_service_1.createBank)(req.auth, management_schemas_1.bankSchema.parse(req.body));
    res.status(201).json({ success: true, banco });
}));
router.put('/bancos/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = management_schemas_1.entityIdSchema.parse(req.params);
    const banco = await (0, management_service_1.updateBank)(req.auth, id, management_schemas_1.bankSchema.parse(req.body));
    res.json({ success: true, banco });
}));
router.get('/despesas', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, management_service_1.listExpenses)(req.auth, management_schemas_1.expenseQuerySchema.parse(req.query))) });
}));
router.post('/despesas', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const despesa = await (0, management_service_1.createExpense)(req.auth, management_schemas_1.expenseSchema.parse(req.body));
    res.status(201).json({ success: true, despesa });
}));
router.put('/despesas/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = management_schemas_1.entityIdSchema.parse(req.params);
    const despesa = await (0, management_service_1.updateExpense)(req.auth, id, management_schemas_1.updateExpenseSchema.parse(req.body));
    res.json({ success: true, despesa });
}));
router.delete('/despesas/:id', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = management_schemas_1.entityIdSchema.parse(req.params);
    const { aplicarProximas } = management_schemas_1.deleteExpenseQuerySchema.parse(req.query);
    const quantidade = await (0, management_service_1.cancelExpense)(req.auth, id, aplicarProximas);
    res.json({ success: true, quantidade, message: 'Despesa(s) excluida(s).' });
}));
router.patch('/despesas/:id/pagamento', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = management_schemas_1.entityIdSchema.parse(req.params);
    const despesa = await (0, management_service_1.updateExpensePayment)(req.auth, id, management_schemas_1.expensePaymentSchema.parse(req.body));
    res.json({ success: true, despesa, message: despesa.status === 'paga' ? 'Pagamento confirmado.' : 'Despesa reaberta.' });
}));
router.get('/custo-operacional', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, management_service_1.getOperationalCost)(req.auth, management_schemas_1.reportQuerySchema.parse(req.query))) });
}));
router.put('/custo-operacional/configuracao', (0, async_handler_1.asyncHandler)(async (req, res) => {
    await (0, management_service_1.saveOperationalCostConfig)(req.auth, management_schemas_1.operationalCostConfigSchema.parse(req.body));
    res.json({ success: true, message: 'Configuracao operacional atualizada.' });
}));
router.get('/dre', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, management_service_1.getSimplifiedDre)(req.auth, management_schemas_1.reportQuerySchema.parse(req.query))) });
}));
router.get('/resultados', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, management_service_1.getOperationalResults)(req.auth, management_schemas_1.reportQuerySchema.parse(req.query))) });
}));
router.get('/painel-estrategico', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, strategic_dashboard_service_1.getStrategicDashboard)(req.auth, management_schemas_1.reportQuerySchema.parse(req.query))) });
}));
router.get('/painel-estrategico/categorias/detalhes', (0, async_handler_1.asyncHandler)(async (req, res) => {
    res.json({ success: true, ...(await (0, strategic_dashboard_service_1.listStrategicCategoryProcedures)(req.auth, management_schemas_1.strategicCategoryDetailQuerySchema.parse(req.query))) });
}));
router.get('/apuracao', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = finance_schemas_1.financeStatementQuerySchema.parse(req.query);
    const statement = await (0, finance_service_1.getFinanceStatement)(req.auth, input);
    res.json({ success: true, ...statement });
}));
router.post('/faturar', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const input = finance_schemas_1.billProceduresSchema.parse(req.body);
    const quantidade = await (0, finance_service_1.billProcedures)(req.auth, input);
    res.status(201).json({ success: true, quantidade, message: 'Procedimentos faturados.' });
}));
router.patch('/lancamentos/:id/pagamento', (0, async_handler_1.asyncHandler)(async (req, res) => {
    const { id } = finance_schemas_1.financialEntryIdSchema.parse(req.params);
    const input = finance_schemas_1.paymentStatusSchema.parse(req.body);
    await (0, finance_service_1.updatePaymentStatus)(req.auth, id, input);
    res.json({ success: true, message: input.status === 'pago' ? 'Pagamento confirmado.' : 'Pagamento reaberto.' });
}));
exports.default = router;
