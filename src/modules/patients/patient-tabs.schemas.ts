import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().trim().optional(),
);
const optionalDate = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  date.optional(),
);
const optionalUuid = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().uuid().optional(),
);

export const patientDocumentParamsSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
});

export const patientQuoteParamsSchema = z.object({
  id: z.string().uuid(),
  quoteId: z.string().uuid(),
});

export const patientQuoteItemParamsSchema = patientQuoteParamsSchema.extend({
  itemId: z.string().uuid(),
});

export const patientDocumentMetadataSchema = z.object({
  categoria: z.enum([
    'laudo', 'radiografia', 'foto_inicial', 'foto_acompanhamento', 'foto_final',
    'receita', 'termo', 'documento', 'outro',
  ]).default('documento'),
  descricao: optionalText,
  dataDocumento: optionalDate,
  orcamentoId: optionalUuid,
  procedimentoRealizadoId: optionalUuid,
});

export const patientDocumentUpdateSchema = patientDocumentMetadataSchema.pick({
  categoria: true,
  descricao: true,
  dataDocumento: true,
});

export const anamnesisAnswers = [
  'alergia',
  'medicamento_continuo',
  'diabetes',
  'hipertensao',
  'doenca_cardiaca',
  'coagulacao',
  'gravidez_amamentacao',
  'reacao_anestesia',
  'cirurgia_recente',
  'doenca_infectocontagiosa',
  'fumante',
  'outra_condicao',
] as const;

export const patientAnamnesisSchema = z.object({
  observacoes: optionalText,
  aceitePaciente: z.boolean().default(false),
  assinaturaNome: optionalText,
  respostas: z.array(z.object({
    codigo: z.enum(anamnesisAnswers),
    resposta: z.enum(['sim', 'nao', 'nao_informado']),
    detalhes: optionalText,
  })).length(anamnesisAnswers.length),
}).superRefine((value, context) => {
  const requiredDetail = new Set(['alergia', 'medicamento_continuo', 'reacao_anestesia', 'outra_condicao']);
  for (const answer of value.respostas) {
    if (answer.resposta === 'sim' && requiredDetail.has(answer.codigo) && !answer.detalhes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['respostas', answer.codigo, 'detalhes'],
        message: 'Informe os detalhes da resposta.',
      });
    }
  }
  if (value.aceitePaciente && !value.assinaturaNome) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assinaturaNome'],
      message: 'Informe o nome usado no aceite.',
    });
  }
});

export const patientAppointmentsQuerySchema = z.object({
  inicio: optionalDate,
  fim: optionalDate,
  profissionalId: optionalUuid,
  status: z.enum([
    'todos', 'agendado', 'confirmado', 'em_espera', 'em_atendimento', 'atendido',
    'concluido', 'atrasado', 'faltou', 'cancelado',
  ]).default('todos'),
  periodo: z.enum(['todos', 'futuros', 'anteriores']).default('todos'),
}).refine((value) => !value.inicio || !value.fim || value.inicio <= value.fim, {
  path: ['fim'],
  message: 'A data final deve ser posterior a inicial.',
});

export const patientFinancialEntrySchema = z.object({
  orcamentoId: z.string().uuid().nullable().optional(),
  descricao: z.string().trim().min(2).max(180),
  vencimento: date,
  valor: z.coerce.number().positive().max(9999999999.99),
  numeroParcela: z.coerce.number().int().min(1).default(1),
  totalParcelas: z.coerce.number().int().min(1).default(1),
}).refine((value) => value.numeroParcela <= value.totalParcelas, {
  path: ['numeroParcela'],
  message: 'Numero da parcela invalido.',
});

export const quoteItemStatusSchema = z.object({
  status: z.enum(['planejado', 'autorizado', 'em_execucao', 'concluido', 'suspenso', 'cancelado']),
});

export type PatientDocumentMetadata = z.infer<typeof patientDocumentMetadataSchema>;
export type PatientDocumentUpdate = z.infer<typeof patientDocumentUpdateSchema>;
export type PatientAnamnesisInput = z.infer<typeof patientAnamnesisSchema>;
export type PatientAppointmentsQuery = z.infer<typeof patientAppointmentsQuerySchema>;
export type PatientFinancialEntryInput = z.infer<typeof patientFinancialEntrySchema>;
