import { PoolClient } from 'pg';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { conflict, notFound } from '../../utils/http-error';
import { optionalText } from '../../utils/normalize';
import {
  BankInput,
  ExpenseInput,
  ExpensePaymentInput,
  ExpenseQuery,
  OperationalCostConfigInput,
  ReportQuery,
  UpdateExpenseInput,
} from './management.schemas';

interface BankRow {
  id: string;
  nome: string;
  codigo_banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string;
  titular: string | null;
  documento_titular: string | null;
  chave_pix: string | null;
  ativo: boolean;
}

interface ExpenseRow {
  id: string;
  serie_id: string | null;
  banco_id: string | null;
  banco_nome: string | null;
  descricao: string;
  categoria: string;
  fornecedor: string | null;
  centro_custo: string | null;
  documento: string | null;
  competencia: string;
  vencimento: string;
  valor: string;
  status: 'pendente' | 'paga' | 'cancelada';
  forma_pagamento: string | null;
  referencia_pagamento: string | null;
  observacoes: string | null;
  paga_em: string | null;
  recorrencia: string | null;
  recorrencia_fim: string | null;
}

interface ProcedureCostRow {
  id: string;
  nome: string;
  categoria: string | null;
  duracao_minutos: number;
  valor: string;
  custo_variavel: string;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapBank(row: BankRow) {
  return {
    id: row.id,
    nome: row.nome,
    codigoBanco: row.codigo_banco,
    agencia: row.agencia,
    conta: row.conta,
    tipoConta: row.tipo_conta,
    titular: row.titular,
    documentoTitular: row.documento_titular,
    chavePix: row.chave_pix,
    ativo: row.ativo,
  };
}

function mapExpense(row: ExpenseRow) {
  return {
    id: row.id,
    serieId: row.serie_id,
    recorrente: Boolean(row.serie_id),
    recorrencia: row.recorrencia,
    recorrenciaFim: row.recorrencia_fim,
    bancoId: row.banco_id,
    bancoNome: row.banco_nome,
    descricao: row.descricao,
    categoria: row.categoria,
    fornecedor: row.fornecedor,
    centroCusto: row.centro_custo,
    documento: row.documento,
    competencia: row.competencia,
    vencimento: row.vencimento,
    valor: Number(row.valor),
    status: row.status,
    formaPagamento: row.forma_pagamento,
    referenciaPagamento: row.referencia_pagamento,
    observacoes: row.observacoes,
    pagaEm: row.paga_em,
  };
}

function dateUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function addMonths(value: Date, months: number): Date {
  const day = value.getUTCDate();
  const result = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function nextDate(value: Date, recurrence: 'semanal' | 'mensal' | 'anual'): Date {
  if (recurrence === 'semanal') {
    const next = new Date(value);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  return addMonths(value, recurrence === 'mensal' ? 1 : 12);
}

async function ensureBank(client: PoolClient, auth: AuthContext, id: string | null | undefined): Promise<void> {
  if (!id) {
    return;
  }
  const result = await client.query('select 1 from odonto.bancos where id = $1 and empresa_id = $2 limit 1', [
    id,
    auth.empresaId,
  ]);
  if (!result.rowCount) {
    throw notFound('Conta bancaria nao encontrada.');
  }
}

async function insertOccurrence(
  client: PoolClient,
  auth: AuthContext,
  input: ExpenseInput,
  seriesId: string | null,
  dueDate: string,
  occurrence: number | null,
  competence = monthStart(dueDate),
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      insert into odonto.despesas (
        empresa_id, serie_id, banco_id, descricao, categoria, fornecedor, centro_custo,
        documento, competencia, vencimento, valor, observacoes, numero_ocorrencia,
        created_by, updated_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
      returning id
    `,
    [
      auth.empresaId,
      seriesId,
      input.bancoId ?? null,
      input.descricao,
      input.categoria,
      optionalText(input.fornecedor),
      optionalText(input.centroCusto),
      optionalText(input.documento),
      competence,
      dueDate,
      input.valor,
      optionalText(input.observacoes),
      occurrence,
      auth.usuarioId,
    ],
  );
  return result.rows[0].id;
}

async function getExpenseRow(auth: AuthContext, id: string): Promise<ExpenseRow> {
  const result = await query<ExpenseRow>(
    `
      select d.*, b.nome as banco_nome, ds.recorrencia::text, ds.fim_em as recorrencia_fim
        from odonto.despesas d
        left join odonto.bancos b on b.id = d.banco_id and b.empresa_id = d.empresa_id
        left join odonto.despesa_series ds on ds.id = d.serie_id and ds.empresa_id = d.empresa_id
       where d.id = $1 and d.empresa_id = $2
       limit 1
    `,
    [id, auth.empresaId],
  );
  if (!result.rowCount) {
    throw notFound('Despesa nao encontrada.');
  }
  return result.rows[0];
}

export async function listBanks(auth: AuthContext) {
  const result = await query<BankRow>(
    'select * from odonto.bancos where empresa_id = $1 order by ativo desc, nome',
    [auth.empresaId],
  );
  return result.rows.map(mapBank);
}

export async function createBank(auth: AuthContext, input: BankInput) {
  try {
    const result = await query<{ id: string }>(
      `
        insert into odonto.bancos (
          empresa_id, nome, codigo_banco, agencia, conta, tipo_conta, titular,
          documento_titular, chave_pix, ativo, created_by, updated_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        returning id
      `,
      [
        auth.empresaId,
        input.nome,
        optionalText(input.codigoBanco),
        optionalText(input.agencia),
        optionalText(input.conta),
        input.tipoConta,
        optionalText(input.titular),
        optionalText(input.documentoTitular),
        optionalText(input.chavePix),
        input.ativo,
        auth.usuarioId,
      ],
    );
    return (await listBanks(auth)).find((bank) => bank.id === result.rows[0].id)!;
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') {
      throw conflict('Ja existe uma conta bancaria com este nome.');
    }
    throw error;
  }
}

export async function updateBank(auth: AuthContext, id: string, input: BankInput) {
  try {
    const result = await query(
      `
        update odonto.bancos set
          nome = $3, codigo_banco = $4, agencia = $5, conta = $6, tipo_conta = $7,
          titular = $8, documento_titular = $9, chave_pix = $10, ativo = $11, updated_by = $12
        where id = $1 and empresa_id = $2
      `,
      [
        id,
        auth.empresaId,
        input.nome,
        optionalText(input.codigoBanco),
        optionalText(input.agencia),
        optionalText(input.conta),
        input.tipoConta,
        optionalText(input.titular),
        optionalText(input.documentoTitular),
        optionalText(input.chavePix),
        input.ativo,
        auth.usuarioId,
      ],
    );
    if (!result.rowCount) {
      throw notFound('Conta bancaria nao encontrada.');
    }
    return (await listBanks(auth)).find((bank) => bank.id === id)!;
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') {
      throw conflict('Ja existe uma conta bancaria com este nome.');
    }
    throw error;
  }
}

export async function listExpenses(auth: AuthContext, input: ExpenseQuery) {
  const result = await query<ExpenseRow>(
    `
      select d.*, b.nome as banco_nome, ds.recorrencia::text, ds.fim_em as recorrencia_fim
        from odonto.despesas d
        left join odonto.bancos b on b.id = d.banco_id and b.empresa_id = d.empresa_id
        left join odonto.despesa_series ds on ds.id = d.serie_id and ds.empresa_id = d.empresa_id
       where d.empresa_id = $1
         and d.vencimento between $2::date and $3::date
         and d.status <> 'cancelada'
         and ($4 = 'todos' or d.status::text = $4)
         and ($5::text is null or d.categoria = $5)
         and ($6::uuid is null or d.banco_id = $6::uuid)
       order by case when d.status = 'pendente' then 0 else 1 end, d.vencimento, d.descricao
    `,
    [auth.empresaId, input.inicio, input.fim, input.status, input.categoria ?? null, input.bancoId ?? null],
  );
  const items = result.rows.map(mapExpense);
  return {
    items,
    resumo: {
      quantidade: items.length,
      pendentes: items.filter((item) => item.status === 'pendente').length,
      pagas: items.filter((item) => item.status === 'paga').length,
      valorPendente: money(items.filter((item) => item.status === 'pendente').reduce((sum, item) => sum + item.valor, 0)),
      valorPago: money(items.filter((item) => item.status === 'paga').reduce((sum, item) => sum + item.valor, 0)),
    },
  };
}

export async function createExpense(auth: AuthContext, input: ExpenseInput) {
  const id = await transaction(async (client) => {
    await ensureBank(client, auth, input.bancoId);
    if (!input.recorrente) {
      return insertOccurrence(client, auth, input, null, input.vencimento, null, input.competencia);
    }

    const seriesResult = await client.query<{ id: string }>(
      `
        insert into odonto.despesa_series (
          empresa_id, descricao, categoria, fornecedor, centro_custo, valor, recorrencia,
          inicio_em, fim_em, observacoes, created_by, updated_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
        returning id
      `,
      [
        auth.empresaId,
        input.descricao,
        input.categoria,
        optionalText(input.fornecedor),
        optionalText(input.centroCusto),
        input.valor,
        input.recorrencia!,
        input.vencimento,
        input.recorrenciaFim ?? null,
        optionalText(input.observacoes),
        auth.usuarioId,
      ],
    );
    const seriesId = seriesResult.rows[0].id;
    const start = dateUtc(input.vencimento);
    const limit = input.recorrenciaFim ? dateUtc(input.recorrenciaFim) : addMonths(start, 24);
    let current = start;
    let occurrence = 1;
    let firstId = '';
    while (current <= limit && occurrence <= 120) {
      const occurrenceId = await insertOccurrence(
        client,
        auth,
        input,
        seriesId,
        dateText(current),
        occurrence,
        occurrence === 1 ? input.competencia : monthStart(dateText(current)),
      );
      firstId ||= occurrenceId;
      current = nextDate(current, input.recorrencia!);
      occurrence += 1;
    }
    return firstId;
  });
  return mapExpense(await getExpenseRow(auth, id));
}

export async function updateExpense(auth: AuthContext, id: string, input: UpdateExpenseInput) {
  await transaction(async (client) => {
    await ensureBank(client, auth, input.bancoId);
    const result = await client.query<Pick<ExpenseRow, 'serie_id' | 'status' | 'vencimento'>>(
      'select serie_id, status::text, vencimento from odonto.despesas where id = $1 and empresa_id = $2 for update',
      [id, auth.empresaId],
    );
    const current = result.rows[0];
    if (!current) {
      throw notFound('Despesa nao encontrada.');
    }
    if (current.status === 'paga') {
      throw conflict('Reabra a despesa como pendente antes de altera-la.');
    }
    if (input.aplicarProximas && !current.serie_id) {
      throw conflict('Esta despesa nao pertence a uma recorrencia.');
    }

    const values = [
      input.bancoId ?? null,
      input.descricao,
      input.categoria,
      optionalText(input.fornecedor),
      optionalText(input.centroCusto),
      optionalText(input.documento),
      input.competencia,
      input.vencimento,
      input.valor,
      optionalText(input.observacoes),
      auth.usuarioId,
    ];

    if (input.aplicarProximas && current.serie_id) {
      await client.query(
        `
          update odonto.despesas set
            banco_id = $3, descricao = $4, categoria = $5, fornecedor = $6,
            centro_custo = $7, documento = $8, valor = $9, observacoes = $10, updated_by = $11
          where empresa_id = $1 and serie_id = $2 and status = 'pendente' and vencimento >= $12::date
        `,
        [
          auth.empresaId,
          current.serie_id,
          input.bancoId ?? null,
          input.descricao,
          input.categoria,
          optionalText(input.fornecedor),
          optionalText(input.centroCusto),
          optionalText(input.documento),
          input.valor,
          optionalText(input.observacoes),
          auth.usuarioId,
          current.vencimento,
        ],
      );
      await client.query(
        `
          update odonto.despesa_series set
            descricao = $3, categoria = $4, fornecedor = $5, centro_custo = $6,
            valor = $7, observacoes = $8, updated_by = $9
          where id = $1 and empresa_id = $2
        `,
        [
          current.serie_id,
          auth.empresaId,
          input.descricao,
          input.categoria,
          optionalText(input.fornecedor),
          optionalText(input.centroCusto),
          input.valor,
          optionalText(input.observacoes),
          auth.usuarioId,
        ],
      );
    } else {
      await client.query(
        `
          update odonto.despesas set
            banco_id = $3, descricao = $4, categoria = $5, fornecedor = $6,
            centro_custo = $7, documento = $8, competencia = $9, vencimento = $10,
            valor = $11, observacoes = $12, updated_by = $13
          where id = $1 and empresa_id = $2
        `,
        [id, auth.empresaId, ...values],
      );
    }
  });
  return mapExpense(await getExpenseRow(auth, id));
}

export async function cancelExpense(auth: AuthContext, id: string, applyNext: boolean): Promise<number> {
  return transaction(async (client) => {
    const result = await client.query<Pick<ExpenseRow, 'serie_id' | 'status' | 'vencimento'>>(
      'select serie_id, status::text, vencimento from odonto.despesas where id = $1 and empresa_id = $2 for update',
      [id, auth.empresaId],
    );
    const current = result.rows[0];
    if (!current) {
      throw notFound('Despesa nao encontrada.');
    }
    if (current.status === 'paga') {
      throw conflict('Despesas pagas nao podem ser excluidas. Reabra o pagamento primeiro.');
    }
    if (applyNext && current.serie_id) {
      const canceled = await client.query(
        `update odonto.despesas set status = 'cancelada', updated_by = $4
          where empresa_id = $1 and serie_id = $2 and status = 'pendente' and vencimento >= $3::date`,
        [auth.empresaId, current.serie_id, current.vencimento, auth.usuarioId],
      );
      await client.query('update odonto.despesa_series set ativa = false, updated_by = $3 where id = $1 and empresa_id = $2', [
        current.serie_id,
        auth.empresaId,
        auth.usuarioId,
      ]);
      return canceled.rowCount ?? 0;
    }
    await client.query(
      `update odonto.despesas set status = 'cancelada', updated_by = $3 where id = $1 and empresa_id = $2`,
      [id, auth.empresaId, auth.usuarioId],
    );
    return 1;
  });
}

export async function updateExpensePayment(auth: AuthContext, id: string, input: ExpensePaymentInput) {
  await transaction(async (client) => {
    await ensureBank(client, auth, input.bancoId);
    const result = await client.query(
      `
        update odonto.despesas set
          status = $3::odonto.despesa_status,
          banco_id = $4,
          forma_pagamento = $5::odonto.forma_pagamento,
          referencia_pagamento = $6,
          observacoes = coalesce($7, observacoes),
          paga_em = case when $3::text = 'paga' then coalesce($8::date, current_date) else null end,
          paga_por = case when $3::text = 'paga' then $9::uuid else null end,
          updated_by = $9
        where id = $1 and empresa_id = $2 and status <> 'cancelada'
      `,
      [
        id,
        auth.empresaId,
        input.status,
        input.bancoId ?? null,
        input.formaPagamento ?? null,
        optionalText(input.referenciaPagamento),
        optionalText(input.observacoes),
        input.pagaEm ?? null,
        auth.usuarioId,
      ],
    );
    if (!result.rowCount) {
      throw notFound('Despesa nao encontrada.');
    }
  });
  return mapExpense(await getExpenseRow(auth, id));
}

export async function getOperationalCost(auth: AuthContext, input: ReportQuery) {
  const [expenseResult, configResult, procedureResult] = await Promise.all([
    query<{ total: string; pago: string; pendente: string }>(
      `
        select
          coalesce(sum(valor), 0)::text as total,
          coalesce(sum(valor) filter (where status = 'paga'), 0)::text as pago,
          coalesce(sum(valor) filter (where status = 'pendente'), 0)::text as pendente
        from odonto.despesas
        where empresa_id = $1 and competencia between $2::date and $3::date and status <> 'cancelada'
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<{ quantidade_cadeiras: number; horas_produtivas_cadeira_mes: string }>(
      'select quantidade_cadeiras, horas_produtivas_cadeira_mes from odonto.custo_operacional_config where empresa_id = $1',
      [auth.empresaId],
    ),
    query<ProcedureCostRow>(
      `select id, nome, categoria, duracao_minutos, valor::text, custo_variavel::text
         from odonto.catalogo_procedimentos where empresa_id = $1 and ativo = true order by nome`,
      [auth.empresaId],
    ),
  ]);
  const expenses = expenseResult.rows[0];
  const config = configResult.rows[0] ?? { quantidade_cadeiras: 1, horas_produtivas_cadeira_mes: '160' };
  const totalExpenses = Number(expenses.total);
  const totalHours = config.quantidade_cadeiras * Number(config.horas_produtivas_cadeira_mes);
  const hourlyCost = totalHours > 0 ? money(totalExpenses / totalHours) : 0;
  const minuteCost = money(hourlyCost / 60);
  const procedures = procedureResult.rows.map((row) => {
    const value = Number(row.valor);
    const variableCost = Number(row.custo_variavel);
    const basalCost = money(row.duracao_minutos * minuteCost);
    const totalCost = money(basalCost + variableCost);
    const result = money(value - totalCost);
    return {
      id: row.id,
      nome: row.nome,
      categoria: row.categoria,
      duracaoMinutos: row.duracao_minutos,
      valor: value,
      custoVariavel: variableCost,
      custoBasal: basalCost,
      custoTotal: totalCost,
      resultado: result,
      margemPercentual: value > 0 ? money(result / value * 100) : 0,
    };
  });
  return {
    configuracao: {
      quantidadeCadeiras: config.quantidade_cadeiras,
      horasProdutivasCadeiraMes: Number(config.horas_produtivas_cadeira_mes),
    },
    resumo: {
      despesasTotais: totalExpenses,
      despesasPagas: Number(expenses.pago),
      despesasPendentes: Number(expenses.pendente),
      horasDisponiveis: totalHours,
      custoHoraCadeira: hourlyCost,
      custoMinutoCadeira: minuteCost,
    },
    procedimentos: procedures,
  };
}

export async function saveOperationalCostConfig(
  auth: AuthContext,
  input: OperationalCostConfigInput,
): Promise<void> {
  await query(
    `
      insert into odonto.custo_operacional_config (
        empresa_id, quantidade_cadeiras, horas_produtivas_cadeira_mes, updated_by
      ) values ($1, $2, $3, $4)
      on conflict (empresa_id) do update set
        quantidade_cadeiras = excluded.quantidade_cadeiras,
        horas_produtivas_cadeira_mes = excluded.horas_produtivas_cadeira_mes,
        updated_by = excluded.updated_by
    `,
    [auth.empresaId, input.quantidadeCadeiras, input.horasProdutivasCadeiraMes, auth.usuarioId],
  );
}

export async function getSimplifiedDre(auth: AuthContext, input: ReportQuery) {
  const [revenueResult, expenseResult] = await Promise.all([
    query<{ receita: string; comissoes: string; procedimentos: string }>(
      `
        select
          coalesce(sum(coalesce(pr.valor, 0)), 0)::text as receita,
          coalesce(sum(
            case
              when fl.id is not null then fl.valor_comissao
              when pc.tipo = 'porcentagem' then round(coalesce(pr.valor, 0) * coalesce(pc.percentual_geral, 0) / 100, 2)
              when pc.tipo = 'valor_fixo' then coalesce(pc.valor_fixo, 0)
              else 0
            end
          ), 0)::text as comissoes,
          count(*)::text as procedimentos
        from odonto.procedimentos_realizados pr
        left join odonto.financeiro_lancamentos fl on fl.procedimento_realizado_id = pr.id and fl.empresa_id = pr.empresa_id
        left join lateral (
          select c.tipo, c.percentual_geral, c.valor_fixo
            from odonto.profissional_comissoes c
           where c.empresa_id = pr.empresa_id and c.profissional_id = pr.profissional_id and c.ativo = true
             and c.valido_desde <= pr.data_procedimento
             and (c.valido_ate is null or c.valido_ate >= pr.data_procedimento)
           order by c.valido_desde desc, c.created_at desc limit 1
        ) pc on true
        where pr.empresa_id = $1 and pr.data_procedimento between $2::date and $3::date
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<{ categoria: string; total: string }>(
      `
        select categoria, sum(valor)::text as total
          from odonto.despesas
         where empresa_id = $1 and competencia between $2::date and $3::date and status <> 'cancelada'
         group by categoria order by sum(valor) desc
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
  ]);
  const revenue = Number(revenueResult.rows[0].receita);
  const commissions = Number(revenueResult.rows[0].comissoes);
  const expenses = expenseResult.rows.map((row) => ({ categoria: row.categoria, valor: Number(row.total) }));
  const expenseTotal = money(expenses.reduce((sum, item) => sum + item.valor, 0));
  const contribution = money(revenue - commissions);
  const operationalResult = money(contribution - expenseTotal);
  return {
    resumo: {
      receitaBruta: revenue,
      procedimentos: Number(revenueResult.rows[0].procedimentos),
      comissoes: commissions,
      margemContribuicao: contribution,
      despesasOperacionais: expenseTotal,
      resultadoOperacional: operationalResult,
      margemLiquidaPercentual: revenue > 0 ? money(operationalResult / revenue * 100) : 0,
    },
    despesasPorCategoria: expenses,
  };
}

export async function getOperationalResults(auth: AuthContext, input: ReportQuery) {
  const [professionalResult, patientResult, summaryResult] = await Promise.all([
    query<{
      profissional_id: string;
      profissional_nome: string;
      profissional_cor: string;
      chave_pix: string | null;
      procedimentos: string;
      pacientes: string;
      receita: string;
      horas: string;
      comissoes: string;
    }>(
      `
        select
          p.id as profissional_id, p.nome as profissional_nome, p.cor_agenda as profissional_cor, p.chave_pix,
          count(pr.id)::text as procedimentos,
          count(distinct pr.paciente_id)::text as pacientes,
          coalesce(sum(pr.valor), 0)::text as receita,
          coalesce(sum(coalesce(cp.duracao_minutos, 30)), 0)::text as horas,
          coalesce(sum(
            case
              when fl.id is not null then fl.valor_comissao
              when pc.tipo = 'porcentagem' then round(coalesce(pr.valor, 0) * coalesce(pc.percentual_geral, 0) / 100, 2)
              when pc.tipo = 'valor_fixo' then coalesce(pc.valor_fixo, 0)
              else 0
            end
          ), 0)::text as comissoes
        from odonto.profissionais p
        left join odonto.procedimentos_realizados pr on pr.profissional_id = p.id and pr.empresa_id = p.empresa_id
          and pr.data_procedimento between $2::date and $3::date
        left join odonto.catalogo_procedimentos cp on cp.id = pr.catalogo_procedimento_id and cp.empresa_id = pr.empresa_id
        left join odonto.financeiro_lancamentos fl on fl.procedimento_realizado_id = pr.id and fl.empresa_id = pr.empresa_id
        left join lateral (
          select c.tipo, c.percentual_geral, c.valor_fixo
            from odonto.profissional_comissoes c
           where c.empresa_id = p.empresa_id and c.profissional_id = p.id and c.ativo = true
             and c.valido_desde <= pr.data_procedimento
             and (c.valido_ate is null or c.valido_ate >= pr.data_procedimento)
           order by c.valido_desde desc, c.created_at desc limit 1
        ) pc on true
        where p.empresa_id = $1 and p.status = 'ativo'
        group by p.id
        order by sum(coalesce(pr.valor, 0)) desc, p.nome
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<{
      paciente_id: string;
      paciente_nome: string;
      procedimentos: string;
      receita: string;
      ultima_visita: string;
    }>(
      `
        select pac.id as paciente_id, pac.nome as paciente_nome, count(pr.id)::text as procedimentos,
               sum(coalesce(pr.valor, 0))::text as receita, max(pr.data_procedimento)::text as ultima_visita
          from odonto.procedimentos_realizados pr
          inner join odonto.pacientes pac on pac.id = pr.paciente_id and pac.empresa_id = pr.empresa_id
         where pr.empresa_id = $1 and pr.data_procedimento between $2::date and $3::date
         group by pac.id order by sum(coalesce(pr.valor, 0)) desc, pac.nome limit 10
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<{ pacientes: string }>(
      `
        select count(distinct paciente_id)::text as pacientes
          from odonto.procedimentos_realizados
         where empresa_id = $1 and data_procedimento between $2::date and $3::date
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
  ]);
  const profissionais = professionalResult.rows.map((row) => ({
    profissionalId: row.profissional_id,
    profissionalNome: row.profissional_nome,
    profissionalCor: row.profissional_cor,
    chavePix: row.chave_pix,
    procedimentos: Number(row.procedimentos),
    pacientes: Number(row.pacientes),
    receita: Number(row.receita),
    horasTrabalhadas: money(Number(row.horas) / 60),
    comissoes: Number(row.comissoes),
    resultadoClinica: money(Number(row.receita) - Number(row.comissoes)),
  }));
  const pacientes = patientResult.rows.map((row) => ({
    pacienteId: row.paciente_id,
    pacienteNome: row.paciente_nome,
    procedimentos: Number(row.procedimentos),
    receita: Number(row.receita),
    ultimaVisita: row.ultima_visita,
  }));
  return {
    profissionais,
    pacientes,
    resumo: {
      receita: money(profissionais.reduce((sum, item) => sum + item.receita, 0)),
      comissoes: money(profissionais.reduce((sum, item) => sum + item.comissoes, 0)),
      horasTrabalhadas: money(profissionais.reduce((sum, item) => sum + item.horasTrabalhadas, 0)),
      pacientes: Number(summaryResult.rows[0]?.pacientes ?? 0),
    },
  };
}
