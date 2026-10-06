import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetroactiveDate, saoPauloToday } from './financial-approval';
import { ALL_PERMISSION_KEYS, DEFAULT_PROFILE_PERMISSIONS, PERMISSIONS } from './permission-catalog';

test('permission catalog has unique keys and valid default profiles', () => {
  assert.equal(new Set(ALL_PERMISSION_KEYS).size, ALL_PERMISSION_KEYS.length);
  assert.equal(PERMISSIONS.length, ALL_PERMISSION_KEYS.length);
  for (const permissions of Object.values(DEFAULT_PROFILE_PERMISSIONS)) {
    for (const permission of permissions) assert(ALL_PERMISSION_KEYS.includes(permission));
  }
});

test('financial profile cannot approve its own sensitive requests by default', () => {
  assert(!DEFAULT_PROFILE_PERMISSIONS.financeiro.includes('aprovacoes.financeiras.aprovar'));
  assert(DEFAULT_PROFILE_PERMISSIONS.financeiro.includes('financeiro.recebimentos.retroativo.solicitar'));
  assert(DEFAULT_PROFILE_PERMISSIONS.administrador.includes('aprovacoes.financeiras.aprovar'));
});

test('retroactive dates are evaluated in Sao Paulo calendar days', () => {
  const now = new Date('2026-10-05T14:00:00.000Z');
  assert.equal(saoPauloToday(now), '2026-10-05');
  assert.equal(isRetroactiveDate('2026-10-04', now), true);
  assert.equal(isRetroactiveDate('2026-10-05T00:00:00-03:00', now), false);
  assert.equal(isRetroactiveDate('2026-10-06', now), false);
});
