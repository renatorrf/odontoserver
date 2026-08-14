import { z } from 'zod';
import { hasValidPhoneLength, isValidCpf } from '../../utils/br-validation';

const optionalText = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().trim().optional(),
);

const optionalDate = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

const optionalCpf = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().trim().refine(isValidCpf, 'CPF invalido.').optional(),
);

const requiredWhatsapp = z.string({ required_error: 'Informe o WhatsApp.' })
  .trim()
  .min(1, 'Informe o WhatsApp.')
  .refine(hasValidPhoneLength, 'WhatsApp invalido.');

const professionalCouncil = z.preprocess(
  (value) => (value == null || (typeof value === 'string' && value.trim() === '') ? undefined : value),
  z.string().trim().min(2).max(20).default('CRO'),
);

const availabilitySchema = z
  .object({
    diaSemana: z.number().int().min(0).max(6),
    horaInicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    horaFim: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    intervaloMinutos: z.number().int().min(5).max(240).default(30),
  })
  .refine((value) => value.horaInicio < value.horaFim, {
    message: 'O horario final deve ser posterior ao inicial.',
    path: ['horaFim'],
  });

export const createProfessionalSchema = z.object({
  nome: z.string({ required_error: 'Informe o nome.' }).trim().min(2, 'Informe o nome completo.'),
  nascimento: optionalDate,
  sexo: z.enum(['masculino', 'feminino', 'outro', 'nao_informado']).default('nao_informado'),
  estadoCivil: optionalText,
  cpf: optionalCpf,
  rg: optionalText,
  conselhoTipo: professionalCouncil,
  conselhoUf: optionalText,
  conselhoNumero: optionalText,
  corAgenda: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#126B62'),
  especialidades: z.array(z.string().trim().min(2).max(100)).max(20).default([]),
  contato: z
    .object({
      email: optionalText,
      celular: requiredWhatsapp,
      foneFixo: optionalText,
    }),
  chavePix: optionalText,
  endereco: z
    .object({
      cep: optionalText,
      cidade: optionalText,
      estado: optionalText,
      logradouro: optionalText,
      numero: optionalText,
      bairro: optionalText,
      complemento: optionalText,
    })
    .default({}),
  observacoes: optionalText,
  agendaHabilitada: z.boolean().default(true),
  visualizacaoAgenda: z.enum(['propria', 'clinica']).default('propria'),
  disponibilidades: z.array(availabilitySchema).max(28).default([]),
});

export const commissionSchema = z
  .object({
    validoDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validoAte: optionalDate,
    duracaoIndeterminada: z.boolean().default(true),
    requerAprovacao: z.boolean().default(false),
    tipo: z.enum(['porcentagem', 'valor_fixo']).default('porcentagem'),
    momento: z
      .enum(['recebimento_pagamento', 'execucao_procedimento', 'checkout_paciente', 'aprovacao_orcamento'])
      .default('recebimento_pagamento'),
    percentualGeral: z.number().min(0).max(100).nullable().optional(),
    percentualPlano: z.number().min(0).max(100).nullable().optional(),
    valorFixo: z.number().min(0).nullable().optional(),
    descontarImpostos: z.boolean().default(false),
    descontarTaxasPagamento: z.boolean().default(false),
    gerarPlanoProprioExecucao: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (!value.duracaoIndeterminada && !value.validoAte) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['validoAte'], message: 'Informe o fim da vigencia.' });
    }

    if (value.validoAte && value.validoAte < value.validoDesde) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['validoAte'], message: 'Data final invalida.' });
    }

    if (value.tipo === 'porcentagem' && value.percentualGeral == null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['percentualGeral'], message: 'Informe a comissao geral.' });
    }

    if (value.tipo === 'valor_fixo' && value.valorFixo == null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['valorFixo'], message: 'Informe o valor fixo.' });
    }
  });

export const professionalListQuerySchema = z.object({ search: optionalText });
export const professionalIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateProfessionalInput = z.infer<typeof createProfessionalSchema>;
export type UpdateProfessionalInput = z.infer<typeof createProfessionalSchema>;
export type CommissionInput = z.infer<typeof commissionSchema>;
export type ProfessionalListQuery = z.infer<typeof professionalListQuerySchema>;
