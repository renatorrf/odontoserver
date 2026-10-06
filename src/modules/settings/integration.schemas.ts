import { z } from 'zod';

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().max(max).optional(),
);

export const whatsappIntegrationSchema = z.object({
  ativo: z.boolean().default(false),
  apiVersion: z.string().trim().regex(/^v\d+\.\d+$/, 'Versao da API invalida.').default('v23.0'),
  phoneNumberId: optionalText(80),
  businessAccountId: optionalText(80),
  languageCode: z.string().trim().min(2).max(12).default('pt_BR'),
  appointmentTemplate: optionalText(120),
  retentionTemplate: optionalText(120),
  quoteTemplate: optionalText(120),
  accessToken: optionalText(2000),
  limparAccessToken: z.boolean().default(false),
}).refine((value) => !(value.accessToken && value.limparAccessToken), {
  path: ['accessToken'], message: 'Informe um novo token ou remova o atual.',
});

export const smtpIntegrationSchema = z.object({
  ativo: z.boolean().default(false),
  host: optionalText(180),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: optionalText(180),
  from: optionalText(240),
  password: optionalText(1000),
  limparPassword: z.boolean().default(false),
}).refine((value) => !(value.password && value.limparPassword), {
  path: ['password'], message: 'Informe uma nova senha ou remova a atual.',
});

export type WhatsAppIntegrationInput = z.infer<typeof whatsappIntegrationSchema>;
export type SmtpIntegrationInput = z.infer<typeof smtpIntegrationSchema>;
