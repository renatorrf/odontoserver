import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleEventSchema } from './schedule.schemas';

const validEvent = {
  tipo: 'consulta' as const,
  profissionalId: '11111111-1111-4111-8111-111111111111',
  inicioEm: '2026-11-16T09:00:00-03:00',
  fimEm: '2026-11-16T09:30:00-03:00',
  diaInteiro: false,
  procedimentos: [{
    catalogoProcedimentoId: '22222222-2222-4222-8222-222222222222',
    quantidade: 1,
  }],
};

test('accepts a consultation with patient pre-registration', () => {
  const result = scheduleEventSchema.safeParse({
    ...validEvent,
    pacientePreCadastro: { nome: 'Ana Souza', whatsapp: '(34) 99999-1009' },
  });
  assert.equal(result.success, true);
});

test('requires an existing patient or a pre-registration for consultations', () => {
  const result = scheduleEventSchema.safeParse(validEvent);
  assert.equal(result.success, false);
});

test('rejects a pre-registration with invalid WhatsApp', () => {
  const result = scheduleEventSchema.safeParse({
    ...validEvent,
    pacientePreCadastro: { nome: 'Ana Souza', whatsapp: '1234' },
  });
  assert.equal(result.success, false);
});
