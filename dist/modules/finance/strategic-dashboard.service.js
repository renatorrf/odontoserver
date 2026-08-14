"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStrategicDashboard = getStrategicDashboard;
const pool_1 = require("../../database/pool");
function money(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function localDate(value) {
    return value.toISOString().slice(0, 10);
}
function previousPeriod(input) {
    const start = new Date(`${input.inicio}T00:00:00.000Z`);
    const end = new Date(`${input.fim}T00:00:00.000Z`);
    const duration = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const previousEnd = new Date(start);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - duration + 1);
    return { inicio: localDate(previousStart), fim: localDate(previousEnd) };
}
function variation(current, previous) {
    if (previous === 0) {
        return current === 0 ? 0 : null;
    }
    return money(((current - previous) / Math.abs(previous)) * 100);
}
async function loadSummary(auth, input) {
    const [revenueResult, projectionResult, expenseResult] = await Promise.all([
        (0, pool_1.query)(`
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
      `, [auth.empresaId, input.inicio, input.fim]),
        (0, pool_1.query)(`
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
      `, [auth.empresaId, input.inicio, input.fim]),
        (0, pool_1.query)(`
        select
          coalesce(sum(valor), 0)::text as despesas,
          coalesce(sum(valor) filter (where status = 'paga'), 0)::text as despesas_pagas,
          coalesce(sum(valor) filter (where status = 'pendente'), 0)::text as despesas_pendentes
        from odonto.despesas
        where empresa_id = $1
          and competencia between $2::date and $3::date
          and status <> 'cancelada'
      `, [auth.empresaId, input.inicio, input.fim]),
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
async function getStrategicDashboard(auth, input) {
    const start = new Date(`${input.inicio}T00:00:00.000Z`);
    const end = new Date(`${input.fim}T00:00:00.000Z`);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const unit = days <= 45 ? 'day' : 'month';
    const interval = unit === 'day' ? '1 day' : '1 month';
    const trunc = unit === 'day' ? 'day' : 'month';
    const previous = previousPeriod(input);
    const [currentSummary, previousSummary, seriesResult, categoryResult, professionalResult] = await Promise.all([
        loadSummary(auth, input),
        loadSummary(auth, previous),
        (0, pool_1.query)(`
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
      `, [auth.empresaId, input.inicio, input.fim]),
        (0, pool_1.query)(`
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
      `, [auth.empresaId, input.inicio, input.fim]),
        (0, pool_1.query)(`
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
      `, [auth.empresaId, input.inicio, input.fim]),
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
    };
}
