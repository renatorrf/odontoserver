import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptIntegrationSecrets, encryptIntegrationSecrets } from './integration-crypto';

test('protege e recupera segredos de integracao', () => {
  const encrypted = encryptIntegrationSecrets({ accessToken: 'token-permanente', password: 'senha-smtp' }, 'chave-de-teste');
  assert.doesNotMatch(encrypted, /token-permanente|senha-smtp/);
  assert.deepEqual(decryptIntegrationSecrets(encrypted, 'chave-de-teste'), {
    accessToken: 'token-permanente',
    password: 'senha-smtp',
  });
});

test('recusa segredo adulterado', () => {
  const encrypted = encryptIntegrationSecrets({ accessToken: 'token' }, 'chave-de-teste');
  assert.throws(() => decryptIntegrationSecrets(`${encrypted.slice(0, -1)}x`, 'chave-de-teste'));
});
