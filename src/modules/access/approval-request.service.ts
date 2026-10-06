import { createHash } from 'node:crypto';
import { PoolClient } from 'pg';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { ApprovalDecisionInput } from './access.schemas';

export type ApprovalType =
  | 'recebimento_retroativo'
  | 'estorno_recebimento_retroativo'
  | 'pagamento_profissional_retroativo'
  | 'pagamento_despesa_retroativo'
  | 'desfazer_conciliacao';

export interface ApprovalRequestRow {
  id: string;
  empresa_id: string;
  tipo: ApprovalType;
  entidade: string;
  entidade_id: string;
  payload: Record<string, unknown>;
  motivo: string;
  status: string;
  solicitado_por: string;
  solicitado_por_vinculo: string;
  solicitado_em: string;
  decidido_por: string | null;
  decidido_em: string | null;
  justificativa_decisao: string | null;
  expira_em: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(stable(payload), 'utf8').digest('hex');
}

async function event(
  client: PoolClient,
  auth: AuthContext,
  requestId: string,
  name: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(`insert into odonto.aprovacao_eventos
    (empresa_id, solicitacao_id, usuario_id, evento, detalhes)
    values ($1, $2, $3, $4, $5::jsonb)`,
  [auth.empresaId, requestId, auth.usuarioId, name, JSON.stringify(details)]);
  await client.query(`insert into odonto.audit_logs
    (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
    values ($1, $2, 'solicitacao_aprovacao', $3, $4, $5::jsonb)`,
  [auth.empresaId, auth.usuarioId, requestId, name, JSON.stringify(details)]);
}

export async function createApprovalRequest(
  auth: AuthContext,
  type: ApprovalType,
  entity: string,
  entityId: string,
  payload: Record<string, unknown>,
  reason: string,
): Promise<{ id: string; status: 'pendente'; reused: boolean }> {
  if (reason.trim().length < 5) throw badRequest('Informe uma justificativa para a operacao sensivel.');
  return transaction(async (client) => {
    const hash = payloadHash(payload);
    const existing = await client.query<{ id: string }>(`
      select id from odonto.solicitacoes_aprovacao
       where empresa_id = $1 and tipo = $2 and entidade_id = $3 and payload_hash = $4
         and status in ('pendente', 'aprovada', 'executando')
       order by solicitado_em desc limit 1`, [auth.empresaId, type, entityId, hash]);
    if (existing.rowCount) return { id: existing.rows[0].id, status: 'pendente' as const, reused: true };
    const result = await client.query<{ id: string }>(`insert into odonto.solicitacoes_aprovacao
      (empresa_id, tipo, entidade, entidade_id, payload, payload_hash, motivo, solicitado_por, solicitado_por_vinculo)
      values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) returning id`,
    [auth.empresaId, type, entity, entityId, JSON.stringify(payload), hash, reason.trim(), auth.usuarioId, auth.usuarioEmpresaId]);
    await event(client, auth, result.rows[0].id, 'solicitada', { tipo: type, entidade: entity, entidadeId: entityId });
    return { id: result.rows[0].id, status: 'pendente' as const, reused: false };
  });
}

export async function listApprovalRequests(auth: AuthContext, status: 'pendente' | 'historico' | 'todos') {
  const filter = status === 'pendente' ? "and sa.status = 'pendente'"
    : status === 'historico' ? "and sa.status <> 'pendente'" : '';
  const result = await query<ApprovalRequestRow & { solicitante_nome: string; decisor_nome: string | null }>(`
    select sa.*, solicitante.nome as solicitante_nome, decisor.nome as decisor_nome
      from odonto.solicitacoes_aprovacao sa
      join odonto.usuarios solicitante on solicitante.id = sa.solicitado_por
      left join odonto.usuarios decisor on decisor.id = sa.decidido_por
     where sa.empresa_id = $1 ${filter}
     order by case when sa.status = 'pendente' then 0 else 1 end, sa.solicitado_em desc
     limit 200`, [auth.empresaId]);
  return result.rows.map((row) => ({
    id: row.id, tipo: row.tipo, entidade: row.entidade, entidadeId: row.entidade_id,
    motivo: row.motivo, status: row.status, solicitanteId: row.solicitado_por,
    solicitanteNome: row.solicitante_nome, solicitadoEm: row.solicitado_em,
    decisorNome: row.decisor_nome, decididoEm: row.decidido_em,
    justificativaDecisao: row.justificativa_decisao, expiraEm: row.expira_em,
    resumo: approvalSummary(row.tipo, row.payload),
  }));
}

