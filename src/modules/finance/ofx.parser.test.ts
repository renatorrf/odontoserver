import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOfx } from './ofx.parser';

test('parseia OFX 1.x com decimal por virgula e transacoes sem fechamento de tag', () => {
  const input = Buffer.from(`OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n<OFX>
  <BANKID>033<ACCTID>123456789<DTSTART>20260313000000[-3:GMT]<DTEND>20260316000000[-3:GMT]
  <BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260313000000[-3:GMT]<TRNAMT>-70,00
  <FITID>mov-1<CHECKNUM>001<MEMO>PIX ENVIADO</STMTTRN>
  <STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260316000000[-3:GMT]<TRNAMT>32900,00
  <FITID>mov-1<MEMO>TED RECEBIDA</STMTTRN></BANKTRANLIST></OFX>`, 'latin1');

  const result = parseOfx(input);
  assert.equal(result.bankId, '033');
  assert.equal(result.accountLastDigits, '6789');
  assert.equal(result.startDate, '2026-03-13');
  assert.equal(result.transactions.length, 2);
  assert.notEqual(result.transactions[0].fitId, result.transactions[1].fitId);
  assert.deepEqual(result.transactions.map((item) => [item.nature, item.amount]), [
    ['debito', 70],
    ['credito', 32900],
  ]);
});

test('rejeita conteudo que nao seja OFX 1.x', () => {
  assert.throws(() => parseOfx(Buffer.from('arquivo qualquer')), /OFX invalido/);
});
