import { z } from 'zod';
import { badRequest, forbidden } from '../../utils/http-error';
import { AuthContext } from '../../types/public';

export const toothSchema = z.object({
  numero: z.number().int(),
  denticao: z.enum(['permanente', 'decidua']),
}).refine(({ numero, denticao }) => {
  const quadrant = Math.floor(numero / 10), position = numero % 10;
  return denticao === 'permanente'
    ? quadrant >= 1 && quadrant <= 4 && position >= 1 && position <= 8
    : quadrant >= 5 && quadrant <= 8 && position >= 1 && position <= 5;
}, 'Numero FDI incompativel com a denticao.');
export const teethSchema = z.array(toothSchema).max(52).refine(
  (teeth) => new Set(teeth.map((tooth) => tooth.numero)).size === teeth.length,
  'Um dente nao pode ser selecionado duas vezes.',
);
export type Tooth = z.infer<typeof toothSchema>;
export interface DentalConfig { extracao: boolean; forma_cobranca: string }

export function assertClinical(auth: AuthContext) {
  if (!['portal_admin', 'gestor', 'dentista'].includes(auth.perfil)) {
    throw forbidden('Acesso restrito a profissionais clinicos e gestores.');
  }
}

export function dentalQuantity(config: DentalConfig, teeth: Tooth[], quantity: number): number {
  if (!config.extracao) {
    if (teeth.length) throw badRequest('Selecao de dentes disponivel apenas para extracoes.');
    return quantity;
  }
  if (!teeth.length) throw badRequest('Selecione ao menos um dente para a extracao.');
  const expected = config.forma_cobranca === 'POR_DENTE' ? teeth.length : 1;
  if (quantity !== expected) throw badRequest(config.forma_cobranca === 'POR_DENTE'
    ? 'A quantidade deve corresponder aos dentes selecionados.' : 'O valor unico corresponde a um conjunto de dentes.');
  return expected;
}

export function sameTeeth(left: Tooth[], right: Tooth[]): boolean {
  return left.length === right.length && left.every((a) => right.some((b) => a.numero === b.numero && a.denticao === b.denticao));
}
