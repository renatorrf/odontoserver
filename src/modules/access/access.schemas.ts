import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional(),
);

export const accessUserParamsSchema = z.object({ id: z.string().uuid() });

export const createAccessUserSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  login: z.string().trim().min(3).max(120),
  email: optionalText,
  telefone: optionalText,
  password: z.string().min(8).max(120),
  perfil: z.enum(['gestor', 'dentista', 'atendente']).default('atendente'),
  perfilAcessoId: z.string().uuid(),
  master: z.boolean().default(false),
});

export const updateAccessUserSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  email: optionalText,
  telefone: optionalText,
  perfil: z.enum(['gestor', 'dentista', 'atendente']),
  perfilAcessoId: z.string().uuid(),
  master: z.boolean().default(false),
  ativo: z.boolean(),
  novaSenha: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(8).max(120).optional(),
  ),
});

export const createAccessProfileSchema = z.object({
  nome: z.string().trim().min(2).max(100),
  descricao: optionalText,
  permissoes: z.array(z.string().trim()).max(100).default([]),
});

export const updateAccessProfileSchema = createAccessProfileSchema.extend({ ativo: z.boolean() });

export const approvalQuerySchema = z.object({
  status: z.enum(['pendente', 'historico', 'todos']).default('pendente'),
});

export const approvalDecisionSchema = z.object({
  decisao: z.enum(['aprovar', 'rejeitar']),
  justificativa: z.string().trim().min(5).max(1000),
});

export type CreateAccessUserInput = z.infer<typeof createAccessUserSchema>;
export type UpdateAccessUserInput = z.infer<typeof updateAccessUserSchema>;
export type CreateAccessProfileInput = z.infer<typeof createAccessProfileSchema>;
export type UpdateAccessProfileInput = z.infer<typeof updateAccessProfileSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
