import { PoolClient } from 'pg';
import { query } from '../../database/pool';
import { AuthContext } from '../../types/public';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_PROFILE_PERMISSIONS,
  fallbackPermissions,
  PermissionKey,
} from './permission-catalog';

const DEFAULT_PROFILES = [
  { code: 'administrador', name: 'Administrador da clinica', description: 'Acesso integral a operacao da empresa.' },
  { code: 'atendimento', name: 'Atendimento', description: 'Pacientes, agenda, orcamentos e recebimentos do dia.' },
  { code: 'clinico', name: 'Profissional clinico', description: 'Agenda e informacoes clinicas necessarias ao atendimento.' },
  { code: 'financeiro', name: 'Financeiro', description: 'Rotinas financeiras sem poder de autoaprovacao.' },
] as const;

export async function ensureDefaultAccessProfiles(
  client: PoolClient,
  empresaId: string,
  actorId: string | null = null,
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const profile of DEFAULT_PROFILES) {
    const result = await client.query<{ id: string }>(`
      insert into odonto.perfis_acesso
        (empresa_id, nome, descricao, codigo_sistema, sistema, created_by, updated_by)
      values ($1, $2, $3, $4, true, $5, $5)
      on conflict (empresa_id, nome) do update
        set codigo_sistema = excluded.codigo_sistema,
            sistema = true,
            updated_by = coalesce(excluded.updated_by, odonto.perfis_acesso.updated_by)
      returning id`, [empresaId, profile.name, profile.description, profile.code, actorId]);
    const profileId = result.rows[0].id;
    ids[profile.code] = profileId;
    const permissions = DEFAULT_PROFILE_PERMISSIONS[profile.code];
    for (const permission of permissions) {
      await client.query(`
        insert into odonto.perfil_permissoes (perfil_acesso_id, permissao, concedida_por)
        values ($1, $2, $3)
        on conflict (perfil_acesso_id, permissao) do nothing`, [profileId, permission, actorId]);
    }
  }
  return ids;
}

export async function getAccessPermissions(auth: AuthContext): Promise<PermissionKey[]> {
  if (auth.perfil === 'portal_admin' || auth.master) return ALL_PERMISSION_KEYS;
  const profile = await query<{ perfil_id: string; permissoes: string[] }>(`
    select pa.id as perfil_id,
           coalesce(array_agg(pp.permissao) filter (where pp.permissao is not null), '{}') as permissoes
      from odonto.usuario_empresas ue
      join odonto.perfis_acesso pa on pa.id = ue.perfil_acesso_id
        and pa.empresa_id = ue.empresa_id and pa.ativo
      left join odonto.perfil_permissoes pp on pp.perfil_acesso_id = pa.id
     where ue.id = $1 and ue.empresa_id = $2 and ue.usuario_id = $3 and ue.ativo
     group by pa.id`,
    [auth.usuarioEmpresaId, auth.empresaId, auth.usuarioId]);
  if (!profile.rowCount) return fallbackPermissions(auth.perfil);
  return profile.rows[0].permissoes.filter((value): value is PermissionKey =>
    ALL_PERMISSION_KEYS.includes(value as PermissionKey));
}

export async function getAccessPermissionsWithClient(client: PoolClient, auth: AuthContext): Promise<PermissionKey[]> {
  if (auth.perfil === 'portal_admin' || auth.master) return ALL_PERMISSION_KEYS;
  const profile = await client.query<{ perfil_id: string; permissoes: string[] }>(`
    select pa.id as perfil_id,
           coalesce(array_agg(pp.permissao) filter (where pp.permissao is not null), '{}') as permissoes
      from odonto.usuario_empresas ue
      join odonto.perfis_acesso pa on pa.id = ue.perfil_acesso_id
        and pa.empresa_id = ue.empresa_id and pa.ativo
      left join odonto.perfil_permissoes pp on pp.perfil_acesso_id = pa.id
     where ue.id = $1 and ue.empresa_id = $2 and ue.usuario_id = $3 and ue.ativo
     group by pa.id`,
    [auth.usuarioEmpresaId, auth.empresaId, auth.usuarioId]);
  if (!profile.rowCount) return fallbackPermissions(auth.perfil);
  return profile.rows[0].permissoes.filter((value): value is PermissionKey =>
    ALL_PERMISSION_KEYS.includes(value as PermissionKey));
}

export async function assignDefaultProfile(
  client: PoolClient,
  auth: AuthContext,
  profiles: Record<string, string>,
): Promise<void> {
  const code = auth.perfil === 'gestor' || auth.perfil === 'portal_admin' ? 'administrador'
    : auth.perfil === 'dentista' ? 'clinico' : auth.perfil === 'atendente' ? 'atendimento' : null;
  if (!code) return;
  await client.query(`update odonto.usuario_empresas set perfil_acesso_id = coalesce(perfil_acesso_id, $2)
    where id = $1`, [auth.usuarioEmpresaId, profiles[code]]);
}

export async function hasAccessPermission(auth: AuthContext, permission: PermissionKey): Promise<boolean> {
  if (auth.perfil === 'portal_admin' || auth.master) return true;
  const result = await query<{ perfil_id: string; concedida: boolean }>(`
    select pa.id as perfil_id, coalesce(bool_or(pp.permissao = $4), false) as concedida
      from odonto.usuario_empresas ue
      join odonto.perfis_acesso pa on pa.id = ue.perfil_acesso_id
        and pa.empresa_id = ue.empresa_id and pa.ativo
      left join odonto.perfil_permissoes pp on pp.perfil_acesso_id = pa.id
     where ue.id = $1 and ue.empresa_id = $2 and ue.usuario_id = $3
       and ue.ativo group by pa.id`, [auth.usuarioEmpresaId, auth.empresaId, auth.usuarioId, permission]);
  return result.rowCount ? result.rows[0].concedida : fallbackPermissions(auth.perfil).includes(permission);
}
