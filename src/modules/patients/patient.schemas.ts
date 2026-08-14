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

export const createPatientSchema = z.object({
  numeroProntuario: optionalText,
  nome: z.string({ required_error: 'Informe o nome.' }).trim().min(2, 'Informe o nome completo.'),
  apelido: optionalText,
  nascimento: optionalDate,
  sexo: z.enum(['masculino', 'feminino', 'outro', 'nao_informado']).default('nao_informado'),
  cpf: optionalCpf,
  rg: optionalText,
  estadoCivil: optionalText,
  escolaridade: optionalText,
  comoConheceu: optionalText,
  observacoes: optionalText,
  contato: z
    .object({
      foneFixo: optionalText,
      celularPais: optionalText,
      celular: requiredWhatsapp,
      usarCelularContato: z.boolean().default(false),
      celularContatoDe: optionalText,
      outrosTelefones: optionalText,
      email: optionalText,
      naoPossuiEmail: z.boolean().default(false),
    }),
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
  complementares: z
    .object({
      profissao: optionalText,
      localTrabalho: optionalText,
      tempoTrabalho: optionalText,
      nomePlano: optionalText,
      numeroPlano: optionalText,
    })
    .default({}),
  filiacao: z
    .object({
      nomePai: optionalText,
      cpfPai: optionalText,
      rgPai: optionalText,
      profissaoPai: optionalText,
      nomeMae: optionalText,
      cpfMae: optionalText,
      rgMae: optionalText,
      profissaoMae: optionalText,
    })
    .default({}),
  representanteLegal: z
    .object({
      nome: optionalText,
      cpf: optionalText,
      rg: optionalText,
      nascimento: optionalDate,
      telefone: optionalText,
    })
    .default({}),
});

export const patientListQuerySchema = z.object({
  search: optionalText,
});

export const patientIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof createPatientSchema>;
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;
