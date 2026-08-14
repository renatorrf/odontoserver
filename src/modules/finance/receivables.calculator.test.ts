import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFinancialPosition, calculateQuoteTotal } from './receivables.calculator';
import { quoteReceiptSchema, paymentReversalSchema } from './receivables.schemas';
import { quotePayloadSchema } from '../commercial/commercial.schemas';

test('liquida pagamento integral', () => assert.deepEqual(
  calculateFinancialPosition({ valor: 150, recebido: 150, desconto: 0, acrescimo: 0 }), { saldo: 0, status: 'pago' },
));
test('mantem saldo em pagamento parcial', () => assert.deepEqual(
  calculateFinancialPosition({ valor: 150, recebido: 40, desconto: 0, acrescimo: 0 }), { saldo: 110, status: 'parcialmente_pago' },
));
test('restaura saldo quando recebimento estornado deixa de compor o total', () => assert.deepEqual(
  calculateFinancialPosition({ valor: 150, recebido: 0, desconto: 0, acrescimo: 0 }), { saldo: 150, status: 'pendente' },
));
test('aplica desconto e acrescimo na ordem financeira', () => assert.deepEqual(
  calculateFinancialPosition({ valor: 150, recebido: 100, desconto: 20, acrescimo: 10 }), { saldo: 40, status: 'parcialmente_pago' },
));
test('preserva valor original e separa cortesia e desconto', () => assert.deepEqual(
  calculateQuoteTotal([{ valor: 100 }, { valor: 80, cortesia: true }, { valor: 50, desconto: 5 }], 10),
  { bruto: 230, cortesias: 80, descontosItens: 5, liquido: 135 },
));

test('calcula valores monetarios em centavos sem residuo binario', () => assert.deepEqual(
  calculateFinancialPosition({ valor: 0.30, recebido: 0.10 + 0.20, desconto: 0, acrescimo: 0 }),
  { saldo: 0, status: 'pago' },
));

const baseQuote = {
  nomeContato: 'Paciente Teste', whatsapp: '34999999999', origem: 'rapido' as const,
  status: 'rascunho' as const, descontoValor: 0, descontoTipo: 'valor' as const,
  itens: [{ catalogoProcedimentoId: '11111111-1111-4111-8111-111111111111', quantidade: 1,
    valorUnitario: 100, cortesia: false, descontoValor: 0 }],
};

test('aceita desconto percentual justificado', () => assert.equal(quotePayloadSchema.safeParse({
  ...baseQuote, descontoTipo: 'percentual', descontoPercentual: 10, descontoJustificativa: 'Condicao comercial',
}).success, true));

test('aceita desconto em valor justificado', () => assert.equal(quotePayloadSchema.safeParse({
  ...baseQuote, descontoValor: 15, descontoJustificativa: 'Condicao comercial',
}).success, true));

test('rejeita percentual acima de cem', () => assert.equal(quotePayloadSchema.safeParse({
  ...baseQuote, descontoTipo: 'percentual', descontoPercentual: 101, descontoJustificativa: 'Invalido',
}).success, false));

test('rejeita desconto de item acima do valor original', () => assert.equal(quotePayloadSchema.safeParse({
  ...baseQuote, itens: [{ ...baseQuote.itens[0], descontoValor: 101, descontoJustificativa: 'Invalido' }],
}).success, false));

test('exige justificativa para cortesia', () => assert.equal(quotePayloadSchema.safeParse({
  ...baseQuote, itens: [{ ...baseQuote.itens[0], cortesia: true }],
}).success, false));

test('exige chave idempotente valida no recebimento', () => assert.equal(quoteReceiptSchema.safeParse({
  valor: 100, formaPagamento: 'pix', idempotencyKey: 'invalida', origem: 'agenda',
}).success, false));

test('exige justificativa minima no estorno', () => assert.equal(paymentReversalSchema.safeParse({
  justificativa: 'nao', tipo: 'interno', origem: 'financeiro_paciente',
}).success, false));
