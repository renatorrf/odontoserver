import { Router } from 'express';
import { requirePerfil } from '../../middlewares/auth';
import { asyncHandler } from '../../utils/async-handler';
import {
  billProceduresSchema,
  financeStatementQuerySchema,
  financialEntryIdSchema,
  paymentStatusSchema,
} from './finance.schemas';
import { billProcedures, getFinanceStatement, updatePaymentStatus } from './finance.service';
import {
  bankSchema,
  deleteExpenseQuerySchema,
  entityIdSchema,
  expensePaymentSchema,
  expenseQuerySchema,
  expenseSchema,
  operationalCostConfigSchema,
  reportQuerySchema,
  updateExpenseSchema,
} from './management.schemas';
import {
  cancelExpense,
  createBank,
  createExpense,
  getOperationalCost,
  getOperationalResults,
  getSimplifiedDre,
  listBanks,
  listExpenses,
  saveOperationalCostConfig,
  updateBank,
  updateExpense,
  updateExpensePayment,
} from './management.service';
import { getStrategicDashboard } from './strategic-dashboard.service';
import { paymentReversalParamsSchema, paymentReversalSchema, quoteReceiptParamsSchema, quoteReceiptSchema, receivablesQuerySchema } from './receivables.schemas';
import { listReceivables, receiveQuote, reversePayment } from './receivables.service';

const router = Router();

router.get('/contas-receber', requirePerfil(['portal_admin', 'gestor']), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listReceivables(req.auth!, receivablesQuerySchema.parse(req.query))) });
}));

router.post('/orcamentos/:id/recebimentos', requirePerfil(['portal_admin', 'gestor']), asyncHandler(async (req, res) => {
  const { id } = quoteReceiptParamsSchema.parse(req.params);
  const recebimento = await receiveQuote(req.auth!, id, quoteReceiptSchema.parse(req.body));
  res.status(201).json({ success: true, recebimento, message: 'Recebimento registrado.' });
}));

router.post('/recebimentos/:id/estorno', requirePerfil(['portal_admin', 'gestor']), asyncHandler(async (req, res) => {
  const { id } = paymentReversalParamsSchema.parse(req.params);
  const estorno = await reversePayment(req.auth!, id, paymentReversalSchema.parse(req.body));
  res.json({ success: true, estorno, message: 'Estorno interno registrado. Verifique separadamente o provedor quando aplicavel.' });
}));

router.get('/bancos', asyncHandler(async (req, res) => {
  res.json({ success: true, bancos: await listBanks(req.auth!) });
}));

router.post('/bancos', asyncHandler(async (req, res) => {
  const banco = await createBank(req.auth!, bankSchema.parse(req.body));
  res.status(201).json({ success: true, banco });
}));

router.put('/bancos/:id', asyncHandler(async (req, res) => {
  const { id } = entityIdSchema.parse(req.params);
  const banco = await updateBank(req.auth!, id, bankSchema.parse(req.body));
  res.json({ success: true, banco });
}));

router.get('/despesas', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listExpenses(req.auth!, expenseQuerySchema.parse(req.query))) });
}));

router.post('/despesas', asyncHandler(async (req, res) => {
  const despesa = await createExpense(req.auth!, expenseSchema.parse(req.body));
  res.status(201).json({ success: true, despesa });
}));

router.put('/despesas/:id', asyncHandler(async (req, res) => {
  const { id } = entityIdSchema.parse(req.params);
  const despesa = await updateExpense(req.auth!, id, updateExpenseSchema.parse(req.body));
  res.json({ success: true, despesa });
}));

router.delete('/despesas/:id', asyncHandler(async (req, res) => {
  const { id } = entityIdSchema.parse(req.params);
  const { aplicarProximas } = deleteExpenseQuerySchema.parse(req.query);
  const quantidade = await cancelExpense(req.auth!, id, aplicarProximas);
  res.json({ success: true, quantidade, message: 'Despesa(s) excluida(s).' });
}));

router.patch('/despesas/:id/pagamento', asyncHandler(async (req, res) => {
  const { id } = entityIdSchema.parse(req.params);
  const despesa = await updateExpensePayment(req.auth!, id, expensePaymentSchema.parse(req.body));
  res.json({ success: true, despesa, message: despesa.status === 'paga' ? 'Pagamento confirmado.' : 'Despesa reaberta.' });
}));

router.get('/custo-operacional', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getOperationalCost(req.auth!, reportQuerySchema.parse(req.query))) });
}));

router.put('/custo-operacional/configuracao', asyncHandler(async (req, res) => {
  await saveOperationalCostConfig(req.auth!, operationalCostConfigSchema.parse(req.body));
  res.json({ success: true, message: 'Configuracao operacional atualizada.' });
}));

router.get('/dre', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getSimplifiedDre(req.auth!, reportQuerySchema.parse(req.query))) });
}));

router.get('/resultados', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getOperationalResults(req.auth!, reportQuerySchema.parse(req.query))) });
}));

router.get('/painel-estrategico', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getStrategicDashboard(req.auth!, reportQuerySchema.parse(req.query))) });
}));

router.get(
  '/apuracao',
  asyncHandler(async (req, res) => {
    const input = financeStatementQuerySchema.parse(req.query);
    const statement = await getFinanceStatement(req.auth!, input);
    res.json({ success: true, ...statement });
  }),
);

router.post(
  '/faturar',
  asyncHandler(async (req, res) => {
    const input = billProceduresSchema.parse(req.body);
    const quantidade = await billProcedures(req.auth!, input);
    res.status(201).json({ success: true, quantidade, message: 'Procedimentos faturados.' });
  }),
);

router.patch(
  '/lancamentos/:id/pagamento',
  asyncHandler(async (req, res) => {
    const { id } = financialEntryIdSchema.parse(req.params);
    const input = paymentStatusSchema.parse(req.body);
    await updatePaymentStatus(req.auth!, id, input);
    res.json({ success: true, message: input.status === 'pago' ? 'Pagamento confirmado.' : 'Pagamento reaberto.' });
  }),
);

export default router;
