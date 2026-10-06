import { createHash } from 'node:crypto';
import { PoolClient } from 'pg';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { parseOfx } from './ofx.parser';
import { ReconcileInput, ReconciliationQuery } from './cash-reconciliation.schemas';
import { createApprovalRequest } from '../access/approval-request.service';
import { ApprovalExecutionContext } from '../access/financial-approval';

type SystemOrigin = 'recebimento' | 'despesa' | 'comissao';
type Nature = 'credito' | 'debito';

interface SystemMovementRow {
  id: string;
  origem: SystemOrigin;
  data_movimento: string;
  natureza: Nature;
  valor: string;
  descricao: string;
  pessoa: string;
  forma_pagamento: string | null;
  banco_id: string | null;
  banco_nome: string | null;
  vinculo_id: string | null;
  extrato_movimento_id: string | null;
}

interface StatementRow {
  id: string;
  data_movimento: string;
  natureza: Nature;
  valor: string;
  tipo_ofx: string | null;
  documento: string | null;
  favorecido: string | null;
  descricao: string | null;
  valor_conciliado: string;
  vinculos: Array<{ id: string; origem: SystemOrigin; movimentoId: string }> | null;
}

const systemMovementSql = `
  with sistema as (
    select pg.id, 'recebimento'::text as origem,
           (pg.pago_em at time zone 'America/Sao_Paulo')::date as data_movimento,
           'credito'::text as natureza, pg.valor,
           fl.descricao, p.nome as pessoa, pg.forma_pagamento::text, pg.banco_id, b.nome as banco_nome
      from odonto.paciente_financeiro_pagamentos pg
      join odonto.paciente_financeiro_lancamentos fl on fl.id = pg.lancamento_id and fl.empresa_id = pg.empresa_id
      join odonto.pacientes p on p.id = fl.paciente_id and p.empresa_id = fl.empresa_id
      left join odonto.bancos b on b.id = pg.banco_id and b.empresa_id = pg.empresa_id
     where pg.empresa_id = $1 and pg.estornado_em is null
       and coalesce(pg.forma_pagamento::text, '') <> 'dinheiro'
    union all
    select d.id, 'despesa', d.paga_em, 'debito', d.valor,
           d.descricao, coalesce(d.fornecedor, 'Despesa da clinica'), d.forma_pagamento::text, d.banco_id, b.nome
      from odonto.despesas d
      left join odonto.bancos b on b.id = d.banco_id and b.empresa_id = d.empresa_id
     where d.empresa_id = $1 and d.status = 'paga'
       and coalesce(d.forma_pagamento::text, '') <> 'dinheiro'
    union all
    select fl.id, 'comissao', (fl.pago_em at time zone 'America/Sao_Paulo')::date, 'debito', fl.valor_comissao,
           'Comissao profissional', p.nome, fl.forma_pagamento::text, fl.banco_id, b.nome
      from odonto.financeiro_lancamentos fl
      join odonto.profissionais p on p.id = fl.profissional_id and p.empresa_id = fl.empresa_id
      left join odonto.bancos b on b.id = fl.banco_id and b.empresa_id = fl.empresa_id
     where fl.empresa_id = $1 and fl.status_pagamento = 'pago' and fl.valor_comissao > 0
       and coalesce(fl.forma_pagamento::text, '') <> 'dinheiro'
  )
`;

function scoreDates(left: string, right: string): number {
  const difference = Math.abs(Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) / 86400000;
  if (difference === 0) return 100;
  if (difference === 1) return 92;
  if (difference <= 3) return 80;
  return 0;
}

