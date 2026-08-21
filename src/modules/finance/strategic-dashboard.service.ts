import { query } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { ReportQuery, StrategicCategoryDetailQuery } from './management.schemas';

interface RevenueSummaryRow {
  receita: string;
  comissoes: string;
  procedimentos: string;
  pacientes: string;
}

interface ProjectionSummaryRow {
  receita: string;
  comissoes: string;
  procedimentos: string;
  agendamentos: string;
}

interface ExpenseSummaryRow {
  despesas: string;
  despesas_pagas: string;
  despesas_pendentes: string;
}

interface SeriesRow {
  periodo: string;
  receita_realizada: string;
  receita_projetada: string;
  comissoes: string;
  despesas: string;
}

interface CategoryRow {
  categoria: string;
  realizado: string;
  projetado: string;
  procedimentos: string;
}

interface CategoryProcedureRow {
  id: string;
  origem: 'realizado' | 'agendado';
  procedimento: string;
  paciente_id: string | null;
  paciente_nome: string | null;
  profissional_id: string | null;
  profissional_nome: string | null;
  data: string;
  horario: string | null;
  quantidade: string;
  valor_unitario: string;
  valor_total: string;
  status: string;
}

interface ProfessionalRow {
  profissional_id: string;
  profissional_nome: string;
  profissional_cor: string;
  realizado: string;
  projetado: string;
  comissoes: string;
  procedimentos_realizados: string;
  procedimentos_agendados: string;
  pacientes: string;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function localDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function previousPeriod(input: ReportQuery): ReportQuery {
  const start = new Date(`${input.inicio}T00:00:00.000Z`);
  const end = new Date(`${input.fim}T00:00:00.000Z`);
  const duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - duration + 1);
  return { inicio: localDate(previousStart), fim: localDate(previousEnd) };
}

function variation(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return money(((current - previous) / Math.abs(previous)) * 100);
}

export async function listStrategicCategoryProcedures(auth: AuthContext, input: StrategicCategoryDetailQuery) {
  const result = await query<CategoryProcedureRow>(
    `select pr.id, 'realizado'::text as origem,
            coalesce(cp.nome, pr.descricao) as procedimento,
            pa.id as paciente_id, pa.nome as paciente_nome,
            pf.id as profissional_id, coalesce(pf.nome, pr.profissional_nome) as profissional_nome,
            pr.data_procedimento::text as data, null::text as horario,
            '1'::text as quantidade, coalesce(pr.valor, 0)::text as valor_unitario,
            coalesce(pr.valor, 0)::text as valor_total, 'realizado'::text as status
       from odonto.procedimentos_realizados pr
       left join odonto.catalogo_procedimentos cp
         on cp.id = pr.catalogo_procedimento_id and cp.empresa_id = pr.empresa_id
       left join odonto.pacientes pa on pa.id = pr.paciente_id and pa.empresa_id = pr.empresa_id
       left join odonto.profissionais pf on pf.id = pr.profissional_id and pf.empresa_id = pr.empresa_id
      where pr.empresa_id = $1 and pr.data_procedimento between $2::date and $3::date
        and coalesce(cp.categoria, 'Sem categoria') = $4
      union all
     select aep.id, 'agendado'::text as origem,
            coalesce(cp.nome, aep.descricao) as procedimento,
            pa.id as paciente_id, pa.nome as paciente_nome,
            pf.id as profissional_id, pf.nome as profissional_nome,
            to_char(ae.inicio_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as data,
            case when ae.dia_inteiro then null else to_char(ae.inicio_em at time zone 'America/Sao_Paulo', 'HH24:MI') end as horario,
            coalesce(aep.quantidade, 1)::text as quantidade,
            coalesce(aep.valor, cp.valor, 0)::text as valor_unitario,
            (coalesce(aep.valor, cp.valor, 0) * coalesce(aep.quantidade, 1))::text as valor_total,
            ae.status::text as status
       from odonto.agenda_eventos ae
       inner join odonto.agenda_evento_procedimentos aep
         on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
       left join odonto.catalogo_procedimentos cp
         on cp.id = aep.catalogo_procedimento_id and cp.empresa_id = ae.empresa_id
       left join odonto.pacientes pa on pa.id = ae.paciente_id and pa.empresa_id = ae.empresa_id
       left join odonto.profissionais pf on pf.id = ae.profissional_id and pf.empresa_id = ae.empresa_id
      where ae.empresa_id = $1
        and ae.inicio_em >= $2::date and ae.inicio_em < ($3::date + interval '1 day')
        and ae.status in ('agendado', 'confirmado', 'em_atendimento')
        and coalesce(cp.categoria, 'Sem categoria') = $4
      order by data desc, horario desc nulls last, procedimento`,
    [auth.empresaId, input.inicio, input.fim, input.categoria],
  );

  const items = result.rows.map((row) => ({
    id: row.id,
    origem: row.origem,
    procedimento: row.procedimento,
    pacienteId: row.paciente_id,
    pacienteNome: row.paciente_nome,
    profissionalId: row.profissional_id,
    profissionalNome: row.profissional_nome,
    data: row.data,
    horario: row.horario,
    quantidade: Number(row.quantidade),
    valorUnitario: Number(row.valor_unitario),
    valorTotal: Number(row.valor_total),
    status: row.status,
  }));
  const realizado = money(items.filter((item) => item.origem === 'realizado').reduce((sum, item) => sum + item.valorTotal, 0));
  const projetado = money(items.filter((item) => item.origem === 'agendado').reduce((sum, item) => sum + item.valorTotal, 0));
  return {
    categoria: input.categoria,
    resumo: { realizado, projetado, total: money(realizado + projetado), procedimentos: items.reduce((sum, item) => sum + item.quantidade, 0) },
    items,
  };
}

