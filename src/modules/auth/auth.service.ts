import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto, { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { env } from '../../config/env';
import { query, transaction } from '../../database/pool';
import { sendMail } from '../../services/email.service';
import { AuthContext } from '../../types/public';
import { conflict, forbidden, unauthorized } from '../../utils/http-error';
import { onlyDigits, optionalText } from '../../utils/normalize';
import {
  BootstrapGestorInput,
  ChangePasswordInput,
  CreateGestorInput,
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  PatientLoginInput,
} from './auth.schemas';

interface MembershipRow {
  usuario_id: string;
  usuario_empresa_id: string;
  empresa_id: string;
  paciente_id: string | null;
  nome: string;
  login: string;
  email: string | null;
  senha_hash: string;
  senha_temporaria: boolean;
  perfil: AuthContext['perfil'];
  master: boolean;
  nome_fantasia: string;
}

interface AuthenticatedSession {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    nome: string;
    login: string;
    email: string | null;
    perfil: AuthContext['perfil'];
    master: boolean;
    empresaId: string;
    empresaNome: string;
    senhaTemporaria: boolean;
    pacienteId: string | null;
  };
}

interface EmpresaSelection {
  needsEmpresaSelection: true;
  empresas: Array<{ id: string; nome: string; perfil: AuthContext['perfil'] }>;
}

function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function mapMembership(row: MembershipRow): AuthContext {
  return {
    usuarioId: row.usuario_id,
    usuarioEmpresaId: row.usuario_empresa_id,
    empresaId: row.empresa_id,
    perfil: row.perfil,
    master: row.master,
    nome: row.nome,
    login: row.login,
    senhaTemporaria: row.senha_temporaria,
    pacienteId: row.paciente_id,
  };
}

async function saveSession(client: PoolClient, auth: AuthContext, jwtId: string, expiresAt: Date): Promise<void> {
  await client.query(
    `
      insert into odonto.login_sessions (
        usuario_id,
        empresa_id,
        usuario_empresa_id,
        jwt_id,
        ativo,
        expires_at
      )
      values ($1, $2, $3, $4, true, $5)
    `,
    [auth.usuarioId, auth.empresaId, auth.usuarioEmpresaId, jwtId, expiresAt],
  );
}

function signSession(row: MembershipRow): { token: string; jwtId: string; expiresAt: Date } {
  const jwtId = randomUUID();
  const auth = mapMembership(row);
  const token = jwt.sign(auth, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    jwtid: jwtId,
    subject: auth.usuarioId,
  });
  const decoded = jwt.decode(token) as jwt.JwtPayload | null;

  if (!decoded?.exp) {
    throw new Error('Token gerado sem expiracao.');
  }

  return {
    token,
    jwtId,
    expiresAt: new Date(decoded.exp * 1000),
  };
}

function toAuthenticatedSession(row: MembershipRow, token: string, expiresAt: Date): AuthenticatedSession {
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: {
      id: row.usuario_id,
      nome: row.nome,
      login: row.login,
      email: row.email,
      perfil: row.perfil,
      master: row.master,
      empresaId: row.empresa_id,
      empresaNome: row.nome_fantasia,
      senhaTemporaria: row.senha_temporaria,
      pacienteId: row.paciente_id,
    },
  };
}

async function createSession(row: MembershipRow): Promise<AuthenticatedSession> {
  return transaction(async (client) => {
    const session = signSession(row);
    const auth = mapMembership(row);

    await saveSession(client, auth, session.jwtId, session.expiresAt);
    await client.query('update odonto.usuarios set ultimo_acesso_em = now() where id = $1', [auth.usuarioId]);

    return toAuthenticatedSession(row, session.token, session.expiresAt);
  });
}

export async function bootstrapGestor(input: BootstrapGestorInput): Promise<AuthenticatedSession> {
  return transaction(async (client) => {
    const empresaResult = await client.query(
      `
        insert into odonto.empresas (
          nome_fantasia,
          razao_social,
          cnpj,
          cnpj_normalizado,
          email,
          telefone
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id, nome_fantasia
      `,
      [
        input.empresa.nomeFantasia,
        optionalText(input.empresa.razaoSocial),
        optionalText(input.empresa.cnpj),
        onlyDigits(input.empresa.cnpj),
        optionalText(input.empresa.email)?.toLowerCase() ?? null,
        optionalText(input.empresa.telefone),
      ],
    );

    const empresa = empresaResult.rows[0];
    const senhaHash = await bcrypt.hash(input.gestor.password, env.bcryptRounds);

    const usuarioResult = await client.query(
      `
        insert into odonto.usuarios (
          nome,
          login,
          email,
          cpf,
          cpf_normalizado,
          telefone,
          senha_hash
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id, nome, login, email, senha_temporaria
      `,
      [
        input.gestor.nome,
        normalizeLogin(input.gestor.login),
        optionalText(input.gestor.email)?.toLowerCase() ?? null,
        optionalText(input.gestor.cpf),
        onlyDigits(input.gestor.cpf),
        optionalText(input.gestor.telefone),
        senhaHash,
      ],
    );

    const usuario = usuarioResult.rows[0];
    const vinculoResult = await client.query(
      `
        insert into odonto.usuario_empresas (
          usuario_id,
          empresa_id,
          perfil,
          master
        )
        values ($1, $2, 'gestor', true)
        returning id, perfil, master
      `,
      [usuario.id, empresa.id],
    );

    const row: MembershipRow = {
      usuario_id: usuario.id,
      usuario_empresa_id: vinculoResult.rows[0].id,
      empresa_id: empresa.id,
      paciente_id: null,
      nome: usuario.nome,
      login: usuario.login,
      email: usuario.email,
      senha_hash: senhaHash,
      senha_temporaria: Boolean(usuario.senha_temporaria),
      perfil: vinculoResult.rows[0].perfil,
      master: vinculoResult.rows[0].master,
      nome_fantasia: empresa.nome_fantasia,
    };

    const session = signSession(row);
    await saveSession(client, mapMembership(row), session.jwtId, session.expiresAt);

    return toAuthenticatedSession(row, session.token, session.expiresAt);
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') {
      throw conflict('Empresa, login, email ou CPF ja cadastrado.');
    }

    throw error;
  });
}

