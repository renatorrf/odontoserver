export interface FinancialTotals { valor: number; recebido: number; desconto: number; acrescimo: number }

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(value: number): number {
  return value / 100;
}

export function calculateFinancialPosition(input: FinancialTotals) {
  const balanceInCents = Math.max(0, toCents(input.valor) + toCents(input.acrescimo)
    - toCents(input.desconto) - toCents(input.recebido));
  const status = balanceInCents === 0 ? 'pago'
    : toCents(input.recebido) > 0 || toCents(input.desconto) > 0 ? 'parcialmente_pago' : 'pendente';
  return { saldo: fromCents(balanceInCents), status } as const;
}

export function calculateQuoteTotal(
  items: Array<{ valor: number; cortesia?: boolean; desconto?: number }>,
  globalDiscount = 0,
) {
  const bruto = items.reduce((sum, item) => sum + toCents(item.valor), 0);
  const cortesias = items.filter((item) => item.cortesia).reduce((sum, item) => sum + toCents(item.valor), 0);
  const descontosItens = items.filter((item) => !item.cortesia).reduce((sum, item) => sum + toCents(item.desconto ?? 0), 0);
  const liquido = Math.max(0, bruto - cortesias - descontosItens - toCents(globalDiscount));
  return { bruto: fromCents(bruto), cortesias: fromCents(cortesias),
    descontosItens: fromCents(descontosItens), liquido: fromCents(liquido) };
}
