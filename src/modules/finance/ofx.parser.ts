import { badRequest } from '../../utils/http-error';
import { createHash } from 'node:crypto';

export interface OfxTransaction {
  fitId: string;
  postedOn: string;
  nature: 'credito' | 'debito';
  amount: number;
  type: string | null;
  document: string | null;
  payee: string | null;
  memo: string | null;
}

export interface ParsedOfx {
  bankId: string | null;
  accountLastDigits: string | null;
  startDate: string | null;
  endDate: string | null;
  transactions: OfxTransaction[];
}

function tagValue(source: string, tag: string): string | null {
  const match = source.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i'));
  const value = match?.[1]?.trim();
  return value || null;
}

function ofxDate(value: string | null): string | null {
  const digits = value?.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!digits) return null;
  const iso = `${digits[1]}-${digits[2]}-${digits[3]}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

function ofxNumber(value: string | null): number | null {
  if (!value) return null;
  let normalized = value.replace(/\s/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function decode(buffer: Buffer): string {
  const asciiHeader = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('ascii');
  const charset = asciiHeader.match(/CHARSET:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase();
  const encoding = charset === '1252' || charset === 'windows-1252' ? 'windows-1252' : 'utf-8';
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return buffer.toString('latin1');
  }
}

export function parseOfx(buffer: Buffer): ParsedOfx {
  const source = decode(buffer).replace(/^\uFEFF/, '');
  if (!/OFXHEADER:\s*100/i.test(source) || !/<OFX>/i.test(source)) {
    throw badRequest('Arquivo OFX invalido ou formato nao suportado.');
  }

  const parsedTransactions: OfxTransaction[] = [];
  const blocks = source.split(/<STMTTRN>/i).slice(1).map((part) => part.split(/<\/STMTTRN>/i)[0]);
  for (const block of blocks) {
    const fitId = tagValue(block, 'FITID');
    const postedOn = ofxDate(tagValue(block, 'DTPOSTED'));
    const signedAmount = ofxNumber(tagValue(block, 'TRNAMT'));
    if (!fitId || !postedOn || signedAmount == null || signedAmount === 0) continue;
    parsedTransactions.push({
      fitId,
      postedOn,
      nature: signedAmount > 0 ? 'credito' : 'debito',
      amount: Math.round(Math.abs(signedAmount) * 100) / 100,
      type: tagValue(block, 'TRNTYPE')?.toUpperCase() ?? null,
      document: tagValue(block, 'CHECKNUM'),
      payee: tagValue(block, 'PAYEEID') ?? tagValue(block, 'NAME'),
      memo: tagValue(block, 'MEMO'),
    });
  }

  if (!parsedTransactions.length) {
    throw badRequest('O arquivo OFX nao possui movimentos bancarios validos.');
  }

  const fitIdCount = parsedTransactions.reduce((count, item) => count.set(item.fitId, (count.get(item.fitId) ?? 0) + 1), new Map<string, number>());
  const fingerprintOccurrences = new Map<string, number>();
  const transactions = parsedTransactions.map((item) => {
    if ((fitIdCount.get(item.fitId) ?? 0) === 1) return item;
    const fingerprint = [item.fitId, item.postedOn, item.nature, item.amount.toFixed(2), item.type,
      item.document, item.payee, item.memo].join('|').toLowerCase();
    const occurrence = (fingerprintOccurrences.get(fingerprint) ?? 0) + 1;
    fingerprintOccurrences.set(fingerprint, occurrence);
    const suffix = createHash('sha256').update(`${fingerprint}|${occurrence}`).digest('hex').slice(0, 24);
    return { ...item, fitId: `${item.fitId.slice(0, 140)}:${suffix}` };
  });

  const account = tagValue(source, 'ACCTID')?.replace(/\D/g, '') ?? '';
  const transactionDates = transactions.map((item) => item.postedOn).sort();
  const headerStart = ofxDate(tagValue(source, 'DTSTART'));
  const headerEnd = ofxDate(tagValue(source, 'DTEND'));
  return {
    bankId: tagValue(source, 'BANKID'),
    accountLastDigits: account ? account.slice(-4) : null,
    startDate: [headerStart, transactionDates[0]].filter((value): value is string => Boolean(value)).sort()[0] ?? null,
    endDate: [headerEnd, transactionDates[transactionDates.length - 1]].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    transactions,
  };
}
