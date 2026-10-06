import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { env } from '../../config/env';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { optionalText } from '../../utils/normalize';
import {
  CreateAccessProfileInput,
  CreateAccessUserInput,
  UpdateAccessProfileInput,
  UpdateAccessUserInput,
} from './access.schemas';
import { ensureDefaultAccessProfiles, getAccessPermissions } from './access-control.service';
import { ALL_PERMISSION_KEYS, isPermissionKey, PERMISSIONS, PermissionKey, SENSITIVE_GRANT_KEYS } from './permission-catalog';

async function audit(
  client: PoolClient,
  auth: AuthContext,
  entity: string,
  entityId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(`insert into odonto.audit_logs
    (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
    values ($1, $2, $3, $4, $5, $6::jsonb)`,
  [auth.empresaId, auth.usuarioId, entity, entityId, action, JSON.stringify({ perfil: auth.perfil, ...payload })]);
}

async function assertProfile(client: PoolClient, empresaId: string, profileId: string): Promise<void> {
  const result = await client.query('select 1 from odonto.perfis_acesso where id = $1 and empresa_id = $2 and ativo',
    [profileId, empresaId]);
  if (!result.rowCount) throw badRequest('Perfil de acesso invalido ou inativo.');
}

function validatePermissions(auth: AuthContext, values: string[]): PermissionKey[] {
  const unique = [...new Set(values)];
  if (unique.some((value) => !isPermissionKey(value))) throw badRequest('A lista contem uma permissao desconhecida.');
  const permissions = unique as PermissionKey[];
  if (!auth.master && auth.perfil !== 'portal_admin' && permissions.some((permission) => SENSITIVE_GRANT_KEYS.has(permission))) {
    throw forbidden('Somente o gestor master pode conceder permissoes administrativas sensiveis.');
  }
  const dependencies: Partial<Record<PermissionKey, PermissionKey>> = {
    'pacientes.editar': 'menu.pacientes', 'pacientes.clinico.editar': 'menu.pacientes',
    'profissionais.editar': 'menu.profissionais',
    'procedimentos.editar': 'menu.procedimentos', 'agenda.editar': 'menu.agenda',
    'financeiro.recebimentos.registrar': 'menu.contas_receber',
    'financeiro.recebimentos.retroativo.solicitar': 'menu.contas_receber',
    'financeiro.recebimentos.estornar': 'menu.contas_receber',
    'financeiro.conciliacao.importar': 'menu.conciliacao',
    'financeiro.conciliacao.conciliar': 'menu.conciliacao',
    'financeiro.conciliacao.desfazer.solicitar': 'menu.conciliacao',
    'financeiro.pagamentos.registrar': 'menu.apuracao',
    'financeiro.pagamentos.retroativo.solicitar': 'menu.apuracao',
    'projecao.notificar': 'menu.projecao',
    'financeiro.despesas.editar': 'menu.despesas',
    'financeiro.despesas.retroativo.solicitar': 'menu.despesas',
    'financeiro.bancos.editar': 'menu.bancos', 'comercial.editar': 'menu.comercial',
    'configuracoes.integracoes.editar': 'menu.configuracoes', 'usuarios.visualizar': 'menu.usuarios',
    'usuarios.gerenciar': 'usuarios.visualizar', 'perfis.gerenciar': 'usuarios.visualizar',
    'aprovacoes.financeiras.aprovar': 'menu.usuarios', 'auditoria.visualizar': 'menu.usuarios',
  };
  for (const permission of permissions) {
    const dependency = dependencies[permission];
    if (dependency && !permissions.includes(dependency)) {
      throw badRequest(`A permissao ${permission} exige tambem ${dependency}.`);
    }
  }
  return permissions;
}

export async function currentAccess(auth: AuthContext) {
  const permissions = await getAccessPermissions(auth);
  return { permissoes: permissions, catalogo: PERMISSIONS };
}

export async function listAccessUsers(auth: AuthContext) {
  const result = await query<{
    id: string; vinculo_id: string; nome: string; login: string; email: string | null; telefone: string | null;
    perfil: AuthContext['perfil']; master: boolean; ativo: boolean; ultimo_acesso_em: string | null;
    perfil_acesso_id: string | null; perfil_acesso_nome: string | null;
  }>(`select u.id, ue.id as vinculo_id, u.nome, u.login::text, u.email::text, u.telefone,
             ue.perfil, ue.master, (u.ativo and ue.ativo) as ativo, u.ultimo_acesso_em::text,
             pa.id as perfil_acesso_id, pa.nome as perfil_acesso_nome
        from odonto.usuario_empresas ue
        join odonto.usuarios u on u.id = ue.usuario_id
        left join odonto.perfis_acesso pa on pa.id = ue.perfil_acesso_id and pa.empresa_id = ue.empresa_id
       where ue.empresa_id = $1 and ue.perfil <> 'paciente'
       order by ue.master desc, u.nome`, [auth.empresaId]);
  return result.rows.map((row) => ({
    id: row.id, vinculoId: row.vinculo_id, nome: row.nome, login: row.login, email: row.email,
    telefone: row.telefone, perfil: row.perfil, master: row.master, ativo: row.ativo,
    ultimoAcessoEm: row.ultimo_acesso_em, perfilAcessoId: row.perfil_acesso_id,
    perfilAcessoNome: row.perfil_acesso_nome,
  }));
}

