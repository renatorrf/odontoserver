import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  projectionEventIdSchema,
  projectionQuerySchema,
  sendProjectionNotificationSchema,
} from './projection.schemas';
import { getRevenueProjection, sendProjectionNotification } from './projection.service';

const router = Router();

router.get('/procedimentos', asyncHandler(async (req, res) => {
  const input = projectionQuerySchema.parse(req.query);
  res.json({ success: true, ...(await getRevenueProjection(req.auth!, input)) });
}));

router.post('/eventos/:id/notificacoes', asyncHandler(async (req, res) => {
  const { id } = projectionEventIdSchema.parse(req.params);
  const input = sendProjectionNotificationSchema.parse(req.body);
  const resultados = await sendProjectionNotification(req.auth!, id, input);
  res.status(201).json({ success: true, resultados });
}));

export default router;
