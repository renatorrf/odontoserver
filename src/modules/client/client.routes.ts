import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import {
  confirmClientAppointment,
  getClientProfile,
  listClientAppointmentAvailability,
  listClientAppointments,
  listClientNotifications,
  listClientProcedures,
  markClientNotificationRead,
  rescheduleClientAppointment,
} from './client.service';

const router = Router();

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const patient = await getClientProfile(req.auth!);

    res.json({
      success: true,
      patient,
    });
  }),
);

router.get(
  '/procedimentos',
  asyncHandler(async (req, res) => {
    const procedures = await listClientProcedures(req.auth!);

    res.json({
      success: true,
      procedures,
    });
  }),
);

router.get('/agendamentos', asyncHandler(async (req, res) => {
  res.json({ success: true, appointments: await listClientAppointments(req.auth!) });
}));

const appointmentParamsSchema = z.object({ id: z.string().uuid() });
const appointmentAvailabilitySchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dias: z.coerce.number().int().min(1).max(31).default(14),
});
const appointmentRescheduleSchema = z.object({
  inicioEm: z.string().datetime({ offset: true }),
});

router.patch('/agendamentos/:id/confirmar', asyncHandler(async (req, res) => {
  const { id } = appointmentParamsSchema.parse(req.params);
  res.json({
    success: true,
    message: 'Horario confirmado.',
    appointment: await confirmClientAppointment(req.auth!, id),
  });
}));

router.get('/agendamentos/:id/disponibilidade', asyncHandler(async (req, res) => {
  const { id } = appointmentParamsSchema.parse(req.params);
  const input = appointmentAvailabilitySchema.parse(req.query);
  res.json({
    success: true,
    disponibilidade: await listClientAppointmentAvailability(req.auth!, id, input.inicio, input.dias),
  });
}));

router.patch('/agendamentos/:id/remarcar', asyncHandler(async (req, res) => {
  const { id } = appointmentParamsSchema.parse(req.params);
  const input = appointmentRescheduleSchema.parse(req.body);
  res.json({
    success: true,
    message: 'Retorno remarcado e confirmado.',
    appointment: await rescheduleClientAppointment(req.auth!, id, input.inicioEm),
  });
}));

router.get('/notificacoes', asyncHandler(async (req, res) => {
  res.json({ success: true, notifications: await listClientNotifications(req.auth!) });
}));

router.patch('/notificacoes/:id/lida', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  await markClientNotificationRead(req.auth!, id);
  res.json({ success: true, message: 'Notificacao marcada como lida.' });
}));

export default router;
