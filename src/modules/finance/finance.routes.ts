import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { requirePerfil } from '../../middlewares/auth';
import { requirePermission } from '../../middlewares/permissions';
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
  strategicDashboardQuerySchema,
  strategicCategoryDetailQuerySchema,
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
import { getStrategicDashboard, listStrategicCategoryProcedures } from './strategic-dashboard.service';
import { listOrthodonticFollowUps } from './orthodontics.service';
import { paymentReversalParamsSchema, paymentReversalSchema, quoteReceiptParamsSchema, quoteReceiptSchema, receivablesQuerySchema } from './receivables.schemas';
import { listReceivables, receiveQuote, reversePayment } from './receivables.service';
import {
  cashQuerySchema,
  ofxImportSchema,
  reconcileSchema,
  reconciliationQuerySchema,
  statementMovementParamsSchema,
  undoReconciliationSchema,
} from './cash-reconciliation.schemas';
import { getDailyCash } from './cash.service';
import { importOfx, listReconciliation, reconcileMovements, undoReconciliation } from './reconciliation.service';
import { badRequest } from '../../utils/http-error';

const router = Router();
const ofxUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });

router.get('/caixa', requirePermission('menu.caixa'), asyncHandler(async (req, res) => {
  const { data } = cashQuerySchema.parse(req.query);
  res.json({ success: true, ...(await getDailyCash(req.auth!, data)) });
}));

router.get('/conciliacao', requirePermission('menu.conciliacao'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listReconciliation(req.auth!, reconciliationQuerySchema.parse(req.query))) });
}));

router.post('/conciliacao/importar-ofx', requirePermission('financeiro.conciliacao.importar'), ofxUpload.single('arquivo'), asyncHandler(async (req, res) => {
  const { bancoId } = ofxImportSchema.parse(req.body);
  if (!req.file || path.extname(req.file.originalname).toLowerCase() !== '.ofx') {
    throw badRequest('Selecione um arquivo com extensao .ofx.');
  }
  const resultado = await importOfx(req.auth!, bancoId, req.file.originalname, req.file.buffer);
  res.status(201).json({ success: true, resultado,
    message: resultado.arquivoDuplicado ? 'Este arquivo ja havia sido importado.' : 'Extrato OFX importado.' });
}));

router.post('/conciliacao/vinculos', requirePermission('financeiro.conciliacao.conciliar'), asyncHandler(async (req, res) => {
  const resultado = await reconcileMovements(req.auth!, reconcileSchema.parse(req.body));
  res.status(201).json({ success: true, resultado, message: 'Movimentos conciliados.' });
}));

router.post('/conciliacao/movimentos/:id/desfazer', requirePermission('financeiro.conciliacao.desfazer.solicitar'), asyncHandler(async (req, res) => {
  const { id } = statementMovementParamsSchema.parse(req.params);
  const { justificativa } = undoReconciliationSchema.parse(req.body);
  const resultado = await undoReconciliation(req.auth!, id, justificativa);
  res.status(202).json({ success: true, resultado, message: 'Desfazer conciliacao enviado para autorizacao.' });
}));

router.get('/contas-receber', requirePermission('menu.contas_receber'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listReceivables(req.auth!, receivablesQuerySchema.parse(req.query))) });
}));

router.post('/orcamentos/:id/recebimentos', requirePermission('financeiro.recebimentos.registrar'), asyncHandler(async (req, res) => {
  const { id } = quoteReceiptParamsSchema.parse(req.params);
  const recebimento = await receiveQuote(req.auth!, id, quoteReceiptSchema.parse(req.body));
  const pending = 'pendenteAprovacao' in recebimento && recebimento.pendenteAprovacao;
  res.status(pending ? 202 : 201).json({ success: true, recebimento,
    message: pending ? 'Recebimento retroativo enviado para autorizacao.' : 'Recebimento registrado.' });
}));

router.post('/recebimentos/:id/estorno', requirePermission('financeiro.recebimentos.estornar'), asyncHandler(async (req, res) => {
  const { id } = paymentReversalParamsSchema.parse(req.params);
  const estorno = await reversePayment(req.auth!, id, paymentReversalSchema.parse(req.body));
  const pending = 'pendenteAprovacao' in estorno && estorno.pendenteAprovacao;
  res.status(pending ? 202 : 200).json({ success: true, estorno, message: pending
    ? 'Estorno retroativo enviado para autorizacao.'
    : 'Estorno interno registrado. Verifique separadamente o provedor quando aplicavel.' });
}));

router.get('/bancos', requirePermission('menu.bancos', 'menu.contas_receber', 'menu.conciliacao', 'menu.despesas', 'menu.apuracao'), asyncHandler(async (req, res) => {
  res.json({ success: true, bancos: await listBanks(req.auth!) });
}));

