import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const projectionQuerySchema = z
  .object({
    inicio: date,
    fim: date,
    profissionalId: z.string().uuid().optional(),
  })
  .refine((value) => value.inicio <= value.fim, {
    message: 'A data inicial deve ser anterior ou igual a data final.',
    path: ['fim'],
  });

export const projectionEventIdSchema = z.object({ id: z.string().uuid() });

export const sendProjectionNotificationSchema = z.object({
  canais: z.array(z.enum(['aplicativo', 'whatsapp'])).min(1).max(2),
});

export type ProjectionQuery = z.infer<typeof projectionQuerySchema>;
export type SendProjectionNotificationInput = z.infer<typeof sendProjectionNotificationSchema>;
