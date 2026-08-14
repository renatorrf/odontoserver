"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listReceivables = listReceivables;
exports.receiveQuote = receiveQuote;
exports.reversePayment = reversePayment;
const pool_1 = require("../../database/pool");
const http_error_1 = require("../../utils/http-error");
const receivables_calculator_1 = require("./receivables.calculator");
const baseSql = `
  with quote_values as (
    select o.id, o.empresa_id, o.paciente_id, o.nome_contato, o.whatsapp, o.origem::text,
           o.created_at, coalesce(o.validade, o.created_at::date) as vencimento,
           greatest(
             coalesce(sum(oi.valor_total), 0)
             - coalesce(sum(oi.valor_total) filter (where oi.cortesia), 0)
             - coalesce(sum(oi.desconto_valor) filter (where not oi.cortesia), 0)
             - o.desconto_valor,
             0
           ) as valor
      from odonto.orcamentos o
      left join odonto.orcamento_itens oi on oi.orcamento_id = o.id
     where o.empresa_id = $1 and o.paciente_id is not null
       and o.status not in ('cancelado', 'expirado', 'nao_aprovado', 'recusado')
     group by o.id
  ), payments as (
    select fl.orcamento_id, sum(pg.valor) filter (where pg.estornado_em is null) as valor_pago,
           max(pg.pago_em) filter (where pg.estornado_em is null) as ultimo_recebimento,
           array_agg(distinct pg.forma_pagamento::text) filter (where pg.estornado_em is null) as formas_pagamento,
           max(pg.parcelas_cartao) filter (where pg.estornado_em is null) as parcelas_cartao
      from odonto.paciente_financeiro_lancamentos fl
      left join odonto.paciente_financeiro_pagamentos pg on pg.lancamento_id = fl.id and pg.empresa_id = fl.empresa_id
     where fl.empresa_id = $1 and fl.orcamento_id is not null and fl.status <> 'cancelado'
     group by fl.orcamento_id
  )
  select q.id as orcamento_id, upper(substr(q.id::text, 1, 8)) as numero, q.paciente_id,
         p.nome as paciente_nome, coalesce(pc.celular, q.whatsapp) as whatsapp, q.origem,
         q.created_at::text as criado_em, q.vencimento::text, q.valor::text,
         coalesce(pay.valor_pago, 0)::text as valor_pago, pay.ultimo_recebimento::text,
         pay.formas_pagamento, pay.parcelas_cartao,
         case when coalesce(pay.valor_pago, 0) >= q.valor then 'pago'
              when coalesce(pay.valor_pago, 0) > 0 then 'parcialmente_pago'
              when q.vencimento < current_date then 'vencido' else 'pendente' end as status
    from quote_values q
    join odonto.pacientes p on p.id = q.paciente_id and p.empresa_id = q.empresa_id
    left join odonto.paciente_contatos pc on pc.paciente_id = p.id
    left join payments pay on pay.orcamento_id = q.id`;