export async function listAccessProfiles(auth: AuthContext) {
  const result = await query<{
    id: string; nome: string; descricao: string | null; codigo_sistema: string | null; sistema: boolean;
    ativo: boolean; usuarios: string; permissoes: string[];
  }>(`select pa.id, pa.nome, pa.descricao, pa.codigo_sistema, pa.sistema, pa.ativo,
             count(distinct ue.id) filter (where ue.ativo)::text as usuarios,
             coalesce(array_agg(distinct pp.permissao) filter (where pp.permissao is not null), '{}') as permissoes
        from odonto.perfis_acesso pa
        left join odonto.usuario_empresas ue on ue.perfil_acesso_id = pa.id and ue.empresa_id = pa.empresa_id
        left join odonto.perfil_permissoes pp on pp.perfil_acesso_id = pa.id
       where pa.empresa_id = $1
       group by pa.id order by pa.sistema desc, pa.nome`, [auth.empresaId]);
  return result.rows.map((row) => ({ id: row.id, nome: row.nome, descricao: row.descricao,
    codigoSistema: row.codigo_sistema, sistema: row.sistema, ativo: row.ativo,
    usuarios: Number(row.usuarios), permissoes: row.permissoes.filter(isPermissionKey) }));
}

export async function createAccessUser(auth: AuthContext, input: CreateAccessUserInput) {
  if (input.master && !auth.master && auth.perfil !== 'portal_admin') {
    throw forbidden('Somente o gestor master pode conceder acesso master.');
  }
  return transaction(async (client) => {
    await assertProfile(client, auth.empresaId, input.perfilAcessoId);
    const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
    const user = await client.query<{ id: string }>(`insert into odonto.usuarios
      (nome, login, email, telefone, senha_hash, senha_temporaria)
      values ($1, $2, $3, $4, $5, true) returning id`,
    [input.nome, input.login.toLowerCase(), optionalText(input.email)?.toLowerCase() ?? null,
      optionalText(input.telefone), passwordHash]);
    await client.query(`insert into odonto.usuario_empresas
      (usuario_id, empresa_id, perfil, master, ativo, perfil_acesso_id)
      values ($1, $2, $3::odonto.usuario_perfil, $4, true, $5)`,
    [user.rows[0].id, auth.empresaId, input.perfil, input.master, input.perfilAcessoId]);
    await audit(client, auth, 'usuario_empresa', user.rows[0].id, 'usuario_criado', {
      perfil: input.perfil, perfilAcessoId: input.perfilAcessoId, master: input.master,
    });
    return { id: user.rows[0].id };
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') throw conflict('Login ou e-mail ja cadastrado.');
    throw error;
  });
}

export async function updateAccessUser(auth: AuthContext, userId: string, input: UpdateAccessUserInput) {
  if (input.master && !auth.master && auth.perfil !== 'portal_admin') {
    throw forbidden('Somente o gestor master pode conceder acesso master.');
  }
  if (userId === auth.usuarioId && !input.ativo) throw badRequest('Voce nao pode bloquear o proprio acesso.');
  return transaction(async (client) => {
    await assertProfile(client, auth.empresaId, input.perfilAcessoId);
    const current = await client.query<{ master: boolean; perfil_acesso_id: string | null; ativo: boolean }>(`
      select master, perfil_acesso_id, ativo from odonto.usuario_empresas
       where usuario_id = $1 and empresa_id = $2 and perfil <> 'paciente' for update`, [userId, auth.empresaId]);
    if (!current.rowCount) throw notFound('Usuario nao encontrado nesta empresa.');
    if (current.rows[0].master && !auth.master && auth.perfil !== 'portal_admin') {
      throw forbidden('Somente outro gestor master pode alterar este usuario.');
    }
    if (current.rows[0].master && (!input.master || !input.ativo)) {
      const masters = await client.query<{ count: string }>(`select count(*)::text as count
        from odonto.usuario_empresas where empresa_id = $1 and master and ativo`, [auth.empresaId]);
      if (Number(masters.rows[0].count) <= 1) throw conflict('A empresa deve manter pelo menos um gestor master ativo.');
    }
    const passwordHash = input.novaSenha ? await bcrypt.hash(input.novaSenha, env.bcryptRounds) : null;
    await client.query(`update odonto.usuarios set nome = $2, email = $3, telefone = $4,
      senha_hash = coalesce($5, senha_hash), senha_temporaria = case when $5 is null then senha_temporaria else true end,
      updated_at = now() where id = $1`,
    [userId, input.nome, optionalText(input.email)?.toLowerCase() ?? null, optionalText(input.telefone), passwordHash]);
    await client.query(`update odonto.usuario_empresas set perfil = $3::odonto.usuario_perfil, master = $4,
      ativo = $5, perfil_acesso_id = $6, updated_at = now()
      where usuario_id = $1 and empresa_id = $2`,
    [userId, auth.empresaId, input.perfil, input.master, input.ativo, input.perfilAcessoId]);
    await client.query(`update odonto.login_sessions set ativo = false
      where usuario_id = $1 and empresa_id = $2 and ativo`, [userId, auth.empresaId]);
    await audit(client, auth, 'usuario_empresa', userId, 'usuario_atualizado', {
      perfil: input.perfil, perfilAcessoId: input.perfilAcessoId, master: input.master,
      ativo: input.ativo, senhaRedefinida: Boolean(input.novaSenha), sessoesRevogadas: true,
    });
    return { id: userId };
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') throw conflict('E-mail ja cadastrado.');
    throw error;
  });
}

