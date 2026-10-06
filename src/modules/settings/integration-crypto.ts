import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key(material: string): Buffer {
  return createHash('sha256').update(material, 'utf8').digest();
}

export function encryptIntegrationSecrets(value: Record<string, string>, material: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(material), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptIntegrationSecrets<T extends Record<string, string>>(payload: string | null, material: string): T {
  if (!payload) return {} as T;
  const [version, iv, tag, encrypted] = payload.split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Formato de segredo criptografado invalido.');
  const decipher = createDecipheriv('aes-256-gcm', key(material), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
