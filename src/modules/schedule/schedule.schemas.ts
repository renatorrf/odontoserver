import { z } from 'zod';
import { scheduleStatuses } from './schedule-status';

const optionalText = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().trim().optional(),
);

const optionalUuid = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().uuid().optional(),
);

const optionalDate = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

const dateTime = z.string().datetime({ offset: true });

export const scheduleQuerySchema = z
  .object({
    inicio: dateTime,
    fim: dateTime,
    profissionalIds: optionalText,
  })
  .transform((value) => ({
    inicio: value.inicio,
    fim: value.fim,
    profissionalIds: value.profissionalIds
      ? value.profissionalIds.split(',').map((id) => z.string().uuid().parse(id.trim()))
      : [],
  }));

export const scheduleEventSchema = z
  .object({
    tipo: z.enum(['consulta', 'compromisso']),
    profissionalId: optionalUuid,
    pacienteId: optionalUuid,
    titulo: optionalText,
    categoria: optionalText,
    observacoes: optionalText,
    observacoesProcedimentos: z.preprocess(
      (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
      z.string().trim().max(3000).optional(),
    ),
    inicioEm: dateTime,
    fimEm: dateTime,
    diaInteiro: z.boolean().default(false),
    primeiraConsulta: z.boolean().default(false),
    confirmacaoEnvio: optionalText,
    lembreteEnvio: optionalText,
    motivoRemarcacao: optionalText,
    procedimentos: z
      .array(z.object({
        catalogoProcedimentoId: z.string().uuid(),
        quantidade: z.coerce.number().int().min(1).max(99).default(1),
      }))
      .max(20)
      .default([]),
  })
  .superRefine((value, context) => {
    if (new Date(value.inicioEm).getTime() >= new Date(value.fimEm).getTime()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fimEm'], message: 'Horario final invalido.' });
    }

    if (value.tipo === 'consulta' && !value.pacienteId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['pacienteId'], message: 'Selecione o paciente.' });
    }

    if (value.tipo === 'consulta' && !value.profissionalId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['profissionalId'], message: 'Selecione o profissional.' });
    }

    if (value.tipo === 'consulta' && !value.procedimentos.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['procedimentos'],
        message: 'Adicione ao menos um procedimento para compor o orcamento da consulta.',
      });
    }

    if (value.tipo === 'compromisso' && !value.titulo) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['titulo'], message: 'Informe o compromisso.' });
    }
  });

export const eventIdSchema = z.object({ id: z.string().uuid() });

export const availabilityQuerySchema = z.object({
  profissionalId: z.string().uuid(),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dias: z.coerce.number().int().min(1).max(31).default(14),
  duracaoMinutos: z.coerce.number().int().min(5).max(2880),
  diaInteiro: z.preprocess(
    (value) => typeof value === 'string' ? ['true', '1'].includes(value.toLowerCase()) : value,
    z.boolean().default(false),
  ),
  ignorarEventoId: optionalUuid,
});

export const eventStatusSchema = z.object({
  status: z.enum(scheduleStatuses),
  justificativa: optionalText,
}).superRefine((value, context) => {
  if (['cancelado', 'faltou'].includes(value.status) && !value.justificativa) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['justificativa'], message: 'Informe uma justificativa.' });
  }
});

export const returnAlertSchema = z.object({
  pacienteId: z.string().uuid(),
  profissionalId: optionalUuid,
  motivo: z.string().trim().min(2).max(180),
  retornarEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacoes: optionalText,
});

export const returnAlertQuerySchema = z.object({
  status: z.enum(['pendente', 'agendado', 'concluido', 'cancelado']).default('pendente'),
  ate: optionalDate,
});

export const returnAlertStatusSchema = z.object({
  status: z.enum(['pendente', 'agendado', 'concluido', 'cancelado']),
  agendaEventoId: optionalUuid,
});

export type ScheduleQuery = z.infer<typeof scheduleQuerySchema>;
export type ScheduleEventInput = z.infer<typeof scheduleEventSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type ScheduleEventStatusInput = z.infer<typeof eventStatusSchema>;
export type ReturnAlertInput = z.infer<typeof returnAlertSchema>;
export type ReturnAlertQuery = z.infer<typeof returnAlertQuerySchema>;
export type ReturnAlertStatusInput = z.infer<typeof returnAlertStatusSchema>;