export async function createAccessProfile(auth: AuthContext, input: CreateAccessProfileInput) {
  const permissions = validatePermissions(auth, input.permissoes);
  return transaction(async (client) => {
    const profile = await client.query<{ id: string }>(`insert into odonto.perfis_acesso
      (empresa_id, nome, descricao, created_by, updated_by)
      values ($1, $2, $3, $4, $4) returning id`,
    [auth.empresaId, input.nome, optionalText(input.descricao), auth.usuarioId]);
    await replaceProfilePermissions(client, profile.rows[0].id, permissions, auth.usuarioId);
    await audit(client, auth, 'perfil_acesso', profile.rows[0].id, 'perfil_criado', { nome: input.nome, permissoes: permissions });
    return { id: profile.rows[0].id };
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') throw conflict('Ja existe um perfil com este nome.');
    throw error;
  });
}

export async function updateAccessProfile(auth: AuthContext, profileId: string, input: UpdateAccessProfileInput) {
  const permissions = validatePermissions(auth, input.permissoes);
  return transaction(async (client) => {
    const current = await client.query<{ codigo_sistema: string | null }>(`
      select codigo_sistema from odonto.perfis_acesso where id = $1 and empresa_id = $2 for update`,
    [profileId, auth.empresaId]);
    if (!current.rowCount) throw notFound('Perfil de acesso nao encontrado.');
    if (current.rows[0].codigo_sistema === 'administrador' && (!auth.master || !input.ativo
      || permissions.length !== ALL_PERMISSION_KEYS.length)) {
      throw forbidden('O perfil administrador deve permanecer ativo e completo; somente o master pode altera-lo.');
    }
    await client.query(`update odonto.perfis_acesso set nome = $3, descricao = $4, ativo = $5, updated_by = $6
      where id = $1 and empresa_id = $2`,
    [profileId, auth.empresaId, input.nome, optionalText(input.descricao), input.ativo, auth.usuarioId]);
    await replaceProfilePermissions(client, profileId, permissions, auth.usuarioId);
    await client.query(`update odonto.login_sessions set ativo = false where empresa_id = $1 and ativo
      and usuario_empresa_id in (select id from odonto.usuario_empresas where perfil_acesso_id = $2)`,
    [auth.empresaId, profileId]);
    await audit(client, auth, 'perfil_acesso', profileId, 'perfil_atualizado', {
      nome: input.nome, ativo: input.ativo, permissoes: permissions, sessoesRevogadas: true,
    });
    return { id: profileId };
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') throw conflict('Ja existe um perfil com este nome.');
    throw error;
  });
}

async function replaceProfilePermissions(
  client: PoolClient,
  profileId: string,
  permissions: PermissionKey[],
  actorId: string,
): Promise<void> {
  await client.query('delete from odonto.perfil_permissoes where perfil_acesso_id = $1', [profileId]);
  for (const permission of permissions) {
    await client.query(`insert into odonto.perfil_permissoes (perfil_acesso_id, permissao, concedida_por)
      values ($1, $2, $3)`, [profileId, permission, actorId]);
  }
}

export async function prepareCompanyAccessProfiles(client: PoolClient, empresaId: string, masterUserId: string) {
  const profiles = await ensureDefaultAccessProfiles(client, empresaId, masterUserId);
  await client.query(`update odonto.usuario_empresas set perfil_acesso_id = $3
    where empresa_id = $1 and usuario_id = $2`, [empresaId, masterUserId, profiles.administrador]);
  return profiles;
}
