import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import {
  availabilityQuerySchema,
  eventIdSchema,
  eventStatusSchema,
  returnAlertQuerySchema,
  returnAlertSchema,
  returnAlertStatusSchema,
  scheduleEventSchema,
  scheduleQuerySchema,
} from './schedule.schemas';
import { listProfessionalAvailability } from './availability.service';
import {
  createEvent,
  createReturnAlert,
  getEvent,
  listEvents,
  listReturnAlerts,
  updateEvent,
  updateEventStatus,
  updateReturnAlertStatus,
} from './schedule.service';

const router = Router();

router.get('/disponibilidade', asyncHandler(async (req, res) => {
  const input = availabilityQuerySchema.parse(req.query);
  res.json({ success: true, disponibilidade: await listProfessionalAvailability(req.auth!, input) });
}));

router.get('/eventos', asyncHandler(async (req, res) => {
  const input = scheduleQuerySchema.parse(req.query);
  res.json({ success: true, eventos: await listEvents(req.auth!, input) });
}));

router.post('/eventos', asyncHandler(async (req, res) => {
  const input = scheduleEventSchema.parse(req.body);
  res.status(201).json({ success: true, evento: await createEvent(req.auth!, input) });
}));

router.get('/eventos/:id', asyncHandler(async (req, res) => {
  const { id } = eventIdSchema.parse(req.params);
  res.json({ success: true, evento: await getEvent(req.auth!, id) });
}));

router.put('/eventos/:id', asyncHandler(async (req, res) => {
  const { id } = eventIdSchema.parse(req.params);
  const input = scheduleEventSchema.parse(req.body);
  res.json({ success: true, evento: await updateEvent(req.auth!, id, input) });
}));

router.patch('/eventos/:id/status', asyncHandler(async (req, res) => {
  const { id } = eventIdSchema.parse(req.params);
  const input = eventStatusSchema.parse(req.body);
  await updateEventStatus(req.auth!, id, input);
  res.json({ success: true, message: 'Status do agendamento atualizado.', evento: await getEvent(req.auth!, id) });
}));

router.get('/alertas-retorno', asyncHandler(async (req, res) => {
  const input = returnAlertQuerySchema.parse(req.query);
  res.json({ success: true, alertas: await listReturnAlerts(req.auth!, input) });
}));

router.post('/alertas-retorno', asyncHandler(async (req, res) => {
  const input = returnAlertSchema.parse(req.body);
  res.status(201).json({ success: true, alerta: await createReturnAlert(req.auth!, input) });
}));

router.patch('/alertas-retorno/:id/status', asyncHandler(async (req, res) => {
  const { id } = eventIdSchema.parse(req.params);
  const input = returnAlertStatusSchema.parse(req.body);
  await updateReturnAlertStatus(req.auth!, id, input);
  res.json({ success: true, message: 'Alerta de retorno atualizado.' });
}));

export default router;
