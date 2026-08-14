"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFinancialPosition = calculateFinancialPosition;
exports.calculateQuoteTotal = calculateQuoteTotal;
function toCents(value) {
    return Math.round(value * 100);
}
function fromCents(value) {
    return value / 100;
}
function calculateFinancialPosition(input) {
    const balanceInCents = Math.max(0, toCents(input.valor) + toCents(input.acrescimo)
        - toCents(input.desconto) - toCents(input.recebido));
    const status = balanceInCents === 0 ? 'pago'
        : toCents(input.recebido) > 0 || toCents(input.desconto) > 0 ? 'parcialmente_pago' : 'pendente';
    return { saldo: fromCents(balanceInCents), status };
}
function calculateQuoteTotal(items, globalDiscount = 0) {
    const bruto = items.reduce((sum, item) => sum + toCents(item.valor), 0);
    const cortesias = items.filter((item) => item.cortesia).reduce((sum, item) => sum + toCents(item.valor), 0);
    const descontosItens = items.filter((item) => !item.cortesia).reduce((sum, item) => sum + toCents(item.desconto ?? 0), 0);
    const liquido = Math.max(0, bruto - cortesias - descontosItens - toCents(globalDiscount));
    return { bruto: fromCents(bruto), cortesias: fromCents(cortesias),
        descontosItens: fromCents(descontosItens), liquido: fromCents(liquido) };
}
