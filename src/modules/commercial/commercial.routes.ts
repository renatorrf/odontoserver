import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  quoteIdSchema,
  quoteListQuerySchema,
  quotePayloadSchema,
  quoteScheduleSchema,
  quoteSendSchema,
  quoteStatusSchema,
  redFolderPatientSchema,
  redFolderQuerySchema,
  retentionContactSchema,
} from './commercial.schemas';
import { listRedFolder, sendRetentionContact } from './commercial.service';
import { approveAndScheduleQuote, createQuote, getQuote, listQuotes, sendQuote, updateQuote, updateQuoteStatus } from './quote.service';

const router = Router();

router.get('/pasta-vermelha', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listRedFolder(req.auth!, redFolderQuerySchema.parse(req.query))) });
}));

router.post('/pasta-vermelha/:id/contato', asyncHandler(async (req, res) => {
  const { id } = redFolderPatientSchema.parse(req.params);
  const result = await sendRetentionContact(req.auth!, id, retentionContactSchema.parse(req.body));
  res.status(201).json({ success: true, ...result });
}));

router.get('/orcamentos', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listQuotes(req.auth!, quoteListQuerySchema.parse(req.query))) });
}));

router.post('/orcamentos', asyncHandler(async (req, res) => {
  const orcamento = await createQuote(req.auth!, quotePayloadSchema.parse(req.body));
  res.status(201).json({ success: true, orcamento });
}));

router.get('/orcamentos/:id', asyncHandler(async (req, res) => {
  const { id } = quoteIdSchema.parse(req.params);
  res.json({ success: true, orcamento: await getQuote(req.auth!, id) });
}));

router.put('/orcamentos/:id', asyncHandler(async (req, res) => {
  const { id } = quoteIdSchema.parse(req.params);
  res.json({ success: true, orcamento: await updateQuote(req.auth!, id, quotePayloadSchema.parse(req.body)) });
}));

router.patch('/orcamentos/:id/status', asyncHandler(async (req, res) => {
  const { id } = quoteIdSchema.parse(req.params);
  res.json({ success: true, orcamento: await updateQuoteStatus(req.auth!, id, quoteStatusSchema.parse(req.body)) });
}));

router.post('/orcamentos/:id/enviar', asyncHandler(async (req, res) => {
  const { id } = quoteIdSchema.parse(req.params);
  res.status(201).json({ success: true, ...(await sendQuote(req.auth!, id, quoteSendSchema.parse(req.body))) });
}));

router.post('/orcamentos/:id/aprovar-agendamento', asyncHandler(async (req, res) => {
  const { id } = quoteIdSchema.parse(req.params);
  res.status(201).json({
    success: true,
    ...(await approveAndScheduleQuote(req.auth!, id, quoteScheduleSchema.parse(req.body))),
  });
}));

export default router;