async function getMembershipsByLogin(
  login: string,
  empresaId: string | undefined,
  perfis: AuthContext['perfil'][],
): Promise<MembershipRow[]> {
  const result = await query<MembershipRow>(
    `
      select
        u.id as usuario_id,
        ue.id as usuario_empresa_id,
        e.id as empresa_id,
        null::uuid as paciente_id,
        u.nome,
        u.login,
        u.email,
        u.senha_hash,
        u.senha_temporaria,
        ue.perfil,
        ue.master,
        e.nome_fantasia
      from odonto.usuarios u
      inner join odonto.usuario_empresas ue on ue.usuario_id = u.id
      inner join odonto.empresas e on e.id = ue.empresa_id
      where lower(u.login::text) = lower($1)
        and u.ativo = true
        and ue.ativo = true
        and e.ativo = true
        and ue.perfil::text = any($3::text[])
        and ($2::uuid is null or e.id = $2::uuid)
      order by ue.master desc, e.nome_fantasia asc
    `,
    [normalizeLogin(login), empresaId ?? null, perfis],
  );

  return result.rows;
}

async function getPatientMemberships(input: PatientLoginInput): Promise<MembershipRow[]> {
  const cpf = onlyDigits(input.cpf);

  if (!cpf) {
    return [];
  }

  const result = await query<MembershipRow>(
    `
      select
        u.id as usuario_id,
        ue.id as usuario_empresa_id,
        e.id as empresa_id,
        p.id as paciente_id,
        u.nome,
        u.login,
        coalesce(u.email, pc.email) as email,
        u.senha_hash,
        u.senha_temporaria,
        ue.perfil,
        ue.master,
        e.nome_fantasia
      from odonto.usuarios u
      inner join odonto.usuario_empresas ue on ue.usuario_id = u.id and ue.perfil = 'paciente'
      inner join odonto.empresas e on e.id = ue.empresa_id
      inner join odonto.pacientes p on p.usuario_id = u.id and p.empresa_id = e.id
      left join odonto.paciente_contatos pc on pc.paciente_id = p.id
      where (u.cpf_normalizado = $1 or u.login::text = $1)
        and u.ativo = true
        and ue.ativo = true
        and e.ativo = true
        and p.status = 'ativo'
        and ($2::uuid is null or e.id = $2::uuid)
      order by e.nome_fantasia asc
    `,
    [cpf, input.empresaId ?? null],
  );

  return result.rows;
}

async function resolveLogin(
  memberships: MembershipRow[],
  password: string,
  empresaId?: string,
): Promise<AuthenticatedSession | EmpresaSelection> {
  if (!memberships.length) {
    throw unauthorized('Usuario ou senha invalidos.');
  }

  const passwordOk = await bcrypt.compare(password, memberships[0].senha_hash);

  if (!passwordOk) {
    throw unauthorized('Usuario ou senha invalidos.');
  }

  if (!empresaId && memberships.length > 1) {
    return {
      needsEmpresaSelection: true,
      empresas: memberships.map((row) => ({
        id: row.empresa_id,
        nome: row.nome_fantasia,
        perfil: row.perfil,
      })),
    };
  }

  return createSession(memberships[0]);
}

export async function login(input: LoginInput): Promise<AuthenticatedSession | EmpresaSelection> {
  const memberships = await getMembershipsByLogin(input.login, input.empresaId, [
    'portal_admin',
    'gestor',
    'dentista',
    'atendente',
  ]);

  return resolveLogin(memberships, input.password, input.empresaId);
}

export async function loginPaciente(input: PatientLoginInput): Promise<AuthenticatedSession | EmpresaSelection> {
  const memberships = await getPatientMemberships(input);
  return resolveLogin(memberships, input.password, input.empresaId);
}

