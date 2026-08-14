import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import {
  getClientProfile,
  listClientAppointments,
  listClientNotifications,
  listClientProcedures,
  markClientNotificationRead,
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

router.get('/notificacoes', asyncHandler(async (req, res) => {
  res.json({ success: true, notifications: await listClientNotifications(req.auth!) });
}));

router.patch('/notificacoes/:id/lida', asyncHandler(async (req, res) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  await markClientNotificationRead(req.auth!, id);
  res.json({ success: true, message: 'Notificacao marcada como lida.' });
}));

export default router;