function approvalSummary(type: ApprovalType, payload: Record<string, unknown>): Record<string, unknown> {
  if (type === 'recebimento_retroativo') {
    const input = payload.input as Record<string, unknown> | undefined;
    return { valor: input?.valor, data: input?.recebidoEm, formaPagamento: input?.formaPagamento };
  }
  if (type === 'pagamento_profissional_retroativo' || type === 'pagamento_despesa_retroativo') {
    const input = payload.input as Record<string, unknown> | undefined;
    return { data: input?.pagoEm, status: input?.status };
  }
  return {};
}

export async function decideApprovalRequest(
  auth: AuthContext,
  requestId: string,
  input: ApprovalDecisionInput,
): Promise<ApprovalRequestRow> {
  const decided = await transaction<ApprovalRequestRow | null>(async (client) => {
    const result = await client.query<ApprovalRequestRow>(`
      select * from odonto.solicitacoes_aprovacao
       where id = $1 and empresa_id = $2 for update`, [requestId, auth.empresaId]);
    if (!result.rowCount) throw notFound('Solicitacao de autorizacao nao encontrada.');
    const current = result.rows[0];
    if (current.status !== 'pendente') throw conflict('Esta solicitacao ja foi decidida.');
    if (current.solicitado_por === auth.usuarioId) throw forbidden('Quem solicitou nao pode autorizar a propria operacao.');
    if (new Date(current.expira_em).getTime() <= Date.now()) {
      await client.query("update odonto.solicitacoes_aprovacao set status = 'expirada' where id = $1", [requestId]);
      await event(client, auth, requestId, 'expirada', { tipo: current.tipo });
      return null;
    }
    const nextStatus = input.decisao === 'aprovar' ? 'aprovada' : 'rejeitada';
    const updated = await client.query<ApprovalRequestRow>(`
      update odonto.solicitacoes_aprovacao
         set status = $3, decidido_por = $4, decidido_em = now(), justificativa_decisao = $5
       where id = $1 and empresa_id = $2 returning *`,
    [requestId, auth.empresaId, nextStatus, auth.usuarioId, input.justificativa]);
    await event(client, auth, requestId, nextStatus, { tipo: current.tipo, justificativa: input.justificativa });
    return updated.rows[0];
  });
  if (!decided) throw conflict('A solicitacao expirou. Gere uma nova solicitacao.');
  return decided;
}

export async function markApprovalExecution(
  auth: AuthContext,
  requestId: string,
  status: 'executando' | 'executada' | 'falhou',
  errorMessage?: string,
): Promise<void> {
  await transaction(async (client) => {
    await client.query(`update odonto.solicitacoes_aprovacao
      set status = $3, executado_em = case when $3 = 'executada' then now() else executado_em end,
          erro_execucao = $4
      where id = $1 and empresa_id = $2`, [requestId, auth.empresaId, status, errorMessage ?? null]);
    await event(client, auth, requestId, status, errorMessage ? { erro: errorMessage } : {});
  });
}

export async function requesterAuthForApproval(request: ApprovalRequestRow): Promise<AuthContext> {
  const result = await query<{
    usuario_id: string; usuario_empresa_id: string; empresa_id: string; perfil: AuthContext['perfil'];
    master: boolean; nome: string; login: string;
  }>(`select u.id as usuario_id, ue.id as usuario_empresa_id, ue.empresa_id, ue.perfil, ue.master, u.nome, u.login
      from odonto.usuario_empresas ue join odonto.usuarios u on u.id = ue.usuario_id
     where ue.id = $1 and ue.usuario_id = $2 and ue.empresa_id = $3`,
  [request.solicitado_por_vinculo, request.solicitado_por, request.empresa_id]);
  if (!result.rowCount) throw notFound('Usuario solicitante nao encontrado.');
  const row = result.rows[0];
  return { usuarioId: row.usuario_id, usuarioEmpresaId: row.usuario_empresa_id, empresaId: row.empresa_id,
    perfil: row.perfil, master: row.master, nome: row.nome, login: row.login };
}