function map(row) {
    const valor = Number(row.valor);
    const pago = Number(row.valor_pago);
    return { orcamentoId: row.orcamento_id, numero: row.numero, pacienteId: row.paciente_id,
        pacienteNome: row.paciente_nome, whatsapp: row.whatsapp, origem: row.origem,
        criadoEm: row.criado_em, vencimento: row.vencimento, valor, valorPago: pago,
        saldo: Math.max(0, valor - pago), ultimoRecebimento: row.ultimo_recebimento,
        formasPagamento: row.formas_pagamento ?? [], parcelasCartao: row.parcelas_cartao, status: row.status };
}
async function logRejectedFinancialOperation(auth, action, entityId, payload) {
    try {
        await (0, pool_1.query)(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
      values ($1, $2, 'financeiro', $3, $4, $5::jsonb)`, [auth.empresaId, auth.usuarioId, entityId, action,
            JSON.stringify({ perfil: auth.perfil, ...payload })]);
    }
    catch {
        // An audit failure must not replace the original business error.
    }
}
async function listReceivables(auth, input) {
    const result = await (0, pool_1.query)(`${baseSql}
    where q.created_at::date between $2 and $3
      and ($4 = 'todos' or (case when coalesce(pay.valor_pago, 0) >= q.valor then 'pago'
        when coalesce(pay.valor_pago, 0) > 0 then 'parcialmente_pago'
        when q.vencimento < current_date then 'vencido' else 'pendente' end) = $4)
      and ($5 = '' or unaccent(p.nome) ilike '%' || unaccent($5) || '%'
        or regexp_replace(coalesce(pc.celular, q.whatsapp, ''), '\\D', '', 'g') like '%' || regexp_replace($5, '\\D', '', 'g') || '%')
    order by q.vencimento, p.nome`, [auth.empresaId, input.inicio, input.fim, input.status, input.search]);
    const items = result.rows.map(map);
    return { items, resumo: { quantidade: items.length, total: items.reduce((s, i) => s + i.valor, 0),
            recebido: items.reduce((s, i) => s + i.valorPago, 0), saldo: items.reduce((s, i) => s + i.saldo, 0),
            vencido: items.filter((i) => i.status === 'vencido').reduce((s, i) => s + i.saldo, 0) } };
}
async function receiveQuote(auth, quoteId, input) {
    try {
        return await (0, pool_1.transaction)(async (client) => {
            const existingOperation = await client.query(`select id, valor::text from odonto.paciente_financeiro_pagamentos
        where empresa_id = $1 and idempotency_key = $2`, [auth.empresaId, input.idempotencyKey]);
            if (existingOperation.rowCount) {
                return { id: existingOperation.rows[0].id, valor: Number(existingOperation.rows[0].valor), idempotente: true };
            }
            const quote = await client.query(`
      select paciente_id, nome_contato, desconto_valor::text
        from odonto.orcamentos
       where id = $1 and empresa_id = $2 and status not in ('cancelado', 'expirado')
       for update`, [quoteId, auth.empresaId]);
            if (!quote.rowCount)
                throw (0, http_error_1.notFound)('Orcamento nao encontrado.');
            const current = quote.rows[0];
            if (!current.paciente_id)
                throw (0, http_error_1.badRequest)('Vincule o orcamento a um paciente antes de receber.');
            const values = await client.query(`
      select coalesce(sum(valor_total), 0)::text as bruto,
             coalesce(sum(valor_total) filter (where cortesia), 0)::text as cortesias,
             coalesce(sum(desconto_valor) filter (where not cortesia), 0)::text as descontos_itens
        from odonto.orcamento_itens where orcamento_id = $1`, [quoteId]);
            const total = Math.max(0, Number(values.rows[0].bruto) - Number(values.rows[0].cortesias)
                - Number(values.rows[0].descontos_itens) - Number(current.desconto_valor));
            if (total <= 0)
                throw (0, http_error_1.badRequest)('O orcamento nao possui valor para recebimento.');
            await client.query(`select pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [auth.empresaId, quoteId]);
            const operationAfterLock = await client.query(`select id, valor::text from odonto.paciente_financeiro_pagamentos
        where empresa_id = $1 and idempotency_key = $2`, [auth.empresaId, input.idempotencyKey]);
            if (operationAfterLock.rowCount) {
                return { id: operationAfterLock.rows[0].id, valor: Number(operationAfterLock.rows[0].valor), idempotente: true };
            }
            let titleCreated = false;
            let entry = await client.query(`select id from odonto.paciente_financeiro_lancamentos
      where empresa_id = $1 and orcamento_id = $2 and status <> 'cancelado' order by created_at limit 1 for update`, [auth.empresaId, quoteId]);
            if (!entry.rowCount) {
                entry = await client.query(`insert into odonto.paciente_financeiro_lancamentos
        (empresa_id, paciente_id, orcamento_id, descricao, vencimento, valor, created_by, updated_by)
        values ($1, $2, $3, $4, current_date, $5, $6, $6) returning id`, [auth.empresaId, current.paciente_id, quoteId, `Orcamento #${quoteId.slice(0, 8).toUpperCase()} - ${current.nome_contato}`, total, auth.usuarioId]);
                titleCreated = true;
            }
            if (titleCreated) {
                await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
        values ($1, $2, 'paciente_financeiro_lancamento', $3, 'titulo_criado', $4::jsonb)`, [auth.empresaId,
                    auth.usuarioId, entry.rows[0].id, JSON.stringify({ perfil: auth.perfil, pacienteId: current.paciente_id,
                        orcamentoId: quoteId, agendamentoId: input.agendamentoId ?? null, origem: input.origem, valor: total })]);
            }
            const paid = await client.query(`select coalesce(sum(valor), 0)::text as recebido,
      coalesce(sum(desconto), 0)::text as desconto, coalesce(sum(acrescimo), 0)::text as acrescimo
      from odonto.paciente_financeiro_pagamentos where empresa_id = $1 and lancamento_id = $2 and estornado_em is null`, [auth.empresaId, entry.rows[0].id]);
            const received = Number(paid.rows[0].recebido);
            const balance = (0, receivables_calculator_1.calculateFinancialPosition)({ valor: total, recebido: received, desconto: Number(paid.rows[0].desconto), acrescimo: Number(paid.rows[0].acrescimo) }).saldo;
            if (input.desconto > balance)
                throw (0, http_error_1.badRequest)('O desconto excede o saldo do titulo.');
            if (input.valor + input.desconto > balance + input.acrescimo + 0.005)
                throw (0, http_error_1.badRequest)(`O valor excede o saldo de ${balance.toFixed(2)}.`);
            if (input.bancoId) {
                const bank = await client.query('select 1 from odonto.bancos where id = $1 and empresa_id = $2 and ativo', [input.bancoId, auth.empresaId]);
                if (!bank.rowCount)
                    throw (0, http_error_1.badRequest)('Conta bancaria invalida ou inativa.');
            }
            const payment = await client.query(`insert into odonto.paciente_financeiro_pagamentos
      (empresa_id, lancamento_id, valor, forma_pagamento, parcelas_cartao, pago_em, referencia, banco_id, observacoes,
       desconto, acrescimo, idempotency_key, created_by)
      values ($1, $2, $3, $4::odonto.paciente_forma_pagamento, $5, coalesce($6::timestamptz, now()), $7, $8, $9, $10, $11, $12, $13) returning id`, [auth.empresaId, entry.rows[0].id, input.valor, input.formaPagamento, input.parcelasCartao ?? null,
                input.recebidoEm ?? null, input.referencia ?? null, input.bancoId ?? null, input.observacoes ?? null,
                input.desconto, input.acrescimo, input.idempotencyKey, auth.usuarioId]);
            const newPaid = received + input.valor;
            const position = (0, receivables_calculator_1.calculateFinancialPosition)({ valor: total, recebido: newPaid, desconto: Number(paid.rows[0].desconto) + input.desconto, acrescimo: Number(paid.rows[0].acrescimo) + input.acrescimo });
            const newBalance = position.saldo;
            const status = position.status;
            await client.query(`update odonto.paciente_financeiro_lancamentos set status = $3::odonto.paciente_financeiro_status,
      updated_by = $4 where id = $1 and empresa_id = $2`, [entry.rows[0].id, auth.empresaId, status, auth.usuarioId]);
            await client.query(`update odonto.orcamentos set status = case when status in ('rascunho','enviado','aguardando_aprovacao') then 'aprovado' else status end,
      updated_by = $3, updated_at = now() where id = $1 and empresa_id = $2`, [quoteId, auth.empresaId, auth.usuarioId]);
            await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
      values ($1, $2, 'paciente_financeiro_lancamento', $3, $4, $5::jsonb)`, [auth.empresaId, auth.usuarioId,
                entry.rows[0].id, status === 'pago' ? 'recebimento_integral' : 'recebimento_parcial', JSON.stringify({
                    perfil: auth.perfil, pacienteId: current.paciente_id, orcamentoId: quoteId, agendamentoId: input.agendamentoId ?? null,
                    recebimentoId: payment.rows[0].id, origem: input.origem, valor: input.valor, desconto: input.desconto,
                    acrescimo: input.acrescimo, saldoAnterior: balance, saldoNovo: newBalance, formaPagamento: input.formaPagamento,
                })]);
            return { id: payment.rows[0].id, tituloId: entry.rows[0].id, valor: input.valor, valorPago: newPaid, saldo: newBalance, status, idempotente: false };
        });
    }
    catch (error) {
        await logRejectedFinancialOperation(auth, 'tentativa_recebimento_invalida', quoteId, {
            orcamentoId: quoteId, agendamentoId: input.agendamentoId ?? null, origem: input.origem,
            motivo: error instanceof Error ? error.message : 'Erro nao identificado',
        });
        throw error;
    }
}
async function reversePayment(auth, paymentId, input) {
    try {
        return await (0, pool_1.transaction)(async (client) => {
            const payment = await client.query(`
      select id, lancamento_id, estornado_em::text, valor::text from odonto.paciente_financeiro_pagamentos
       where id = $1 and empresa_id = $2 for update`, [paymentId, auth.empresaId]);
            if (!payment.rowCount)
                throw (0, http_error_1.notFound)('Recebimento nao encontrado.');
            if (payment.rows[0].estornado_em)
                throw (0, http_error_1.badRequest)('Este recebimento ja foi estornado.');
            const title = await client.query(`
      select id, paciente_id, orcamento_id, valor::text from odonto.paciente_financeiro_lancamentos
       where id = $1 and empresa_id = $2 for update`, [payment.rows[0].lancamento_id, auth.empresaId]);
            if (!title.rowCount)
                throw (0, http_error_1.notFound)('Titulo nao encontrado.');
            await client.query(`update odonto.paciente_financeiro_pagamentos set estornado_em = now(), estornado_por = $3,
      justificativa_estorno = $4, referencia_estorno = $5, tipo_estorno = $6::text,
      status_estorno_provedor = case when $6::text = 'interno' then 'nao_solicitado' when $6::text = 'solicitado_provedor' then 'solicitado' else 'confirmado' end
      where id = $1 and empresa_id = $2`, [paymentId, auth.empresaId, auth.usuarioId, input.justificativa, input.referencia ?? null, input.tipo]);
            const totals = await client.query(`
      select coalesce(sum(valor),0)::text as recebido, coalesce(sum(desconto),0)::text as desconto,
             coalesce(sum(acrescimo),0)::text as acrescimo from odonto.paciente_financeiro_pagamentos
       where empresa_id = $1 and lancamento_id = $2 and estornado_em is null`, [auth.empresaId, title.rows[0].id]);
            const position = (0, receivables_calculator_1.calculateFinancialPosition)({ valor: Number(title.rows[0].valor), recebido: Number(totals.rows[0].recebido),
                desconto: Number(totals.rows[0].desconto), acrescimo: Number(totals.rows[0].acrescimo) });
            const { saldo, status } = position;
            await client.query(`update odonto.paciente_financeiro_lancamentos set status = $3::odonto.paciente_financeiro_status,
      updated_by = $4 where id = $1 and empresa_id = $2`, [title.rows[0].id, auth.empresaId, status, auth.usuarioId]);
            await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
      values ($1, $2, 'paciente_financeiro_pagamento', $3, 'estorno', $4::jsonb)`, [auth.empresaId, auth.usuarioId,
                paymentId, JSON.stringify({ perfil: auth.perfil, pacienteId: title.rows[0].paciente_id, orcamentoId: title.rows[0].orcamento_id,
                    tituloId: title.rows[0].id, recebimentoId: paymentId, origem: input.origem, tipo: input.tipo,
                    justificativa: input.justificativa, valor: Number(payment.rows[0].valor), saldoNovo: saldo })]);
            return { id: paymentId, tituloId: title.rows[0].id, status, saldo, tipo: input.tipo };
        });
    }
    catch (error) {
        await logRejectedFinancialOperation(auth, 'tentativa_estorno_invalida', paymentId, {
            recebimentoId: paymentId, origem: input.origem,
            motivo: error instanceof Error ? error.message : 'Erro nao identificado',
        });
        throw error;
    }
}