export async function listReconciliation(auth: AuthContext, input: ReconciliationQuery) {
  const [systemResult, statementResult, importResult] = await Promise.all([
    query<SystemMovementRow>(`${systemMovementSql}
      select s.id::text, s.origem, s.data_movimento::text, s.natureza, s.valor::text, s.descricao, s.pessoa,
             s.forma_pagamento, s.banco_id, s.banco_nome, cv.id::text as vinculo_id,
             cv.extrato_movimento_id::text
        from sistema s
        left join odonto.conciliacao_vinculos cv on cv.empresa_id = $1
         and cv.origem_sistema = s.origem and cv.movimento_sistema_id = s.id
       where s.data_movimento between $3::date and $4::date
         and (s.banco_id is null or s.banco_id = $2::uuid)
         and ($5 = 'todos' or ($5 = 'pendentes' and cv.id is null) or ($5 = 'conciliados' and cv.id is not null))
       order by s.data_movimento, s.valor desc`, [auth.empresaId, input.bancoId, input.inicio, input.fim, input.status]),
    query<StatementRow>(`
      select em.id::text, em.data_movimento::text, em.natureza, em.valor::text, em.tipo_ofx,
             em.documento, em.favorecido, em.descricao,
             coalesce(sum(cv.valor_conciliado), 0)::text as valor_conciliado,
             coalesce(json_agg(json_build_object('id', cv.id, 'origem', cv.origem_sistema,
               'movimentoId', cv.movimento_sistema_id)) filter (where cv.id is not null), '[]'::json) as vinculos
        from odonto.conciliacao_extrato_movimentos em
        left join odonto.conciliacao_vinculos cv on cv.extrato_movimento_id = em.id and cv.empresa_id = em.empresa_id
       where em.empresa_id = $1 and em.banco_id = $2 and em.data_movimento between $3::date and $4::date
       group by em.id
      having $5 = 'todos'
          or ($5 = 'pendentes' and coalesce(sum(cv.valor_conciliado), 0) < em.valor)
          or ($5 = 'conciliados' and coalesce(sum(cv.valor_conciliado), 0) >= em.valor)
       order by em.data_movimento, em.valor desc`, [auth.empresaId, input.bancoId, input.inicio, input.fim, input.status]),
    query<{ id: string; nome_arquivo: string; periodo_inicio: string | null; periodo_fim: string | null; quantidade_movimentos: number; created_at: string }>(`
      select id::text, nome_arquivo, periodo_inicio::text, periodo_fim::text, quantidade_movimentos, created_at::text
        from odonto.conciliacao_importacoes
       where empresa_id = $1 and banco_id = $2
         and coalesce(periodo_fim, $4::date) >= $3::date and coalesce(periodo_inicio, $3::date) <= $4::date
       order by created_at desc limit 10`, [auth.empresaId, input.bancoId, input.inicio, input.fim]),
  ]);

  const system = systemResult.rows.map((row) => ({
    id: row.id, key: `${row.origem}:${row.id}`, origem: row.origem, data: row.data_movimento,
    natureza: row.natureza, valor: Number(row.valor), descricao: row.descricao, pessoa: row.pessoa,
    formaPagamento: row.forma_pagamento, bancoId: row.banco_id, bancoNome: row.banco_nome,
    conciliado: Boolean(row.vinculo_id), extratoMovimentoId: row.extrato_movimento_id,
    sugestaoExtratoId: null as string | null, scoreSugestao: null as number | null,
  }));
  const statements = statementResult.rows.map((row) => ({
    id: row.id, data: row.data_movimento, natureza: row.natureza, valor: Number(row.valor),
    tipoOfx: row.tipo_ofx, documento: row.documento, favorecido: row.favorecido, descricao: row.descricao,
    valorConciliado: Number(row.valor_conciliado), vinculos: row.vinculos ?? [],
    conciliado: Number(row.valor_conciliado) >= Number(row.valor),
    sugestaoSistemaKeys: [] as string[], scoreSugestao: null as number | null,
  }));

  for (const statement of statements.filter((item) => !item.conciliado)) {
    const candidates = system.filter((item) => !item.conciliado && item.natureza === statement.natureza
      && Math.abs(item.valor - (statement.valor - statement.valorConciliado)) < 0.005)
      .map((item) => ({ item, score: scoreDates(item.data, statement.data) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);
    if (candidates.length && (candidates.length === 1 || candidates[0].score > candidates[1].score)) {
      statement.sugestaoSistemaKeys = [candidates[0].item.key];
      statement.scoreSugestao = candidates[0].score;
      candidates[0].item.sugestaoExtratoId = statement.id;
      candidates[0].item.scoreSugestao = candidates[0].score;
    }
  }

  const pendingSystem = system.filter((item) => !item.conciliado);
  const pendingStatements = statements.filter((item) => !item.conciliado);
  return {
    movimentosSistema: system,
    movimentosExtrato: statements,
    importacoes: importResult.rows.map((row) => ({ id: row.id, nomeArquivo: row.nome_arquivo,
      periodoInicio: row.periodo_inicio, periodoFim: row.periodo_fim,
      quantidadeMovimentos: row.quantidade_movimentos, importadoEm: row.created_at })),
    resumo: {
      sistemaPendentes: pendingSystem.length,
      extratoPendentes: pendingStatements.length,
      conciliados: statements.filter((item) => item.conciliado).length,
      valorSistemaPendente: pendingSystem.reduce((sum, item) => sum + item.valor, 0),
      valorExtratoPendente: pendingStatements.reduce((sum, item) => sum + item.valor - item.valorConciliado, 0),
      sugestoes: statements.filter((item) => item.sugestaoSistemaKeys.length).length,
    },
  };
}

export async function importOfx(auth: AuthContext, bankId: string, fileName: string, file: Buffer) {
  const parsed = parseOfx(file);
  const hash = createHash('sha256').update(file).digest('hex');
  return transaction(async (client) => {
    const bank = await client.query<{ codigo_banco: string | null; conta: string | null }>(
      'select codigo_banco, conta from odonto.bancos where id = $1 and empresa_id = $2 and ativo for update',
      [bankId, auth.empresaId],
    );
    if (!bank.rowCount) throw notFound('Conta bancaria nao encontrada ou inativa.');
    const configuredCode = bank.rows[0].codigo_banco?.replace(/\D/g, '');
    if (configuredCode && parsed.bankId && configuredCode !== parsed.bankId.replace(/\D/g, '')) {
      throw badRequest('O banco do arquivo OFX nao corresponde a conta selecionada.');
    }
    const configuredAccount = bank.rows[0].conta?.replace(/\D/g, '').slice(-4);
    if (configuredAccount && parsed.accountLastDigits && configuredAccount !== parsed.accountLastDigits) {
      throw badRequest('A conta do arquivo OFX nao corresponde a conta selecionada.');
    }
    const existing = await client.query<{ id: string; quantidade_movimentos: number }>(
      'select id, quantidade_movimentos from odonto.conciliacao_importacoes where empresa_id = $1 and banco_id = $2 and arquivo_hash = $3',
      [auth.empresaId, bankId, hash],
    );
    if (existing.rowCount) {
      return { importacaoId: existing.rows[0].id, importados: 0, duplicados: existing.rows[0].quantidade_movimentos, arquivoDuplicado: true };
    }
    const imported = await client.query<{ id: string }>(`
      insert into odonto.conciliacao_importacoes
        (empresa_id, banco_id, nome_arquivo, arquivo_hash, banco_ofx, conta_final, periodo_inicio,
         periodo_fim, quantidade_movimentos, importado_por)
      values ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9) returning id`,
      [auth.empresaId, bankId, fileName.slice(0, 255), hash, parsed.bankId, parsed.accountLastDigits,
        parsed.startDate, parsed.endDate, auth.usuarioId],
    );
    let inserted = 0;
    for (const movement of parsed.transactions) {
      const result = await client.query(`
        insert into odonto.conciliacao_extrato_movimentos
          (empresa_id, importacao_id, banco_id, fit_id, data_movimento, natureza, valor,
           tipo_ofx, documento, favorecido, descricao)
        values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11)
        on conflict (empresa_id, banco_id, fit_id) do nothing`,
        [auth.empresaId, imported.rows[0].id, bankId, movement.fitId, movement.postedOn,
          movement.nature, movement.amount, movement.type, movement.document, movement.payee, movement.memo],
      );
      inserted += result.rowCount ?? 0;
    }
    await client.query('update odonto.conciliacao_importacoes set quantidade_movimentos = $2 where id = $1',
      [imported.rows[0].id, inserted]);
    return { importacaoId: imported.rows[0].id, importados: inserted,
      duplicados: parsed.transactions.length - inserted, arquivoDuplicado: false };
  });
}

async function loadSystemMovement(client: PoolClient, empresaId: string, origem: SystemOrigin, id: string) {
  const result = await client.query<SystemMovementRow>(`${systemMovementSql}
    select s.id::text, s.origem, s.data_movimento::text, s.natureza, s.valor::text, s.descricao, s.pessoa,
           s.forma_pagamento, s.banco_id, s.banco_nome, null::text as vinculo_id, null::text as extrato_movimento_id
      from sistema s where s.origem = $2 and s.id = $3::uuid`, [empresaId, origem, id]);
  return result.rows[0];
}

export async function reconcileMovements(auth: AuthContext, input: ReconcileInput) {
  return transaction(async (client) => {
    const statement = await client.query<{ id: string; banco_id: string; natureza: Nature; valor: string; data_movimento: string }>(`
      select id, banco_id, natureza, valor::text, data_movimento::text
        from odonto.conciliacao_extrato_movimentos where id = $1 and empresa_id = $2 for update`,
      [input.extratoMovimentoId, auth.empresaId]);
    if (!statement.rowCount) throw notFound('Movimento do extrato nao encontrado.');
    const current = await client.query<{ total: string }>(
      'select coalesce(sum(valor_conciliado), 0)::text as total from odonto.conciliacao_vinculos where empresa_id = $1 and extrato_movimento_id = $2',
      [auth.empresaId, input.extratoMovimentoId]);
    if (Number(current.rows[0].total) > 0) throw conflict('Desfaça a conciliacao atual antes de substituir os vinculos.');

    const movements = [] as Array<{ origem: SystemOrigin; id: string; value: number; date: string }>;
    for (const requested of input.movimentosSistema) {
      const movement = await loadSystemMovement(client, auth.empresaId, requested.origem, requested.id);
      if (!movement) throw notFound('Um dos movimentos do sistema nao foi encontrado.');
      if (movement.natureza !== statement.rows[0].natureza) throw badRequest('Entradas e saidas nao podem ser conciliadas entre si.');
      if (movement.banco_id && movement.banco_id !== statement.rows[0].banco_id) {
        throw badRequest('Um dos movimentos pertence a outra conta bancaria.');
      }
      const linked = await client.query('select 1 from odonto.conciliacao_vinculos where empresa_id = $1 and origem_sistema = $2 and movimento_sistema_id = $3',
        [auth.empresaId, requested.origem, requested.id]);
      if (linked.rowCount) throw conflict('Um dos movimentos do sistema ja foi conciliado.');
      movements.push({ origem: requested.origem, id: requested.id, value: Number(movement.valor), date: movement.data_movimento });
    }
    const statementValue = Number(statement.rows[0].valor);
    const systemValue = movements.reduce((sum, movement) => sum + movement.value, 0);
    if (Math.abs(statementValue - systemValue) >= 0.005) {
      throw badRequest('A soma dos movimentos selecionados deve ser igual ao valor do extrato.');
    }

    const score = Math.min(...movements.map((movement) => scoreDates(movement.date, statement.rows[0].data_movimento)));
    for (const movement of movements) {
      await client.query(`insert into odonto.conciliacao_vinculos
        (empresa_id, extrato_movimento_id, origem_sistema, movimento_sistema_id, valor_conciliado,
         modo, score_sugestao, conciliado_por)
        values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [auth.empresaId, input.extratoMovimentoId, movement.origem, movement.id, movement.value,
          input.modo, input.modo === 'sugerido' ? score : null, auth.usuarioId]);
      const table = movement.origem === 'recebimento' ? 'paciente_financeiro_pagamentos'
        : movement.origem === 'despesa' ? 'despesas' : 'financeiro_lancamentos';
      await client.query(`update odonto.${table} set banco_id = $3 where id = $1 and empresa_id = $2 and banco_id is null`,
        [movement.id, auth.empresaId, statement.rows[0].banco_id]);
    }
    return { extratoMovimentoId: input.extratoMovimentoId, quantidade: movements.length, valor: systemValue };
  });
}

export async function undoReconciliation(
  auth: AuthContext,
  statementMovementId: string,
  reason: string,
  approval?: ApprovalExecutionContext,
) {
  if (!approval) {
    const existing = await query(`select 1 from odonto.conciliacao_vinculos
      where empresa_id = $1 and extrato_movimento_id = $2 limit 1`, [auth.empresaId, statementMovementId]);
    if (!existing.rowCount) throw notFound('Conciliacao nao encontrada.');
    const request = await createApprovalRequest(
      auth,
      'desfazer_conciliacao',
      'conciliacao_extrato_movimento',
      statementMovementId,
      { statementMovementId, reason },
      reason,
    );
    return { pendenteAprovacao: true as const, solicitacaoId: request.id, status: request.status };
  }
  const result = await query(
    'delete from odonto.conciliacao_vinculos where empresa_id = $1 and extrato_movimento_id = $2',
    [auth.empresaId, statementMovementId],
  );
  if (!result.rowCount) throw notFound('Conciliacao nao encontrada.');
  await query(`insert into odonto.audit_logs
    (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
    values ($1, $2, 'conciliacao_extrato_movimento', $3, 'conciliacao_desfeita', $4::jsonb)`,
  [auth.empresaId, auth.usuarioId, statementMovementId, JSON.stringify({ quantidade: result.rowCount,
    justificativa: reason, solicitacaoAprovacaoId: approval.approvalId, aprovadoPor: approval.approvedBy })]);
  return { pendenteAprovacao: false as const, quantidade: result.rowCount };
}
