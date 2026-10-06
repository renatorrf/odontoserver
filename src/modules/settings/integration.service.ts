import { PoolClient } from 'pg';
import { env } from '../../config/env';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { badRequest } from '../../utils/http-error';
import { decryptIntegrationSecrets, encryptIntegrationSecrets } from './integration-crypto';
import { SmtpIntegrationInput, WhatsAppIntegrationInput } from './integration.schemas';

type IntegrationType = 'whatsapp_meta' | 'smtp';

interface IntegrationRow {
  id: string;
  tipo: IntegrationType;
  ativo: boolean;
  configuracao: Record<string, unknown>;
  segredos_criptografados: string | null;
  ultima_validacao_em: string | null;
  ultima_validacao_erro: string | null;
}

export interface WhatsAppRuntimeConfig {
  active: boolean;
  apiVersion: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appointmentTemplate: string;
  retentionTemplate: string;
  quoteTemplate: string;
  languageCode: string;
}

export interface SmtpRuntimeConfig {
  active: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function text(config: Record<string, unknown>, key: string, fallback = ''): string {
  return typeof config[key] === 'string' ? String(config[key]) : fallback;
}

async function findIntegration(empresaId: string, type: IntegrationType): Promise<IntegrationRow | null> {
  const result = await query<IntegrationRow>(`
    select id::text, tipo, ativo, configuracao, segredos_criptografados,
           ultima_validacao_em::text, ultima_validacao_erro
      from odonto.empresa_integracoes where empresa_id = $1 and tipo = $2`, [empresaId, type]);
  return result.rows[0] ?? null;
}

async function findIntegrationForUpdate(client: PoolClient, empresaId: string, type: IntegrationType): Promise<IntegrationRow | null> {
  const result = await client.query<IntegrationRow>(`
    select id::text, tipo, ativo, configuracao, segredos_criptografados,
           ultima_validacao_em::text, ultima_validacao_erro
      from odonto.empresa_integracoes where empresa_id = $1 and tipo = $2 for update`, [empresaId, type]);
  return result.rows[0] ?? null;
}

function whatsappFallback(): WhatsAppRuntimeConfig {
  return { active: Boolean(env.whatsapp.phoneNumberId && env.whatsapp.accessToken), ...env.whatsapp, businessAccountId: '' };
}

function smtpFallback(): SmtpRuntimeConfig {
  return { active: Boolean(env.smtp.host), host: env.smtp.host, port: env.smtp.port, secure: env.smtp.secure,
    user: env.smtp.user, pass: env.smtp.pass, from: env.smtp.from };
}

export async function getWhatsAppRuntimeConfig(empresaId: string): Promise<WhatsAppRuntimeConfig> {
  const row = await findIntegration(empresaId, 'whatsapp_meta');
  if (!row) return whatsappFallback();
  if (!row.ativo) return { ...whatsappFallback(), active: false, phoneNumberId: '', accessToken: '' };
  const secrets = decryptIntegrationSecrets<{ accessToken: string }>(row.segredos_criptografados, env.integrationEncryptionKey);
  return {
    active: true,
    apiVersion: text(row.configuracao, 'apiVersion', 'v23.0'),
    phoneNumberId: text(row.configuracao, 'phoneNumberId'),
    businessAccountId: text(row.configuracao, 'businessAccountId'),
    accessToken: secrets.accessToken ?? '',
    appointmentTemplate: text(row.configuracao, 'appointmentTemplate'),
    retentionTemplate: text(row.configuracao, 'retentionTemplate'),
    quoteTemplate: text(row.configuracao, 'quoteTemplate'),
    languageCode: text(row.configuracao, 'languageCode', 'pt_BR'),
  };
}

export async function getSmtpRuntimeConfig(empresaId: string | null): Promise<SmtpRuntimeConfig> {
  if (!empresaId) return smtpFallback();
  const row = await findIntegration(empresaId, 'smtp');
  if (!row) return smtpFallback();
  if (!row.ativo) return { ...smtpFallback(), active: false, host: '', user: '', pass: '' };
  const secrets = decryptIntegrationSecrets<{ password: string }>(row.segredos_criptografados, env.integrationEncryptionKey);
  return {
    active: true,
    host: text(row.configuracao, 'host'),
    port: Number(row.configuracao['port'] ?? 587),
    secure: row.configuracao['secure'] === true,
    user: text(row.configuracao, 'user'),
    pass: secrets.password ?? '',
    from: text(row.configuracao, 'from', env.smtp.from),
  };
}

function mapWhatsApp(row: IntegrationRow | null) {
  const fallback = whatsappFallback();
  const config = row?.configuracao ?? {};
  return {
    ativo: row ? row.ativo : fallback.active,
    configuradoEmpresa: Boolean(row),
    herdadoPadrao: !row && fallback.active,
    credencialConfigurada: row ? Boolean(row.segredos_criptografados) : Boolean(fallback.accessToken),
    apiVersion: text(config, 'apiVersion', fallback.apiVersion),
    phoneNumberId: text(config, 'phoneNumberId', fallback.phoneNumberId),
    businessAccountId: text(config, 'businessAccountId'),
    languageCode: text(config, 'languageCode', fallback.languageCode),
    appointmentTemplate: text(config, 'appointmentTemplate', fallback.appointmentTemplate),
    retentionTemplate: text(config, 'retentionTemplate', fallback.retentionTemplate),
    quoteTemplate: text(config, 'quoteTemplate', fallback.quoteTemplate),
    ultimaValidacaoEm: row?.ultima_validacao_em ?? null,
    ultimaValidacaoErro: row?.ultima_validacao_erro ?? null,
  };
}

function mapSmtp(row: IntegrationRow | null) {
  const fallback = smtpFallback();
  const config = row?.configuracao ?? {};
  return {
    ativo: row ? row.ativo : fallback.active,
    configuradoEmpresa: Boolean(row),
    herdadoPadrao: !row && fallback.active,
    credencialConfigurada: row ? Boolean(row.segredos_criptografados) : Boolean(fallback.pass),
    host: text(config, 'host', fallback.host),
    port: Number(config['port'] ?? fallback.port),
    secure: row ? config['secure'] === true : fallback.secure,
    user: text(config, 'user', fallback.user),
    from: text(config, 'from', fallback.from),
  };
}

export async function listIntegrationSettings(auth: AuthContext) {
  const result = await query<IntegrationRow>(`
    select id::text, tipo, ativo, configuracao, segredos_criptografados,
           ultima_validacao_em::text, ultima_validacao_erro
      from odonto.empresa_integracoes where empresa_id = $1`, [auth.empresaId]);
  return {
    whatsapp: mapWhatsApp(result.rows.find((row) => row.tipo === 'whatsapp_meta') ?? null),
    smtp: mapSmtp(result.rows.find((row) => row.tipo === 'smtp') ?? null),
  };
}

async function audit(client: PoolClient, auth: AuthContext, type: IntegrationType, fields: string[]) {
  await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, acao, payload)
    values ($1, $2, 'empresa_integracao', 'configuracao_atualizada', $3::jsonb)`,
    [auth.empresaId, auth.usuarioId, JSON.stringify({ tipo: type, campos: fields, perfil: auth.perfil })]);
}

export async function saveWhatsAppSettings(auth: AuthContext, input: WhatsAppIntegrationInput) {
  await transaction(async (client) => {
    const current = await findIntegrationForUpdate(client, auth.empresaId, 'whatsapp_meta');
    const previous: Record<string, string> = current
      ? decryptIntegrationSecrets<Record<string, string>>(current.segredos_criptografados, env.integrationEncryptionKey) : {};
    const accessToken = input.limparAccessToken ? '' : input.accessToken ?? previous['accessToken'] ?? '';
    if (input.ativo && (!input.phoneNumberId || !accessToken)) {
      throw badRequest('Informe o ID do telefone e o token permanente para ativar o WhatsApp.');
    }
    const config = { apiVersion: input.apiVersion, phoneNumberId: input.phoneNumberId ?? '',
      businessAccountId: input.businessAccountId ?? '', languageCode: input.languageCode,
      appointmentTemplate: input.appointmentTemplate ?? '', retentionTemplate: input.retentionTemplate ?? '',
      quoteTemplate: input.quoteTemplate ?? '' };
    const encrypted = accessToken ? encryptIntegrationSecrets({ accessToken }, env.integrationEncryptionKey) : null;
    await client.query(`insert into odonto.empresa_integracoes
      (empresa_id, tipo, ativo, configuracao, segredos_criptografados, created_by, updated_by)
      values ($1, 'whatsapp_meta', $2, $3::jsonb, $4, $5, $5)
      on conflict (empresa_id, tipo) do update set ativo = excluded.ativo, configuracao = excluded.configuracao,
        segredos_criptografados = excluded.segredos_criptografados, ultima_validacao_em = null,
        ultima_validacao_erro = null, updated_by = excluded.updated_by`,
      [auth.empresaId, input.ativo, JSON.stringify(config), encrypted, auth.usuarioId]);
    await audit(client, auth, 'whatsapp_meta', Object.keys(config).concat(input.accessToken ? ['accessToken'] : []));
  });
  return (await listIntegrationSettings(auth)).whatsapp;
}

export async function saveSmtpSettings(auth: AuthContext, input: SmtpIntegrationInput) {
  await transaction(async (client) => {
    const current = await findIntegrationForUpdate(client, auth.empresaId, 'smtp');
    const previous: Record<string, string> = current
      ? decryptIntegrationSecrets<Record<string, string>>(current.segredos_criptografados, env.integrationEncryptionKey) : {};
    const password = input.limparPassword ? '' : input.password ?? previous['password'] ?? '';
    if (input.ativo && (!input.host || !input.from)) throw badRequest('Informe servidor e remetente para ativar o e-mail.');
    const config = { host: input.host ?? '', port: input.port, secure: input.secure, user: input.user ?? '', from: input.from ?? '' };
    const encrypted = password ? encryptIntegrationSecrets({ password }, env.integrationEncryptionKey) : null;
    await client.query(`insert into odonto.empresa_integracoes
      (empresa_id, tipo, ativo, configuracao, segredos_criptografados, created_by, updated_by)
      values ($1, 'smtp', $2, $3::jsonb, $4, $5, $5)
      on conflict (empresa_id, tipo) do update set ativo = excluded.ativo, configuracao = excluded.configuracao,
        segredos_criptografados = excluded.segredos_criptografados, updated_by = excluded.updated_by`,
      [auth.empresaId, input.ativo, JSON.stringify(config), encrypted, auth.usuarioId]);
    await audit(client, auth, 'smtp', Object.keys(config).concat(input.password ? ['password'] : []));
  });
  return (await listIntegrationSettings(auth)).smtp;
}

export async function validateWhatsAppSettings(auth: AuthContext) {
  const config = await getWhatsAppRuntimeConfig(auth.empresaId);
  if (!config.active || !config.phoneNumberId || !config.accessToken) throw badRequest('WhatsApp nao configurado para esta empresa.');
  let error: string | null = null;
  let result: { displayPhoneNumber?: string; verifiedName?: string } = {};
  try {
    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const body = await response.json() as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message || 'Credenciais recusadas pela Meta.');
    result = { displayPhoneNumber: body.display_phone_number, verifiedName: body.verified_name };
  } catch (cause: unknown) {
    error = cause instanceof Error ? cause.message : 'Falha ao validar WhatsApp.';
  }
  await query(`update odonto.empresa_integracoes set ultima_validacao_em = now(), ultima_validacao_erro = $2,
    updated_by = $3 where empresa_id = $1 and tipo = 'whatsapp_meta'`,
    [auth.empresaId, error, auth.usuarioId]);
  if (error) throw badRequest(error);
  return result;
}
