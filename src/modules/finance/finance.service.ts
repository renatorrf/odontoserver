import { PoolClient } from 'pg';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { conflict, notFound } from '../../utils/http-error';
import { BillProceduresInput, FinanceStatementQuery, PaymentStatusInput } from './finance.schemas';

interface StatementRow {
  procedimento_id: string;
  lancamento_id: string | null;
  data_procedimento: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  profissional_chave_pix: string | null;
  descricao: string;
  valor_procedimento: string;
  comissao_configurada: boolean;
  comissao_tipo: 'porcentagem' | 'valor_fixo' | null;
  percentual_comissao: string | null;
  valor_fixo_comissao: string | null;
  valor_comissao: string;
  status_pagamento: 'pendente' | 'pago' | null;
  faturado_em: string | null;
  pago_em: string | null;
  banco_id: string | null;
  banco_nome: string | null;
  forma_pagamento: string | null;
  referencia_pagamento: string | null;
  observacoes_pagamento: string | null;
}

interface ProcedureForBillingRow {
  id: string;
  profissional_id: string;
  data_procedimento: string;
  valor: string | null;
  lancamento_id: string | null;
}

interface CommissionForBillingRow {
  id: string;
  tipo: 'porcentagem' | 'valor_fixo';
  percentual_geral: string | null;
  valor_fixo: string | null;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function commissionValue(
  procedureValue: number,
  commission: CommissionForBillingRow | undefined,
): number {
  if (!commission) {
    return 0;
  }
  if (commission.tipo === 'valor_fixo') {
    return money(Number(commission.valor_fixo ?? 0));
  }
  return money(procedureValue * Number(commission.percentual_geral ?? 0) / 100);
}

async function findCommission(
  client: PoolClient,
  empresaId: string,
  profissionalId: string,
  procedureDate: string,
): Promise<CommissionForBillingRow | undefined> {
  const result = await client.query<CommissionForBillingRow>(
    `
      select id, tipo, percentual_geral, valor_fixo
        from odonto.profissional_comissoes
       where empresa_id = $1
         and profissional_id = $2
         and ativo = true
         and valido_desde <= $3::date
         and (valido_ate is null or valido_ate >= $3::date)
       order by valido_desde desc, created_at desc
       limit 1
    `,
    [empresaId, profissionalId, procedureDate],
  );
  return result.rows[0];
}

export async function getFinanceStatement(auth: AuthContext, input: FinanceStatementQuery) {
  const result = await query<StatementRow>(
    `
      select
        pr.id as procedimento_id,
        fl.id as lancamento_id,
        pr.data_procedimento,
        pac.id as paciente_id,
        pac.nome as paciente_nome,
        p.id as profissional_id,
        p.nome as profissional_nome,
        p.chave_pix as profissional_chave_pix,
        pr.descricao,
        coalesce(fl.valor_procedimento, pr.valor, 0)::text as valor_procedimento,
        (case when fl.id is not null then fl.comissao_configuracao_id is not null else pc.id is not null end) as comissao_configurada,
        coalesce(fl.comissao_tipo::text, pc.tipo::text) as comissao_tipo,
        coalesce(fl.percentual_comissao, pc.percentual_geral)::text as percentual_comissao,
        coalesce(fl.valor_fixo_comissao, pc.valor_fixo)::text as valor_fixo_comissao,
        (
          case
            when fl.id is not null then fl.valor_comissao
            when pc.tipo = 'porcentagem' then round(coalesce(pr.valor, 0) * coalesce(pc.percentual_geral, 0) / 100, 2)
            when pc.tipo = 'valor_fixo' then coalesce(pc.valor_fixo, 0)
            else 0
          end
        )::text as valor_comissao,
        fl.status_pagamento::text as status_pagamento,
        fl.faturado_em,
        fl.pago_em,
        fl.banco_id,
        b.nome as banco_nome,
        fl.forma_pagamento::text,
        fl.referencia_pagamento,
        fl.observacoes_pagamento
      from odonto.procedimentos_realizados pr
      inner join odonto.pacientes pac on pac.id = pr.paciente_id and pac.empresa_id = pr.empresa_id
      inner join odonto.profissionais p on p.id = pr.profissional_id and p.empresa_id = pr.empresa_id
      left join odonto.financeiro_lancamentos fl
        on fl.procedimento_realizado_id = pr.id and fl.empresa_id = pr.empresa_id
      left join odonto.bancos b on b.id = fl.banco_id and b.empresa_id = fl.empresa_id
      left join lateral (
        select pc.*
          from odonto.profissional_comissoes pc
         where pc.empresa_id = pr.empresa_id
           and pc.profissional_id = pr.profissional_id
           and pc.ativo = true
           and pc.valido_desde <= pr.data_procedimento
           and (pc.valido_ate is null or pc.valido_ate >= pr.data_procedimento)
         order by pc.valido_desde desc, pc.created_at desc
         limit 1
      ) pc on true
      where pr.empresa_id = $1
        and pr.data_procedimento between $2::date and $3::date
        and ($4::uuid is null or pr.profissional_id = $4::uuid)
        and (
          ($5 = 'nao_faturados' and fl.id is null)
          or ($5 = 'faturados' and fl.id is not null)
        )
        and ($6 = 'todos' or fl.status_pagamento::text = $6)
      order by p.nome, pr.data_procedimento desc, pr.created_at desc
    `,
    [auth.empresaId, input.inicio, input.fim, input.profissionalId ?? null, input.situacao, input.pagamento],
  );

  const items = result.rows.map((row) => ({
    procedimentoId: row.procedimento_id,
    lancamentoId: row.lancamento_id,
    dataProcedimento: row.data_procedimento,
    pacienteId: row.paciente_id,
    pacienteNome: row.paciente_nome,
    profissionalId: row.profissional_id,
    profissionalNome: row.profissional_nome,
    profissionalChavePix: row.profissional_chave_pix,
    descricao: row.descricao,
    valorProcedimento: Number(row.valor_procedimento),
    comissaoConfigurada: row.comissao_configurada,
    comissaoTipo: row.comissao_tipo,
    percentualComissao: row.percentual_comissao == null ? null : Number(row.percentual_comissao),
    valorFixoComissao: row.valor_fixo_comissao == null ? null : Number(row.valor_fixo_comissao),
    valorComissao: Number(row.valor_comissao),
    statusPagamento: row.status_pagamento,
    faturadoEm: row.faturado_em,
    pagoEm: row.pago_em,
    bancoId: row.banco_id,
    bancoNome: row.banco_nome,
    formaPagamento: row.forma_pagamento,
    referenciaPagamento: row.referencia_pagamento,
    observacoesPagamento: row.observacoes_pagamento,
  }));

  return {
    items,
    resumo: {
      quantidade: items.length,
      profissionais: new Set(items.map((item) => item.profissionalId)).size,
      valorProcedimentos: money(items.reduce((total, item) => total + item.valorProcedimento, 0)),
      valorComissoes: money(items.reduce((total, item) => total + item.valorComissao, 0)),
    },
  };
}

export async function billProcedures(auth: AuthContext, input: BillProceduresInput): Promise<number> {
  const uniqueIds = [...new Set(input.procedimentoIds)];

  return transaction(async (client) => {
    const result = await client.query<ProcedureForBillingRow>(
      `
        select pr.id, pr.profissional_id, pr.data_procedimento, pr.valor, fl.id as lancamento_id
          from odonto.procedimentos_realizados pr
          left join odonto.financeiro_lancamentos fl
            on fl.procedimento_realizado_id = pr.id and fl.empresa_id = pr.empresa_id
         where pr.empresa_id = $1
           and pr.id = any($2::uuid[])
         for update of pr
      `,
      [auth.empresaId, uniqueIds],
    );

    if (result.rows.length !== uniqueIds.length) {
      throw notFound('Um dos procedimentos realizados nao foi encontrado.');
    }
    if (result.rows.some((row) => !row.profissional_id)) {
      throw conflict('Vincule todos os procedimentos a um profissional antes de faturar.');
    }
    if (result.rows.some((row) => row.lancamento_id)) {
      throw conflict('Um dos procedimentos selecionados ja foi faturado.');
    }

    for (const procedure of result.rows) {
      const commission = await findCommission(
        client,
        auth.empresaId,
        procedure.profissional_id,
        procedure.data_procedimento,
      );
      const procedureValue = money(Number(procedure.valor ?? 0));
      const calculatedCommission = commissionValue(procedureValue, commission);

      await client.query(
        `
          insert into odonto.financeiro_lancamentos (
            empresa_id, procedimento_realizado_id, profissional_id, comissao_configuracao_id,
            valor_procedimento, comissao_tipo, percentual_comissao, valor_fixo_comissao,
            valor_comissao, status_pagamento, faturado_por
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendente', $10)
        `,
        [
          auth.empresaId,
          procedure.id,
          procedure.profissional_id,
          commission?.id ?? null,
          procedureValue,
          commission?.tipo ?? null,
          commission?.tipo === 'porcentagem' ? Number(commission.percentual_geral ?? 0) : null,
          commission?.tipo === 'valor_fixo' ? Number(commission.valor_fixo ?? 0) : null,
          calculatedCommission,
          auth.usuarioId,
        ],
      );
    }

    return result.rows.length;
  });
}

export async function updatePaymentStatus(
  auth: AuthContext,
  id: string,
  input: PaymentStatusInput,
): Promise<void> {
  await transaction(async (client) => {
    if (input.bancoId) {
      const bank = await client.query('select 1 from odonto.bancos where id = $1 and empresa_id = $2 limit 1', [
        input.bancoId,
        auth.empresaId,
      ]);
      if (!bank.rowCount) {
        throw notFound('Conta bancaria nao encontrada.');
      }
    }

    const result = await client.query(
      `
        update odonto.financeiro_lancamentos
           set status_pagamento = $3::odonto.pagamento_profissional_status,
               banco_id = $4,
               forma_pagamento = $5::odonto.forma_pagamento,
               referencia_pagamento = $6,
               observacoes_pagamento = $7,
               pago_em = case when $3::text = 'pago' then coalesce($8::date::timestamptz, now()) else null end,
               pago_por = case when $3::text = 'pago' then $9::uuid else null end
         where id = $1 and empresa_id = $2
      `,
      [
        id,
        auth.empresaId,
        input.status,
        input.bancoId ?? null,
        input.formaPagamento ?? null,
        input.referenciaPagamento ?? null,
        input.observacoesPagamento ?? null,
        input.pagoEm ?? null,
        auth.usuarioId,
      ],
    );
    if (!result.rowCount) {
      throw notFound('Lancamento financeiro nao encontrado.');
    }
  });
}
