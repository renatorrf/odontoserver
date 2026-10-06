import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { smtpIntegrationSchema, whatsappIntegrationSchema } from './integration.schemas';
import { listIntegrationSettings, saveSmtpSettings, saveWhatsAppSettings, validateWhatsAppSettings } from './integration.service';

const router = Router();

router.get('/integracoes', asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await listIntegrationSettings(req.auth!)) });
}));

router.put('/integracoes/whatsapp', asyncHandler(async (req, res) => {
  const whatsapp = await saveWhatsAppSettings(req.auth!, whatsappIntegrationSchema.parse(req.body));
  res.json({ success: true, whatsapp, message: 'Configuracao do WhatsApp atualizada.' });
}));

router.post('/integracoes/whatsapp/validar', asyncHandler(async (req, res) => {
  const resultado = await validateWhatsAppSettings(req.auth!);
  res.json({ success: true, resultado, message: 'Credenciais validadas pela Meta.' });
}));

router.put('/integracoes/smtp', asyncHandler(async (req, res) => {
  const smtp = await saveSmtpSettings(req.auth!, smtpIntegrationSchema.parse(req.body));
  res.json({ success: true, smtp, message: 'Configuracao de e-mail atualizada.' });
}));

export default router;
