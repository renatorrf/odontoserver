import { query } from '../../database/pool';
import { AuthContext } from '../../types/public';

interface CashRow {
  id: string;
  tipo: 'faturamento' | 'recebimento' | 'despesa' | 'comissao' | 'estorno';
  natureza: 'entrada' | 'saida' | 'informativo';
  ocorrido_em: string;
  descricao: string;
  pessoa: string;
  valor: string;
  forma_pagamento: string | null;
  banco_nome: string | null;
  referencia: string | null;
}

export async function getDailyCash(auth: AuthContext, date: string) {
  const result = await query<CashRow>(`
    with movimentos as (
      select fl.id, 'faturamento'::text as tipo, 'informativo'::text as natureza,
             fl.created_at as ocorrido_em, fl.descricao, p.nome as pessoa, fl.valor,
             null::text as forma_pagamento, null::text as banco_nome, null::text as referencia
        from odonto.paciente_financeiro_lancamentos fl
        join odonto.pacientes p on p.id = fl.paciente_id and p.empresa_id = fl.empresa_id
       where fl.empresa_id = $1 and (fl.created_at at time zone 'America/Sao_Paulo')::date = $2::date
         and fl.status <> 'cancelado'
      union all
      select pg.id, 'recebimento', 'entrada', pg.pago_em,
             fl.descricao, p.nome, pg.valor, pg.forma_pagamento::text, b.nome, pg.referencia
        from odonto.paciente_financeiro_pagamentos pg
        join odonto.paciente_financeiro_lancamentos fl on fl.id = pg.lancamento_id and fl.empresa_id = pg.empresa_id
        join odonto.pacientes p on p.id = fl.paciente_id and p.empresa_id = fl.empresa_id
        left join odonto.bancos b on b.id = pg.banco_id and b.empresa_id = pg.empresa_id
       where pg.empresa_id = $1 and (pg.pago_em at time zone 'America/Sao_Paulo')::date = $2::date
         and pg.estornado_em is null
      union all
      select pg.id, 'estorno', 'saida', pg.estornado_em,
             'Estorno de ' || fl.descricao, p.nome, pg.valor, pg.forma_pagamento::text, b.nome, pg.referencia_estorno
        from odonto.paciente_financeiro_pagamentos pg
        join odonto.paciente_financeiro_lancamentos fl on fl.id = pg.lancamento_id and fl.empresa_id = pg.empresa_id
        join odonto.pacientes p on p.id = fl.paciente_id and p.empresa_id = fl.empresa_id
        left join odonto.bancos b on b.id = pg.banco_id and b.empresa_id = pg.empresa_id
       where pg.empresa_id = $1 and (pg.estornado_em at time zone 'America/Sao_Paulo')::date = $2::date
      union all
      select d.id, 'despesa', 'saida', d.paga_em::timestamp,
             d.descricao, coalesce(d.fornecedor, 'Despesa da clinica'), d.valor, d.forma_pagamento::text, b.nome, d.referencia_pagamento
        from odonto.despesas d
        left join odonto.bancos b on b.id = d.banco_id and b.empresa_id = d.empresa_id
       where d.empresa_id = $1 and d.status = 'paga' and d.paga_em = $2::date
      union all
      select fl.id, 'comissao', 'saida', fl.pago_em,
             'Comissao profissional', p.nome, fl.valor_comissao, fl.forma_pagamento::text, b.nome, fl.referencia_pagamento
        from odonto.financeiro_lancamentos fl
        join odonto.profissionais p on p.id = fl.profissional_id and p.empresa_id = fl.empresa_id
        left join odonto.bancos b on b.id = fl.banco_id and b.empresa_id = fl.empresa_id
       where fl.empresa_id = $1 and fl.status_pagamento = 'pago'
         and (fl.pago_em at time zone 'America/Sao_Paulo')::date = $2::date
         and fl.valor_comissao > 0
    )
    select id::text, tipo, natureza, ocorrido_em::text, descricao, pessoa, valor::text,
           forma_pagamento, banco_nome, referencia
      from movimentos order by ocorrido_em desc, descricao
  `, [auth.empresaId, date]);

  const items = result.rows.map((row) => ({
    id: row.id,
    tipo: row.tipo,
    natureza: row.natureza,
    ocorridoEm: row.ocorrido_em,
    descricao: row.descricao,
    pessoa: row.pessoa,
    valor: Number(row.valor),
    formaPagamento: row.forma_pagamento,
    bancoNome: row.banco_nome,
    referencia: row.referencia,
  }));
  const total = (type: CashRow['tipo']) => items.filter((item) => item.tipo === type).reduce((sum, item) => sum + item.valor, 0);
  const recebido = total('recebimento');
  const saidas = total('despesa') + total('comissao') + total('estorno');
  const byMethod = new Map<string, { forma: string; valor: number; quantidade: number }>();
  items.filter((item) => item.tipo === 'recebimento').forEach((item) => {
    const key = item.formaPagamento ?? 'nao_informado';
    const current = byMethod.get(key) ?? { forma: key, valor: 0, quantidade: 0 };
    current.valor += item.valor;
    current.quantidade += 1;
    byMethod.set(key, current);
  });

  return {
    data: date,
    resumo: {
      faturado: total('faturamento'),
      recebido,
      saidas,
      saldo: Math.round((recebido - saidas) * 100) / 100,
      movimentos: items.length,
    },
    recebimentosPorForma: [...byMethod.values()].sort((a, b) => b.valor - a.valor),
    movimentos: items,
  };
}
