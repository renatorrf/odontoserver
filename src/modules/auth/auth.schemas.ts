import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);

export const bootstrapGestorSchema = z.object({
  empresa: z.object({
    nomeFantasia: z.string().trim().min(2),
    razaoSocial: optionalText,
    cnpj: optionalText,
    email: optionalText,
    telefone: optionalText,
  }),
  gestor: z.object({
    nome: z.string().trim().min(2),
    login: z.string().trim().min(3),
    email: optionalText,
    cpf: optionalText,
    telefone: optionalText,
    password: z.string().min(6),
  }),
});

export const loginSchema = z.object({
  login: z.string().trim().min(3),
  password: z.string().min(1),
  empresaId: z.string().uuid().optional(),
});

export const patientLoginSchema = z.object({
  cpf: z.string().trim().min(11),
  password: z.string().min(1),
  empresaId: z.string().uuid().optional(),
});

export const createGestorSchema = z.object({
  nome: z.string().trim().min(2),
  login: z.string().trim().min(3),
  email: optionalText,
  cpf: optionalText,
  telefone: optionalText,
  password: z.string().min(6),
  perfil: z.enum(['gestor', 'dentista', 'atendente']).default('gestor'),
  master: z.boolean().default(false),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const passwordResetRequestSchema = z.object({
  email: optionalText,
  cpf: optionalText,
  login: optionalText,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32),
  newPassword: z.string().min(8),
});

export type BootstrapGestorInput = z.infer<typeof bootstrapGestorSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PatientLoginInput = z.infer<typeof patientLoginSchema>;
export type CreateGestorInput = z.infer<typeof createGestorSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