async function loadBillingBreakdown(auth: AuthContext, input: ReportQuery) {
  const [totals, receivedMethods, pendingMethods, orthodontics] = await Promise.all([
    query<{ faturado: string; recebido: string; atendimentos: string }>(
      `select coalesce(sum(fl.valor),0)::text as faturado,
              coalesce(sum(coalesce(pay.recebido,0)),0)::text as recebido,
              count(distinct fl.orcamento_id)::text as atendimentos
         from odonto.paciente_financeiro_lancamentos fl
         left join lateral (
           select sum(pg.valor) as recebido
             from odonto.paciente_financeiro_pagamentos pg
            where pg.empresa_id=fl.empresa_id and pg.lancamento_id=fl.id and pg.estornado_em is null
         ) pay on true
        where fl.empresa_id=$1 and fl.vencimento between $2::date and $3::date and fl.status<>'cancelado'`,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<{ forma: string; valor: string }>(
      `select pg.forma_pagamento::text as forma, sum(pg.valor)::text as valor
         from odonto.paciente_financeiro_pagamentos pg
         join odonto.paciente_financeiro_lancamentos fl
           on fl.id=pg.lancamento_id and fl.empresa_id=pg.empresa_id
        where pg.empresa_id=$1 and fl.vencimento between $2::date and $3::date
          and fl.status<>'cancelado' and pg.estornado_em is null
        group by pg.forma_pagamento order by sum(pg.valor) desc`,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<{ forma: string; valor: string }>(
      `select coalesce(last_payment.forma,'nao_definida') as forma,
              sum(greatest(fl.valor-coalesce(pay.recebido,0),0))::text as valor
         from odonto.paciente_financeiro_lancamentos fl
         left join lateral (
           select sum(pg.valor) as recebido
             from odonto.paciente_financeiro_pagamentos pg
            where pg.empresa_id=fl.empresa_id and pg.lancamento_id=fl.id and pg.estornado_em is null
         ) pay on true
         left join lateral (
           select pg.forma_pagamento::text as forma
             from odonto.paciente_financeiro_pagamentos pg
            where pg.empresa_id=fl.empresa_id and pg.lancamento_id=fl.id and pg.estornado_em is null
            order by pg.pago_em desc limit 1
         ) last_payment on true
        where fl.empresa_id=$1 and fl.vencimento between $2::date and $3::date and fl.status<>'cancelado'
          and greatest(fl.valor-coalesce(pay.recebido,0),0)>0
        group by coalesce(last_payment.forma,'nao_definida') order by sum(greatest(fl.valor-coalesce(pay.recebido,0),0)) desc`,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<{ faturado: string; recebido: string; atendimentos: string }>(
      `select coalesce(sum(fl.valor),0)::text as faturado,
              coalesce(sum(coalesce(pay.recebido,0)),0)::text as recebido,
              count(distinct fl.orcamento_id)::text as atendimentos
         from odonto.paciente_financeiro_lancamentos fl
         left join lateral (
           select sum(pg.valor) as recebido
             from odonto.paciente_financeiro_pagamentos pg
            where pg.empresa_id=fl.empresa_id and pg.lancamento_id=fl.id and pg.estornado_em is null
         ) pay on true
        where fl.empresa_id=$1 and fl.vencimento between $2::date and $3::date and fl.status<>'cancelado'
          and exists (
            select 1 from odonto.orcamento_itens oi
            left join odonto.catalogo_procedimentos cp on cp.id=oi.catalogo_procedimento_id
            where oi.orcamento_id=fl.orcamento_id
              and (coalesce(cp.categoria,'') ilike '%ortod%' or oi.descricao ilike '%ortod%')
          )`,
      [auth.empresaId, input.inicio, input.fim],
    ),
  ]);
  const total = totals.rows[0];
  const ortho = orthodontics.rows[0];
  const faturado = Number(total.faturado);
  const recebido = Number(total.recebido);
  const orthoFaturado = Number(ortho.faturado);
  const orthoRecebido = Number(ortho.recebido);
  return {
    faturado,
    recebido,
    naoRecebido: money(Math.max(faturado - recebido, 0)),
    ticketMedio: Number(total.atendimentos) ? money(faturado / Number(total.atendimentos)) : 0,
    recebidoPorForma: receivedMethods.rows.map((row) => ({ forma: row.forma, valor: Number(row.valor) })),
    pendentePorForma: pendingMethods.rows.map((row) => ({ forma: row.forma, valor: Number(row.valor) })),
    ortodontia: {
      faturado: orthoFaturado,
      recebido: orthoRecebido,
      naoRecebido: money(Math.max(orthoFaturado - orthoRecebido, 0)),
      ticketMedio: Number(ortho.atendimentos) ? money(orthoFaturado / Number(ortho.atendimentos)) : 0,
    },
  };
}

async function loadSummary(auth: AuthContext, input: ReportQuery) {
  const [revenueResult, projectionResult, expenseResult] = await Promise.all([
    query<RevenueSummaryRow>(
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
          count(pr.id)::text as procedimentos,
          count(distinct pr.paciente_id)::text as pacientes
        from odonto.procedimentos_realizados pr
        left join odonto.financeiro_lancamentos fl
          on fl.procedimento_realizado_id = pr.id and fl.empresa_id = pr.empresa_id
        left join lateral (
          select c.tipo, c.percentual_geral, c.valor_fixo
            from odonto.profissional_comissoes c
           where c.empresa_id = pr.empresa_id
             and c.profissional_id = pr.profissional_id
             and c.ativo = true
             and c.valido_desde <= pr.data_procedimento
             and (c.valido_ate is null or c.valido_ate >= pr.data_procedimento)
           order by c.valido_desde desc, c.created_at desc
           limit 1
        ) pc on true
        where pr.empresa_id = $1
          and pr.data_procedimento between $2::date and $3::date
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<ProjectionSummaryRow>(
      `
        select
          coalesce(sum(coalesce(aep.valor, cp.valor, 0) * coalesce(aep.quantidade, 1)), 0)::text as receita,
          coalesce(sum(
            case
              when pc.tipo = 'porcentagem' then round(
                coalesce(aep.valor, cp.valor, 0) * coalesce(aep.quantidade, 1) * coalesce(pc.percentual_geral, 0) / 100,
                2
              )
              when pc.tipo = 'valor_fixo' then coalesce(pc.valor_fixo, 0) * coalesce(aep.quantidade, 1)
              else 0
            end
          ), 0)::text as comissoes,
          coalesce(sum(coalesce(aep.quantidade, 1)), 0)::text as procedimentos,
          count(distinct ae.id)::text as agendamentos
        from odonto.agenda_eventos ae
        inner join odonto.agenda_evento_procedimentos aep
          on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
        left join odonto.catalogo_procedimentos cp
          on cp.id = aep.catalogo_procedimento_id and cp.empresa_id = ae.empresa_id
        left join lateral (
          select c.tipo, c.percentual_geral, c.valor_fixo
            from odonto.profissional_comissoes c
           where c.empresa_id = ae.empresa_id
             and c.profissional_id = ae.profissional_id
             and c.ativo = true
             and c.valido_desde <= ae.inicio_em::date
             and (c.valido_ate is null or c.valido_ate >= ae.inicio_em::date)
           order by c.valido_desde desc, c.created_at desc
           limit 1
        ) pc on true
        where ae.empresa_id = $1
          and ae.inicio_em >= $2::date
          and ae.inicio_em < ($3::date + interval '1 day')
          and ae.status in ('agendado', 'confirmado', 'em_atendimento')
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<ExpenseSummaryRow>(
      `
        select
          coalesce(sum(valor), 0)::text as despesas,
          coalesce(sum(valor) filter (where status = 'paga'), 0)::text as despesas_pagas,
          coalesce(sum(valor) filter (where status = 'pendente'), 0)::text as despesas_pendentes
        from odonto.despesas
        where empresa_id = $1
          and competencia between $2::date and $3::date
          and status <> 'cancelada'
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
  ]);

  const revenue = revenueResult.rows[0];
  const projection = projectionResult.rows[0];
  const expenses = expenseResult.rows[0];
  const receitaRealizada = Number(revenue.receita);
  const receitaProjetada = Number(projection.receita);
  const comissoesRealizadas = Number(revenue.comissoes);
  const comissoesProjetadas = Number(projection.comissoes);
  const despesas = Number(expenses.despesas);
  const pacientes = Number(revenue.pacientes);

  return {
    receitaRealizada,
    receitaProjetada,
    receitaPotencial: money(receitaRealizada + receitaProjetada),
    comissoesRealizadas,
    comissoesProjetadas,
    despesas,
    despesasPagas: Number(expenses.despesas_pagas),
    despesasPendentes: Number(expenses.despesas_pendentes),
    resultadoOperacional: money(receitaRealizada - comissoesRealizadas - despesas),
    ticketMedio: pacientes > 0 ? money(receitaRealizada / pacientes) : 0,
    procedimentosRealizados: Number(revenue.procedimentos),
    procedimentosAgendados: Number(projection.procedimentos),
    agendamentos: Number(projection.agendamentos),
    pacientes,
  };
}

export async function getStrategicDashboard(auth: AuthContext, input: ReportQuery) {
  const start = new Date(`${input.inicio}T00:00:00.000Z`);
  const end = new Date(`${input.fim}T00:00:00.000Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const unit = days <= 45 ? 'day' : 'month';
  const interval = unit === 'day' ? '1 day' : '1 month';
  const trunc = unit === 'day' ? 'day' : 'month';
  const previous = previousPeriod(input);

  const [currentSummary, previousSummary, seriesResult, categoryResult, professionalResult, billing, expenseCategoryResult] = await Promise.all([
    loadSummary(auth, input),
    loadSummary(auth, previous),
    query<SeriesRow>(
      `
        with periods as (
          select generate_series(
            date_trunc('${trunc}', $2::date),
            date_trunc('${trunc}', $3::date),
            interval '${interval}'
          )::date as periodo
        ), realized as (
          select date_trunc('${trunc}', pr.data_procedimento)::date as periodo,
                 sum(coalesce(pr.valor, 0)) as receita,
                 sum(case
                   when fl.id is not null then fl.valor_comissao
                   when pc.tipo = 'porcentagem' then round(coalesce(pr.valor, 0) * coalesce(pc.percentual_geral, 0) / 100, 2)
                   when pc.tipo = 'valor_fixo' then coalesce(pc.valor_fixo, 0)
                   else 0 end) as comissoes
            from odonto.procedimentos_realizados pr
            left join odonto.financeiro_lancamentos fl
              on fl.procedimento_realizado_id = pr.id and fl.empresa_id = pr.empresa_id
            left join lateral (
              select c.tipo, c.percentual_geral, c.valor_fixo
                from odonto.profissional_comissoes c
               where c.empresa_id = pr.empresa_id and c.profissional_id = pr.profissional_id and c.ativo = true
                 and c.valido_desde <= pr.data_procedimento
                 and (c.valido_ate is null or c.valido_ate >= pr.data_procedimento)
               order by c.valido_desde desc, c.created_at desc limit 1
            ) pc on true
           where pr.empresa_id = $1 and pr.data_procedimento between $2::date and $3::date
           group by 1
        ), projected as (
          select date_trunc('${trunc}', ae.inicio_em)::date as periodo,
                 sum(coalesce(aep.valor, cp.valor, 0) * coalesce(aep.quantidade, 1)) as receita
            from odonto.agenda_eventos ae
            inner join odonto.agenda_evento_procedimentos aep
              on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
            left join odonto.catalogo_procedimentos cp
              on cp.id = aep.catalogo_procedimento_id and cp.empresa_id = ae.empresa_id
           where ae.empresa_id = $1
             and ae.inicio_em >= $2::date and ae.inicio_em < ($3::date + interval '1 day')
             and ae.status in ('agendado', 'confirmado', 'em_atendimento')
           group by 1
        ), expenses as (
          select date_trunc('${trunc}', competencia)::date as periodo, sum(valor) as valor
            from odonto.despesas
           where empresa_id = $1 and competencia between $2::date and $3::date and status <> 'cancelada'
           group by 1
        )
        select to_char(p.periodo, 'YYYY-MM-DD') as periodo,
               coalesce(r.receita, 0)::text as receita_realizada,
               coalesce(pr.receita, 0)::text as receita_projetada,
               coalesce(r.comissoes, 0)::text as comissoes,
               coalesce(e.valor, 0)::text as despesas
          from periods p
          left join realized r on r.periodo = p.periodo
          left join projected pr on pr.periodo = p.periodo
          left join expenses e on e.periodo = p.periodo
         order by p.periodo
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<CategoryRow>(
      `
        with realized as (
          select coalesce(cp.categoria, 'Sem categoria') as categoria,
                 sum(coalesce(pr.valor, 0)) as valor,
                 count(pr.id) as procedimentos
            from odonto.procedimentos_realizados pr
            left join odonto.catalogo_procedimentos cp
              on cp.id = pr.catalogo_procedimento_id and cp.empresa_id = pr.empresa_id
           where pr.empresa_id = $1 and pr.data_procedimento between $2::date and $3::date
           group by 1
        ), projected as (
          select coalesce(cp.categoria, 'Sem categoria') as categoria,
                 sum(coalesce(aep.valor, cp.valor, 0) * coalesce(aep.quantidade, 1)) as valor,
                 sum(coalesce(aep.quantidade, 1)) as procedimentos
            from odonto.agenda_eventos ae
            inner join odonto.agenda_evento_procedimentos aep
              on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
            left join odonto.catalogo_procedimentos cp
              on cp.id = aep.catalogo_procedimento_id and cp.empresa_id = ae.empresa_id
           where ae.empresa_id = $1
             and ae.inicio_em >= $2::date and ae.inicio_em < ($3::date + interval '1 day')
             and ae.status in ('agendado', 'confirmado', 'em_atendimento')
           group by 1
        )
        select coalesce(r.categoria, p.categoria) as categoria,
               coalesce(r.valor, 0)::text as realizado,
               coalesce(p.valor, 0)::text as projetado,
               (coalesce(r.procedimentos, 0) + coalesce(p.procedimentos, 0))::text as procedimentos
          from realized r full join projected p on p.categoria = r.categoria
         order by coalesce(r.valor, 0) + coalesce(p.valor, 0) desc
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    query<ProfessionalRow>(
      `
        select p.id as profissional_id, p.nome as profissional_nome, p.cor_agenda as profissional_cor,
               coalesce(realized.receita, 0)::text as realizado,
               coalesce(projected.receita, 0)::text as projetado,
               coalesce(realized.comissoes, 0)::text as comissoes,
               coalesce(realized.procedimentos, 0)::text as procedimentos_realizados,
               coalesce(projected.procedimentos, 0)::text as procedimentos_agendados,
               coalesce(realized.pacientes, 0)::text as pacientes
          from odonto.profissionais p
          left join lateral (
            select sum(coalesce(pr.valor, 0)) as receita, count(pr.id) as procedimentos,
                   count(distinct pr.paciente_id) as pacientes,
                   sum(case
                     when fl.id is not null then fl.valor_comissao
                     when pc.tipo = 'porcentagem' then round(coalesce(pr.valor, 0) * coalesce(pc.percentual_geral, 0) / 100, 2)
                     when pc.tipo = 'valor_fixo' then coalesce(pc.valor_fixo, 0)
                     else 0 end) as comissoes
              from odonto.procedimentos_realizados pr
              left join odonto.financeiro_lancamentos fl
                on fl.procedimento_realizado_id = pr.id and fl.empresa_id = pr.empresa_id
              left join lateral (
                select c.tipo, c.percentual_geral, c.valor_fixo
                  from odonto.profissional_comissoes c
                 where c.empresa_id = pr.empresa_id and c.profissional_id = pr.profissional_id and c.ativo = true
                   and c.valido_desde <= pr.data_procedimento
                   and (c.valido_ate is null or c.valido_ate >= pr.data_procedimento)
                 order by c.valido_desde desc, c.created_at desc limit 1
              ) pc on true
             where pr.empresa_id = p.empresa_id and pr.profissional_id = p.id
               and pr.data_procedimento between $2::date and $3::date
          ) realized on true
          left join lateral (
            select sum(coalesce(aep.valor, cp.valor, 0) * coalesce(aep.quantidade, 1)) as receita,
                   sum(coalesce(aep.quantidade, 1)) as procedimentos
              from odonto.agenda_eventos ae
              inner join odonto.agenda_evento_procedimentos aep
                on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
              left join odonto.catalogo_procedimentos cp
                on cp.id = aep.catalogo_procedimento_id and cp.empresa_id = ae.empresa_id
             where ae.empresa_id = p.empresa_id and ae.profissional_id = p.id
               and ae.inicio_em >= $2::date and ae.inicio_em < ($3::date + interval '1 day')
               and ae.status in ('agendado', 'confirmado', 'em_atendimento')
          ) projected on true
         where p.empresa_id = $1 and p.status = 'ativo'
           and (coalesce(realized.receita, 0) > 0 or coalesce(projected.receita, 0) > 0)
         order by coalesce(realized.receita, 0) + coalesce(projected.receita, 0) desc, p.nome
      `,
      [auth.empresaId, input.inicio, input.fim],
    ),
    loadBillingBreakdown(auth, input),
    query<{ categoria: string; valor: string; quantidade: string }>(
      `select categoria::text, sum(valor)::text as valor, count(*)::text as quantidade
         from odonto.despesas
        where empresa_id=$1 and competencia between $2::date and $3::date and status<>'cancelada'
        group by categoria order by sum(valor) desc`,
      [auth.empresaId, input.inicio, input.fim],
    ),
  ]);

  const series = seriesResult.rows.map((row) => {
    const receitaRealizada = Number(row.receita_realizada);
    const comissoes = Number(row.comissoes);
    const despesas = Number(row.despesas);
    return {
      periodo: row.periodo,
      receitaRealizada,
      receitaProjetada: Number(row.receita_projetada),
      comissoes,
      despesas,
      resultado: money(receitaRealizada - comissoes - despesas),
    };
  });

  return {
    periodo: { ...input, granularidade: unit === 'day' ? 'dia' : 'mes' },
    resumo: currentSummary,
    financeiro: billing,
    ortodontia: billing.ortodontia,
    comparacao: {
      periodoAnterior: previous,
      receitaRealizada: variation(currentSummary.receitaRealizada, previousSummary.receitaRealizada),
      receitaProjetada: variation(currentSummary.receitaProjetada, previousSummary.receitaProjetada),
      despesas: variation(currentSummary.despesas, previousSummary.despesas),
      resultadoOperacional: variation(currentSummary.resultadoOperacional, previousSummary.resultadoOperacional),
      ticketMedio: variation(currentSummary.ticketMedio, previousSummary.ticketMedio),
    },
    serie: series,
    categorias: categoryResult.rows.map((row) => ({
      categoria: row.categoria,
      realizado: Number(row.realizado),
      projetado: Number(row.projetado),
      procedimentos: Number(row.procedimentos),
    })),
    profissionais: professionalResult.rows.map((row) => ({
      profissionalId: row.profissional_id,
      profissionalNome: row.profissional_nome,
      profissionalCor: row.profissional_cor,
      realizado: Number(row.realizado),
      projetado: Number(row.projetado),
      comissoes: Number(row.comissoes),
      procedimentosRealizados: Number(row.procedimentos_realizados),
      procedimentosAgendados: Number(row.procedimentos_agendados),
      pacientes: Number(row.pacientes),
    })),
    despesasCategorias: expenseCategoryResult.rows.map((row) => ({
      categoria: row.categoria,
      valor: Number(row.valor),
      quantidade: Number(row.quantidade),
    })),
  };
}