export async function changePassword(auth: AuthContext, input: ChangePasswordInput): Promise<void> {
  const result = await query<{ senha_hash: string }>('select senha_hash from odonto.usuarios where id = $1 limit 1', [
    auth.usuarioId,
  ]);
  const user = result.rows[0];

  if (!user) {
    throw unauthorized();
  }

  const passwordOk = await bcrypt.compare(input.currentPassword, user.senha_hash);

  if (!passwordOk) {
    throw unauthorized('Senha atual invalida.');
  }

  const senhaHash = await bcrypt.hash(input.newPassword, env.bcryptRounds);

  await query(
    `
      update odonto.usuarios
      set senha_hash = $2,
          senha_temporaria = false,
          senha_alterada_em = now()
      where id = $1
    `,
    [auth.usuarioId, senhaHash],
  );
}

export async function requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
  const email = optionalText(input.email)?.toLowerCase() ?? null;
  const cpf = onlyDigits(input.cpf);
  const loginValue = optionalText(input.login)?.toLowerCase() ?? null;

  const result = await query<{
    usuario_id: string;
    empresa_id: string | null;
    nome: string;
    email_destino: string | null;
  }>(
    `
      select
        u.id as usuario_id,
        ue.empresa_id,
        u.nome,
        coalesce(u.email, pc.email) as email_destino
      from odonto.usuarios u
      left join odonto.usuario_empresas ue on ue.usuario_id = u.id and ue.ativo = true
      left join odonto.pacientes p on p.usuario_id = u.id and p.empresa_id = ue.empresa_id
      left join odonto.paciente_contatos pc on pc.paciente_id = p.id
      where u.ativo = true
        and (
          ($1::text is not null and lower(u.email::text) = $1)
          or ($2::text is not null and u.cpf_normalizado = $2)
          or ($3::text is not null and lower(u.login::text) = $3)
        )
      order by ue.created_at desc nulls last
      limit 1
    `,
    [email, cpf, loginValue],
  );
  const user = result.rows[0];

  if (!user?.email_destino) {
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);
  const resetUrl = `${env.passwordResetBaseUrl}?token=${encodeURIComponent(token)}`;

  await query(
    `
      insert into odonto.password_reset_tokens (
        usuario_id,
        empresa_id,
        token_hash,
        expires_at
      )
      values ($1, $2, $3, now() + interval '30 minutes')
    `,
    [user.usuario_id, user.empresa_id, tokenHash],
  );

  await sendMail({
    to: user.email_destino,
    subject: 'Redefinicao de senha - Odonto PWA',
    text: `Ola, ${user.nome}. Acesse ${resetUrl} para redefinir sua senha. O link expira em 30 minutos.`,
    html: `
      <p>Ola, ${user.nome}.</p>
      <p>Use o link abaixo para redefinir sua senha. Ele expira em 30 minutos.</p>
      <p><a href="${resetUrl}">Redefinir senha</a></p>
    `,
  });
}

export async function resetPassword(input: PasswordResetConfirmInput): Promise<void> {
  const tokenHash = hashResetToken(input.token);
  const senhaHash = await bcrypt.hash(input.newPassword, env.bcryptRounds);

  await transaction(async (client) => {
    const result = await client.query<{ id: string; usuario_id: string }>(
      `
        select id, usuario_id
        from odonto.password_reset_tokens
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        limit 1
      `,
      [tokenHash],
    );
    const token = result.rows[0];

    if (!token) {
      throw unauthorized('Token invalido ou expirado.');
    }

    await client.query(
      `
        update odonto.usuarios
        set senha_hash = $2,
            senha_temporaria = false,
            senha_alterada_em = now()
        where id = $1
      `,
      [token.usuario_id, senhaHash],
    );
    await client.query('update odonto.password_reset_tokens set used_at = now() where id = $1', [token.id]);
  });
}

export async function createGestor(
  auth: AuthContext,
  input: CreateGestorInput,
): Promise<{ id: string; nome: string; login: string; perfil: AuthContext['perfil'] }> {
  if (auth.perfil !== 'portal_admin' && !(auth.perfil === 'gestor' && auth.master)) {
    throw forbidden('Apenas gestor master pode criar novos gestores.');
  }

  return transaction(async (client) => {
    const senhaHash = await bcrypt.hash(input.password, env.bcryptRounds);

    const usuarioResult = await client.query(
      `
        insert into odonto.usuarios (
          nome,
          login,
          email,
          cpf,
          cpf_normalizado,
          telefone,
          senha_hash
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id, nome, login
      `,
      [
        input.nome,
        normalizeLogin(input.login),
        optionalText(input.email)?.toLowerCase() ?? null,
        optionalText(input.cpf),
        onlyDigits(input.cpf),
        optionalText(input.telefone),
        senhaHash,
      ],
    );

    const usuario = usuarioResult.rows[0];

    const vinculoResult = await client.query(
      `
        insert into odonto.usuario_empresas (
          usuario_id,
          empresa_id,
          perfil,
          master
        )
        values ($1, $2, $3, $4)
        returning perfil
      `,
      [usuario.id, auth.empresaId, input.perfil, input.master],
    );

    return {
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      perfil: vinculoResult.rows[0].perfil,
    };
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') {
      throw conflict('Login, email ou CPF ja cadastrado.');
    }

    throw error;
  });
}