router.post('/bancos', requirePermission('financeiro.bancos.editar'), asyncHandler(async (req, res) => {
  const banco = await createBank(req.auth!, bankSchema.parse(req.body));
  res.status(201).json({ success: true, banco });
}));

router.put('/bancos/:id', requirePermission('financeiro.bancos.editar'), asyncHandler(async (req, res) => {
  const { id } = entityIdSchema.parse(req.params);
  const banco = await updateBank(req.auth!, id, bankSchema.parse(req.body));
  res.json({ success: true, banco });
}));

router.get('/despesas', requirePermission('menu.despesas'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listExpenses(req.auth!, expenseQuerySchema.parse(req.query))) });
}));

router.post('/despesas', requirePermission('financeiro.despesas.editar'), asyncHandler(async (req, res) => {
  const despesa = await createExpense(req.auth!, expenseSchema.parse(req.body));
  res.status(201).json({ success: true, despesa });
}));

router.put('/despesas/:id', requirePermission('financeiro.despesas.editar'), asyncHandler(async (req, res) => {
  const { id } = entityIdSchema.parse(req.params);
  const despesa = await updateExpense(req.auth!, id, updateExpenseSchema.parse(req.body));
  res.json({ success: true, despesa });
}));

router.delete('/despesas/:id', requirePermission('financeiro.despesas.editar'), asyncHandler(async (req, res) => {
  const { id } = entityIdSchema.parse(req.params);
  const { aplicarProximas } = deleteExpenseQuerySchema.parse(req.query);
  const quantidade = await cancelExpense(req.auth!, id, aplicarProximas);
  res.json({ success: true, quantidade, message: 'Despesa(s) excluida(s).' });
}));

router.patch('/despesas/:id/pagamento', requirePermission('financeiro.despesas.editar'), asyncHandler(async (req, res) => {
  const { id } = entityIdSchema.parse(req.params);
  const input = expensePaymentSchema.parse(req.body);
  const resultado = await updateExpensePayment(req.auth!, id, input);
  const pending = resultado.pendenteAprovacao;
  res.status(pending ? 202 : 200).json({ success: true, resultado,
    despesa: pending ? undefined : resultado.despesa,
    message: pending ? 'Pagamento retroativo enviado para autorizacao.'
      : input.status === 'paga' ? 'Pagamento confirmado.' : 'Despesa reaberta.' });
}));

router.get('/custo-operacional', requirePermission('menu.custo_basal'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getOperationalCost(req.auth!, reportQuerySchema.parse(req.query))) });
}));

router.put('/custo-operacional/configuracao', requirePermission('financeiro.despesas.editar'), asyncHandler(async (req, res) => {
  await saveOperationalCostConfig(req.auth!, operationalCostConfigSchema.parse(req.body));
  res.json({ success: true, message: 'Configuracao operacional atualizada.' });
}));

router.get('/dre', requirePermission('menu.dre'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getSimplifiedDre(req.auth!, reportQuerySchema.parse(req.query))) });
}));

router.get('/resultados', requirePermission('menu.resultados'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getOperationalResults(req.auth!, reportQuerySchema.parse(req.query))) });
}));

router.get('/painel-estrategico', requirePermission('menu.painel_estrategico'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getStrategicDashboard(req.auth!, strategicDashboardQuerySchema.parse(req.query))) });
}));

router.get('/painel-estrategico/categorias/detalhes', requirePermission('menu.painel_estrategico'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listStrategicCategoryProcedures(req.auth!, strategicCategoryDetailQuerySchema.parse(req.query))) });
}));

router.get('/ortodontia/retornos', requirePermission('menu.ortodontia'), asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listOrthodonticFollowUps(req.auth!)) });
}));

router.get(
  '/apuracao',
  requirePermission('menu.apuracao'),
  asyncHandler(async (req, res) => {
    const input = financeStatementQuerySchema.parse(req.query);
    const statement = await getFinanceStatement(req.auth!, input);
    res.json({ success: true, ...statement });
  }),
);

router.post(
  '/faturar',
  requirePermission('financeiro.pagamentos.registrar'),
  asyncHandler(async (req, res) => {
    const input = billProceduresSchema.parse(req.body);
    const quantidade = await billProcedures(req.auth!, input);
    res.status(201).json({ success: true, quantidade, message: 'Procedimentos faturados.' });
  }),
);

router.patch(
  '/lancamentos/:id/pagamento',
  requirePermission('financeiro.pagamentos.registrar'),
  asyncHandler(async (req, res) => {
    const { id } = financialEntryIdSchema.parse(req.params);
    const input = paymentStatusSchema.parse(req.body);
    const result = await updatePaymentStatus(req.auth!, id, input);
    const pending = result.pendenteAprovacao;
    res.status(pending ? 202 : 200).json({ success: true, resultado: result,
      message: pending ? 'Pagamento retroativo enviado para autorizacao.'
        : input.status === 'pago' ? 'Pagamento confirmado.' : 'Pagamento reaberto.' });
  }),
);

export default router;
