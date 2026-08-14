"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const receivables_calculator_1 = require("./receivables.calculator");
const receivables_schemas_1 = require("./receivables.schemas");
const commercial_schemas_1 = require("../commercial/commercial.schemas");
(0, node_test_1.default)('liquida pagamento integral', () => strict_1.default.deepEqual((0, receivables_calculator_1.calculateFinancialPosition)({ valor: 150, recebido: 150, desconto: 0, acrescimo: 0 }), { saldo: 0, status: 'pago' }));
(0, node_test_1.default)('mantem saldo em pagamento parcial', () => strict_1.default.deepEqual((0, receivables_calculator_1.calculateFinancialPosition)({ valor: 150, recebido: 40, desconto: 0, acrescimo: 0 }), { saldo: 110, status: 'parcialmente_pago' }));
(0, node_test_1.default)('restaura saldo quando recebimento estornado deixa de compor o total', () => strict_1.default.deepEqual((0, receivables_calculator_1.calculateFinancialPosition)({ valor: 150, recebido: 0, desconto: 0, acrescimo: 0 }), { saldo: 150, status: 'pendente' }));
(0, node_test_1.default)('aplica desconto e acrescimo na ordem financeira', () => strict_1.default.deepEqual((0, receivables_calculator_1.calculateFinancialPosition)({ valor: 150, recebido: 100, desconto: 20, acrescimo: 10 }), { saldo: 40, status: 'parcialmente_pago' }));
(0, node_test_1.default)('preserva valor original e separa cortesia e desconto', () => strict_1.default.deepEqual((0, receivables_calculator_1.calculateQuoteTotal)([{ valor: 100 }, { valor: 80, cortesia: true }, { valor: 50, desconto: 5 }], 10), { bruto: 230, cortesias: 80, descontosItens: 5, liquido: 135 }));
(0, node_test_1.default)('calcula valores monetarios em centavos sem residuo binario', () => strict_1.default.deepEqual((0, receivables_calculator_1.calculateFinancialPosition)({ valor: 0.30, recebido: 0.10 + 0.20, desconto: 0, acrescimo: 0 }), { saldo: 0, status: 'pago' }));
const baseQuote = {
    nomeContato: 'Paciente Teste', whatsapp: '34999999999', origem: 'rapido',
    status: 'rascunho', descontoValor: 0, descontoTipo: 'valor',
    itens: [{ catalogoProcedimentoId: '11111111-1111-4111-8111-111111111111', quantidade: 1,
            valorUnitario: 100, cortesia: false, descontoValor: 0 }],
};
(0, node_test_1.default)('aceita desconto percentual justificado', () => strict_1.default.equal(commercial_schemas_1.quotePayloadSchema.safeParse({
    ...baseQuote, descontoTipo: 'percentual', descontoPercentual: 10, descontoJustificativa: 'Condicao comercial',
}).success, true));
(0, node_test_1.default)('aceita desconto em valor justificado', () => strict_1.default.equal(commercial_schemas_1.quotePayloadSchema.safeParse({
    ...baseQuote, descontoValor: 15, descontoJustificativa: 'Condicao comercial',
}).success, true));
(0, node_test_1.default)('rejeita percentual acima de cem', () => strict_1.default.equal(commercial_schemas_1.quotePayloadSchema.safeParse({
    ...baseQuote, descontoTipo: 'percentual', descontoPercentual: 101, descontoJustificativa: 'Invalido',
}).success, false));
(0, node_test_1.default)('rejeita desconto de item acima do valor original', () => strict_1.default.equal(commercial_schemas_1.quotePayloadSchema.safeParse({
    ...baseQuote, itens: [{ ...baseQuote.itens[0], descontoValor: 101, descontoJustificativa: 'Invalido' }],
}).success, false));
(0, node_test_1.default)('exige justificativa para cortesia', () => strict_1.default.equal(commercial_schemas_1.quotePayloadSchema.safeParse({
    ...baseQuote, itens: [{ ...baseQuote.itens[0], cortesia: true }],
}).success, false));
(0, node_test_1.default)('exige chave idempotente valida no recebimento', () => strict_1.default.equal(receivables_schemas_1.quoteReceiptSchema.safeParse({
    valor: 100, formaPagamento: 'pix', idempotencyKey: 'invalida', origem: 'agenda',
}).success, false));
(0, node_test_1.default)('exige justificativa minima no estorno', () => strict_1.default.equal(receivables_schemas_1.paymentReversalSchema.safeParse({
    justificativa: 'nao', tipo: 'interno', origem: 'financeiro_paciente',
}).success, false));
