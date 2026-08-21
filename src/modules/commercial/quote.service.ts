import { PoolClient } from 'pg';
import { query, transaction } from '../../database/pool';
import { sendQuoteWhatsApp } from '../../services/whatsapp.service';
import { AuthContext } from '../../types/public';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { createOrLinkMinimalPatient } from '../patients/patient.service';
import { validateProfessionalSlot } from '../schedule/availability.service';
import { sendScheduleNotification } from '../schedule/schedule-notification.service';
import { getEvent } from '../schedule/schedule.service';
import { QuoteListQuery, QuotePayload, QuoteScheduleInput, QuoteSendInput, QuoteStatusInput } from './commercial.schemas';

type NotificationStatus = 'pendente' | 'enviada' | 'falhou';

interface QuoteRow {
  id: string;
  paciente_id: string | null;
  nome_contato: string;
  whatsapp: string;
  origem: 'rapido' | 'pasta_vermelha' | 'consulta';
  status: 'rascunho' | 'enviado' | 'aprovado' | 'nao_aprovado' | 'expirado' | 'cancelado';
  validade: string | null;
  desconto_valor: string;
  desconto_tipo: string;
  desconto_percentual: string | null;
  desconto_justificativa: string | null;
  observacoes: string | null;
  motivo_nao_aprovacao: string | null;
  enviado_em: string | null;
  aprovado_em: string | null;
  nao_aprovado_em: string | null;
  created_at: string;
  updated_at: string;
  subtotal: string;
  total: string;
  quantidade_itens: string;
  agenda_evento_id: string | null;
  valor_pago: string;
  profissional_nome: string | null;
  valor_cortesias: string;
  descontos_itens: string;
  descontos_recebimentos: string;
  acrescimos: string;
}

interface QuoteItemRow {
  id: string;
  catalogo_procedimento_id: string | null;
  descricao: string;
  quantidade: string;
  valor_unitario: string;
  valor_total: string;
  ordem: string;
  duracao_minutos: string;
  cortesia: boolean;
  cortesia_justificativa: string | null;
  desconto_valor: string;
  desconto_justificativa: string | null;
  status: string;
}

interface ProcedureRow {
  id: string;
  nome: string;
  duracao_minutos: number;
}

interface QuoteDestinationRow {
  id: string;
  paciente_id: string | null;
  nome_contato: string;
  whatsapp: string;
  empresa_nome: string;
  desconto_valor: string;
  subtotal: string;
  total: string;
  itens: string;
}

function quoteSelect(): string {
  return `
    select o.id, o.paciente_id, o.nome_contato, o.whatsapp, o.origem, o.status,
           prof.nome as profissional_nome,
           o.validade::text, o.desconto_valor::text, o.desconto_tipo, o.desconto_percentual::text,
           o.desconto_justificativa, o.observacoes, o.motivo_nao_aprovacao,
           o.enviado_em::text, o.aprovado_em::text, o.nao_aprovado_em::text,
           o.created_at::text, o.updated_at::text,
           coalesce(totals.subtotal, 0)::text as subtotal,
           coalesce(totals.cortesias, 0)::text as valor_cortesias,
           coalesce(totals.descontos_itens, 0)::text as descontos_itens,
           greatest(coalesce(totals.subtotal, 0) - coalesce(totals.cortesias, 0) - coalesce(totals.descontos_itens, 0) - o.desconto_valor, 0)::text as total,
           coalesce(totals.quantidade_itens, 0)::text as quantidade_itens
           ,coalesce((select sum(pg.valor) from odonto.paciente_financeiro_lancamentos fl
             join odonto.paciente_financeiro_pagamentos pg on pg.lancamento_id = fl.id and pg.empresa_id = fl.empresa_id
             where fl.empresa_id = o.empresa_id and fl.orcamento_id = o.id and pg.estornado_em is null), 0)::text as valor_pago
           ,coalesce((select sum(pg.desconto) from odonto.paciente_financeiro_lancamentos fl
             join odonto.paciente_financeiro_pagamentos pg on pg.lancamento_id = fl.id and pg.empresa_id = fl.empresa_id
             where fl.empresa_id = o.empresa_id and fl.orcamento_id = o.id and pg.estornado_em is null), 0)::text as descontos_recebimentos
           ,coalesce((select sum(pg.acrescimo) from odonto.paciente_financeiro_lancamentos fl
             join odonto.paciente_financeiro_pagamentos pg on pg.lancamento_id = fl.id and pg.empresa_id = fl.empresa_id
             where fl.empresa_id = o.empresa_id and fl.orcamento_id = o.id and pg.estornado_em is null), 0)::text as acrescimos
           ,(select ae.id from odonto.agenda_eventos ae
              where ae.empresa_id = o.empresa_id and ae.orcamento_id = o.id and ae.status <> 'cancelado'
              order by ae.created_at desc limit 1) as agenda_evento_id
      from odonto.orcamentos o
      left join odonto.profissionais prof on prof.id = o.profissional_id and prof.empresa_id = o.empresa_id
      left join lateral (
        select sum(oi.valor_total) as subtotal, sum(oi.valor_total) filter (where oi.cortesia) as cortesias,
               sum(oi.desconto_valor) filter (where not oi.cortesia) as descontos_itens, count(*) as quantidade_itens
          from odonto.orcamento_itens oi
         where oi.orcamento_id = o.id
      ) totals on true
  `;
}

function mapQuote(row: QuoteRow) {
  return {
    id: row.id,
    pacienteId: row.paciente_id,
    nomeContato: row.nome_contato,
    whatsapp: row.whatsapp,
    origem: row.origem,
    status: row.status,
    validade: row.validade,
    descontoValor: Number(row.desconto_valor),
    descontoTipo: row.desconto_tipo,
    descontoPercentual: row.desconto_percentual == null ? null : Number(row.desconto_percentual),
    descontoJustificativa: row.desconto_justificativa,
    observacoes: row.observacoes,
    motivoNaoAprovacao: row.motivo_nao_aprovacao,
    enviadoEm: row.enviado_em,
    aprovadoEm: row.aprovado_em,
    naoAprovadoEm: row.nao_aprovado_em,
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
    subtotal: Number(row.subtotal),
    total: Number(row.total),
    quantidadeItens: Number(row.quantidade_itens),
    agendaEventoId: row.agenda_evento_id,
    valorPago: Number(row.valor_pago),
    profissionalNome: row.profissional_nome,
    valorCortesias: Number(row.valor_cortesias),
    descontosItens: Number(row.descontos_itens),
    descontosRecebimentos: Number(row.descontos_recebimentos),
    acrescimos: Number(row.acrescimos),
    saldo: Math.max(0, Number(row.total) + Number(row.acrescimos) - Number(row.descontos_recebimentos) - Number(row.valor_pago)),
  };
}

function normalizeWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) {
    return null;
  }
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

async function validateQuote(auth: AuthContext, input: QuotePayload, client: PoolClient) {
  const hasFinancialBenefit = input.descontoValor > 0 || (input.descontoPercentual ?? 0) > 0
    || input.itens.some((item) => item.cortesia || item.descontoValor > 0);
  if (hasFinancialBenefit && !['portal_admin', 'gestor'].includes(auth.perfil)) {
    throw forbidden('Somente gestores podem conceder descontos ou cortesias.');
  }
  if (input.pacienteId) {
    const patient = await client.query(
      'select 1 from odonto.pacientes where id = $1 and empresa_id = $2 and status = \'ativo\' limit 1',
      [input.pacienteId, auth.empresaId],
    );
    if (!patient.rowCount) {
      throw notFound('Paciente vinculado nao encontrado.');
    }
  }

  const procedureIds = [...new Set(input.itens.map((item) => item.catalogoProcedimentoId))];
  const procedures = await client.query<ProcedureRow>(
    `select id, nome, duracao_minutos from odonto.catalogo_procedimentos where empresa_id = $1 and id = any($2::uuid[])`,
    [auth.empresaId, procedureIds],
  );
  if (procedures.rows.length !== procedureIds.length) {
    throw notFound('Um ou mais procedimentos do orcamento nao foram encontrados.');
  }

  const byId = new Map(procedures.rows.map((procedure) => [procedure.id, procedure]));
  const items = input.itens.map((item, index) => ({
    catalogoProcedimentoId: item.catalogoProcedimentoId,
    descricao: byId.get(item.catalogoProcedimentoId)!.nome,
    quantidade: item.quantidade,
    valorUnitario: item.valorUnitario,
    valorTotal: Number((item.quantidade * item.valorUnitario).toFixed(2)),
    cortesia: item.cortesia,
    cortesiaJustificativa: item.cortesiaJustificativa ?? null,
    descontoValor: item.descontoValor,
    descontoJustificativa: item.descontoJustificativa ?? null,
    autorizadoPor: auth.usuarioId,
    duracaoMinutos: byId.get(item.catalogoProcedimentoId)!.duracao_minutos,
    ordem: index,
  }));
  const subtotal = items.filter((item) => !item.cortesia).reduce((total, item) => total + item.valorTotal - item.descontoValor, 0);
  const discount = input.descontoTipo === 'percentual' ? Number((subtotal * (input.descontoPercentual ?? 0) / 100).toFixed(2)) : input.descontoValor;
  input.descontoValor = discount;
  if (discount > subtotal) {
    throw badRequest('O desconto nao pode ser maior que o subtotal do orcamento.');
  }
  return items;
}

async function replaceItems(client: PoolClient, quoteId: string, items: Awaited<ReturnType<typeof validateQuote>>) {
  await client.query('delete from odonto.orcamento_itens where orcamento_id = $1', [quoteId]);
  for (const item of items) {
    await client.query(
      `
        insert into odonto.orcamento_itens (
          orcamento_id, catalogo_procedimento_id, descricao, quantidade,
          valor_unitario, valor_total, ordem
          ,duracao_minutos, cortesia, cortesia_justificativa, cortesia_autorizada_por,
          desconto_valor, desconto_justificativa
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [quoteId, item.catalogoProcedimentoId, item.descricao, item.quantidade, item.valorUnitario, item.valorTotal, item.ordem, item.duracaoMinutos,
        item.cortesia, item.cortesiaJustificativa, item.cortesia ? item.autorizadoPor : null, item.descontoValor, item.descontoJustificativa],
    );
  }
}

export async function listQuotes(auth: AuthContext, input: QuoteListQuery) {
  const search = `%${input.search}%`;
  const result = await query<QuoteRow>(
    `${quoteSelect()}
      where o.empresa_id = $1
        and ($2 = 'todos' or o.status::text = $2)
        and ($3 = '%%' or o.nome_contato ilike $3 or o.whatsapp ilike $3)
      order by o.updated_at desc
      limit 200`,
    [auth.empresaId, input.status, search],
  );
  return { orcamentos: result.rows.map(mapQuote) };
}

export async function getQuote(auth: AuthContext, quoteId: string) {
  const result = await query<QuoteRow>(
    `${quoteSelect()} where o.id = $1 and o.empresa_id = $2 limit 1`,
    [quoteId, auth.empresaId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('Orcamento nao encontrado.');
  }
  const items = await query<QuoteItemRow>(
    `
      select id, catalogo_procedimento_id, descricao, quantidade::text,
             valor_unitario::text, valor_total::text, ordem::text, duracao_minutos::text,
             cortesia, cortesia_justificativa, desconto_valor::text, desconto_justificativa, status::text
        from odonto.orcamento_itens
       where orcamento_id = $1
       order by ordem, created_at
    `,
    [quoteId],
  );
  const history = await query<{ id: string; acao: string; payload: Record<string, unknown> | null; created_at: string; usuario_nome: string | null }>(`
    select a.id, a.acao, a.payload, a.created_at::text, u.nome as usuario_nome
      from odonto.audit_logs a left join odonto.usuarios u on u.id = a.usuario_id
     where a.empresa_id = $1::uuid and ((a.entidade = 'orcamento' and a.entidade_id = $2::uuid)
       or a.payload->>'orcamentoId' = $2::uuid::text)
     order by a.created_at desc limit 100`, [auth.empresaId, quoteId]);
  return {
    ...mapQuote(row),
    itens: items.rows.map((item) => ({
      id: item.id,
      catalogoProcedimentoId: item.catalogo_procedimento_id,
      descricao: item.descricao,
      quantidade: Number(item.quantidade),
      valorUnitario: Number(item.valor_unitario),
      valorTotal: Number(item.valor_total),
      ordem: Number(item.ordem),
      duracaoMinutos: Number(item.duracao_minutos),
      cortesia: item.cortesia,
      cortesiaJustificativa: item.cortesia_justificativa,
      descontoValor: Number(item.desconto_valor),
      descontoJustificativa: item.desconto_justificativa,
      status: item.status,
    })),
    historico: history.rows.map((item) => ({ id: item.id, acao: item.acao, detalhes: item.payload,
      responsavelNome: item.usuario_nome, criadoEm: item.created_at })),
  };
}

export async function createQuote(auth: AuthContext, input: QuotePayload) {
  const quoteId = await transaction(async (client) => {
    const items = await validateQuote(auth, input, client);
    const result = await client.query<{ id: string }>(
      `
        insert into odonto.orcamentos (
          empresa_id, paciente_id, nome_contato, whatsapp, origem, status, validade,
          desconto_valor, desconto_tipo, desconto_percentual, desconto_justificativa, observacoes, motivo_nao_aprovacao,
          enviado_em, aprovado_em, nao_aprovado_em, created_by, updated_by
        ) values (
          $1, $2, $3, $4, $5, $6::odonto.orcamento_status, $7, $8, $9, $10, $11, $12, $13,
          case when $6::text = 'enviado' then now() else null end,
          case when $6::text = 'aprovado' then now() else null end,
          case when $6::text = 'nao_aprovado' then now() else null end,
          $14, $14
        ) returning id
      `,
      [
        auth.empresaId, input.pacienteId ?? null, input.nomeContato, input.whatsapp,
        input.origem, input.status, input.validade ?? null, input.descontoValor, input.descontoTipo,
        input.descontoPercentual ?? null, input.descontoJustificativa ?? null,
        input.observacoes ?? null, input.motivoNaoAprovacao ?? null, auth.usuarioId,
      ],
    );
    await replaceItems(client, result.rows[0].id, items);
    await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
      values ($1,$2,'orcamento',$3,'orcamento_criado',$4::jsonb)`, [auth.empresaId, auth.usuarioId, result.rows[0].id,
      JSON.stringify({ perfil: auth.perfil, pacienteId: input.pacienteId ?? null, origem: input.origem,
        statusNovo: input.status, valorBruto: items.reduce((sum, item) => sum + item.valorTotal, 0) })]);
    if (input.descontoValor > 0 || items.some((item) => item.cortesia || item.descontoValor > 0)) await client.query(
      `insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
       values ($1,$2,'orcamento',$3,'beneficio_concedido',$4::jsonb)`, [auth.empresaId, auth.usuarioId, result.rows[0].id,
        JSON.stringify({ perfil: auth.perfil, descontoTipo: input.descontoTipo, descontoValor: input.descontoValor,
          descontoPercentual: input.descontoPercentual, justificativa: input.descontoJustificativa,
          itens: items.filter((item) => item.cortesia || item.descontoValor > 0).map((item) => ({ procedimentoId: item.catalogoProcedimentoId,
            cortesia: item.cortesia, descontoValor: item.descontoValor, justificativa: item.cortesiaJustificativa ?? item.descontoJustificativa })) })]);
    return result.rows[0].id;
  });
  return getQuote(auth, quoteId);
}

export async function updateQuote(auth: AuthContext, quoteId: string, input: QuotePayload) {
  await transaction(async (client) => {
    const current = await client.query<{ status: string }>('select status::text from odonto.orcamentos where id = $1 and empresa_id = $2 for update', [quoteId, auth.empresaId]);
    if (!current.rowCount) {
      throw notFound('Orcamento nao encontrado.');
    }
    if (input.itens.some((item) => item.cortesia)) {
      const payments = await client.query(`select 1 from odonto.paciente_financeiro_lancamentos fl
        join odonto.paciente_financeiro_pagamentos pg on pg.lancamento_id = fl.id
        where fl.empresa_id = $1 and fl.orcamento_id = $2 and pg.estornado_em is null limit 1`, [auth.empresaId, quoteId]);
      if (payments.rowCount) throw badRequest('Estorne ou ajuste os recebimentos antes de transformar procedimento em cortesia.');
    }
    const items = await validateQuote(auth, input, client);
    await client.query(
      `
        update odonto.orcamentos
           set paciente_id = $3, nome_contato = $4, whatsapp = $5, origem = $6,
               status = $7::odonto.orcamento_status, validade = $8, desconto_valor = $9,
               desconto_tipo = $10, desconto_percentual = $11, desconto_justificativa = $12,
               observacoes = $13, motivo_nao_aprovacao = $14, updated_by = $15,
               enviado_em = case when $7::text = 'enviado' then coalesce(enviado_em, now()) else enviado_em end,
               aprovado_em = case when $7::text = 'aprovado' then coalesce(aprovado_em, now()) else aprovado_em end,
               nao_aprovado_em = case when $7::text = 'nao_aprovado' then coalesce(nao_aprovado_em, now()) else nao_aprovado_em end
         where id = $1 and empresa_id = $2
      `,
      [quoteId, auth.empresaId, input.pacienteId ?? null, input.nomeContato, input.whatsapp, input.origem,
        input.status, input.validade ?? null, input.descontoValor, input.descontoTipo, input.descontoPercentual ?? null,
        input.descontoJustificativa ?? null, input.observacoes ?? null, input.motivoNaoAprovacao ?? null, auth.usuarioId],
    );
    await replaceItems(client, quoteId, items);
    await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
      values ($1,$2,'orcamento',$3,'orcamento_alterado',$4::jsonb)`, [auth.empresaId, auth.usuarioId, quoteId,
      JSON.stringify({ perfil: auth.perfil, pacienteId: input.pacienteId ?? null, origem: input.origem,
        statusAnterior: current.rows[0].status, statusNovo: input.status })]);
    if (input.descontoValor > 0 || items.some((item) => item.cortesia || item.descontoValor > 0)) await client.query(
      `insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
       values ($1,$2,'orcamento',$3,'beneficio_alterado',$4::jsonb)`, [auth.empresaId, auth.usuarioId, quoteId,
        JSON.stringify({ perfil: auth.perfil, descontoTipo: input.descontoTipo, descontoValor: input.descontoValor,
          descontoPercentual: input.descontoPercentual, justificativa: input.descontoJustificativa,
          itens: items.filter((item) => item.cortesia || item.descontoValor > 0).map((item) => ({ procedimentoId: item.catalogoProcedimentoId,
            cortesia: item.cortesia, descontoValor: item.descontoValor, justificativa: item.cortesiaJustificativa ?? item.descontoJustificativa })) })]);
  });
  return getQuote(auth, quoteId);
}

export async function updateQuoteStatus(auth: AuthContext, quoteId: string, input: QuoteStatusInput) {
  await transaction(async (client) => {
    const current = await client.query<{ status: string }>(
      'select status::text from odonto.orcamentos where id = $1 and empresa_id = $2 for update', [quoteId, auth.empresaId]);
    if (!current.rowCount) throw notFound('Orcamento nao encontrado.');
    await client.query(`
      update odonto.orcamentos
         set status = $3::odonto.orcamento_status, motivo_nao_aprovacao = $4, updated_by = $5,
             enviado_em = case when $3::text = 'enviado' then coalesce(enviado_em, now()) else enviado_em end,
             aprovado_em = case when $3::text = 'aprovado' then coalesce(aprovado_em, now()) else aprovado_em end,
             nao_aprovado_em = case when $3::text = 'nao_aprovado' then coalesce(nao_aprovado_em, now()) else nao_aprovado_em end
       where id = $1 and empresa_id = $2
    `, [quoteId, auth.empresaId, input.status, input.motivoNaoAprovacao ?? null, auth.usuarioId]);
    await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
      values ($1,$2,'orcamento',$3,'status_alterado',$4::jsonb)`, [auth.empresaId, auth.usuarioId, quoteId,
      JSON.stringify({ perfil: auth.perfil, statusAnterior: current.rows[0].status, statusNovo: input.status,
        justificativa: input.motivoNaoAprovacao ?? null })]);
  });
  return getQuote(auth, quoteId);
}

export async function sendQuote(auth: AuthContext, quoteId: string, input: QuoteSendInput) {
  const destinationResult = await query<QuoteDestinationRow>(
    `
      select o.id, o.paciente_id, o.nome_contato, o.whatsapp, e.nome_fantasia as empresa_nome,
             o.desconto_valor::text, coalesce(sum(oi.valor_total), 0)::text as subtotal,
             greatest(coalesce(sum(oi.valor_total), 0)
               - coalesce(sum(oi.valor_total) filter (where oi.cortesia), 0)
               - coalesce(sum(oi.desconto_valor) filter (where not oi.cortesia), 0)
               - o.desconto_valor, 0)::text as total,
             string_agg(oi.descricao, ', ' order by oi.ordem) as itens
        from odonto.orcamentos o
        inner join odonto.empresas e on e.id = o.empresa_id
        left join odonto.orcamento_itens oi on oi.orcamento_id = o.id
       where o.id = $1 and o.empresa_id = $2
       group by o.id, e.nome_fantasia
       limit 1
    `,
    [quoteId, auth.empresaId],
  );
  const quote = destinationResult.rows[0];
  if (!quote) {
    throw notFound('Orcamento nao encontrado.');
  }
  const channels = [...new Set(input.canais)];
  if (channels.includes('aplicativo') && !quote.paciente_id) {
    throw badRequest('Vincule um paciente antes de enviar o orcamento pelo aplicativo.');
  }

  const total = Number(quote.total);
  const discount = Number(quote.desconto_valor);
  const formattedTotal = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const firstName = quote.nome_contato.split(' ')[0];
  const message = input.mensagem ?? `Ola, ${firstName}. Preparamos seu orcamento na ${quote.empresa_nome}: ${quote.itens}. Valor final: ${formattedTotal}${discount > 0 ? ' com desconto especial aplicado' : ''}. Podemos conversar sobre os proximos passos?`;
  let appStatus: NotificationStatus | null = null;
  let whatsappStatus: NotificationStatus | null = null;
  let whatsappProviderId: string | null = null;
  let whatsappError: string | null = null;

  if (channels.includes('aplicativo')) {
    appStatus = 'enviada';
  }
  if (channels.includes('whatsapp')) {
    const phone = normalizeWhatsAppNumber(quote.whatsapp);
    if (!phone) {
      whatsappStatus = 'falhou';
      whatsappError = 'WhatsApp invalido.';
    } else {
      const result = await sendQuoteWhatsApp({
        to: phone,
        patientName: firstName,
        clinicName: quote.empresa_nome,
        total: formattedTotal,
        discount: discount > 0 ? discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'sem desconto',
      });
      whatsappStatus = result.status;
      whatsappProviderId = result.providerId ?? null;
      whatsappError = result.error ?? null;
    }
  }

  await transaction(async (client) => {
    if (appStatus && quote.paciente_id) {
      await client.query(
        `insert into odonto.notificacoes (
          empresa_id, paciente_id, orcamento_id, canal, tipo, titulo, mensagem,
          destinatario, status_envio, enviada_em, created_by
        ) values ($1, $2, $3, 'aplicativo', 'orcamento_comercial', 'Seu orcamento esta disponivel', $4,
          'portal do paciente', 'enviada', now(), $5)`,
        [auth.empresaId, quote.paciente_id, quote.id, message, auth.usuarioId],
      );
    }
    if (whatsappStatus) {
      const phone = normalizeWhatsAppNumber(quote.whatsapp);
      await client.query(
        `insert into odonto.notificacoes (
          empresa_id, paciente_id, orcamento_id, canal, tipo, titulo, mensagem, destinatario,
          status_envio, provedor_id, erro_envio, enviada_em, created_by
        ) values ($1, $2, $3, 'whatsapp', 'orcamento_comercial', 'Orcamento da clinica', $4, $5,
          $6, $7, $8, $9, $10)`,
        [auth.empresaId, quote.paciente_id, quote.id, message, phone, whatsappStatus,
          whatsappProviderId, whatsappError, whatsappStatus === 'enviada' ? new Date() : null, auth.usuarioId],
      );
    }
    await client.query(
      `insert into odonto.comercial_contatos (
        empresa_id, paciente_id, orcamento_id, mensagem, canais,
        aplicativo_status, whatsapp_status, created_by
      ) values ($1, $2, $3, $4, $5::varchar[], $6, $7, $8)`,
      [auth.empresaId, quote.paciente_id, quote.id, message, channels, appStatus, whatsappStatus, auth.usuarioId],
    );
    await client.query(
      `update odonto.orcamentos set status = 'enviado', enviado_em = now(), updated_by = $3
        where id = $1 and empresa_id = $2`,
      [quote.id, auth.empresaId, auth.usuarioId],
    );
  });

  return {
    mensagem: message,
    resultados: channels.map((channel) => ({
      canal: channel,
      status: channel === 'aplicativo' ? appStatus : whatsappStatus,
      erro: channel === 'whatsapp' ? whatsappError : null,
    })),
  };
}

export async function approveAndScheduleQuote(auth: AuthContext, quoteId: string, input: QuoteScheduleInput) {
  try {
    const result = await transaction(async (client) => {
      const quoteResult = await client.query<{
        paciente_id: string | null;
        nome_contato: string;
        whatsapp: string;
        observacoes: string | null;
        status: string;
      }>(
        `select paciente_id, nome_contato, whatsapp, observacoes, status::text
           from odonto.orcamentos
          where id = $1 and empresa_id = $2
          limit 1 for update`,
        [quoteId, auth.empresaId],
      );
      const quote = quoteResult.rows[0];
      if (!quote) throw notFound('Orcamento nao encontrado.');
      if (['cancelado', 'expirado'].includes(quote.status)) {
        throw badRequest('Este orcamento nao pode ser aprovado.');
      }
      const existingEvent = await client.query(
        `select 1 from odonto.agenda_eventos
          where empresa_id = $1 and orcamento_id = $2 and status <> 'cancelado' limit 1`,
        [auth.empresaId, quoteId],
      );
      if (existingEvent.rowCount) {
        throw conflict('Este orcamento ja possui uma consulta agendada.');
      }

      const patient = await createOrLinkMinimalPatient(client, auth, {
        pacienteId: quote.paciente_id,
        nome: quote.nome_contato,
        cpf: input.cpf,
        celular: quote.whatsapp,
      });
      const itemsResult = await client.query<{
        catalogo_procedimento_id: string | null;
        descricao: string;
        quantidade: number;
        valor_total: string;
        duracao_minutos: number;
      }>(
        `select catalogo_procedimento_id, descricao, quantidade, valor_total::text, duracao_minutos
           from odonto.orcamento_itens where orcamento_id = $1 order by ordem, created_at`,
        [quoteId],
      );
      if (!itemsResult.rowCount) throw badRequest('O orcamento nao possui procedimentos.');
      const duration = itemsResult.rows.reduce(
        (total, item) => total + item.duracao_minutos * item.quantidade,
        0,
      );
      const start = new Date(input.inicioEm);
      const end = input.diaInteiro
        ? new Date(start.getTime() + 24 * 60 * 60_000)
        : new Date(start.getTime() + duration * 60_000);
      await validateProfessionalSlot(client, auth, {
        profissionalId: input.profissionalId,
        inicioEm: start,
        fimEm: end,
        diaInteiro: input.diaInteiro,
      });

      const eventResult = await client.query<{ id: string }>(
        `insert into odonto.agenda_eventos (
          empresa_id, profissional_id, paciente_id, orcamento_id, tipo, titulo, categoria,
          observacoes, inicio_em, fim_em, dia_inteiro, status, confirmacao_envio,
          lembrete_envio, lembrete_duas_horas_habilitado, notificar_aplicativo,
          notificar_whatsapp, created_by, updated_by
        ) values ($1, $2, $3, $4, 'consulta', $5, 'Orcamento aprovado', $6, $7, $8,
          $9, 'agendado', 'aplicativo_whatsapp', 'ambos', true, true, true, $10, $10)
        returning id`,
        [auth.empresaId, input.profissionalId, patient.id, quoteId, patient.nome, quote.observacoes,
          start.toISOString(), end.toISOString(), input.diaInteiro, auth.usuarioId],
      );
      const eventId = eventResult.rows[0].id;
      await client.query(
        `insert into odonto.agenda_evento_status_historico (
          empresa_id, agenda_evento_id, status_anterior, status_novo, created_by
        ) values ($1, $2, null, 'agendado', $3)`,
        [auth.empresaId, eventId, auth.usuarioId],
      );
      for (const item of itemsResult.rows) {
        await client.query(
          `insert into odonto.agenda_evento_procedimentos (
            empresa_id, agenda_evento_id, catalogo_procedimento_id, descricao, valor,
            quantidade, duracao_minutos
          ) values ($1, $2, $3, $4, $5, $6, $7)`,
          [auth.empresaId, eventId, item.catalogo_procedimento_id, item.descricao,
            item.valor_total, item.quantidade, item.duracao_minutos * item.quantidade],
        );
      }
      await client.query(
        `update odonto.orcamentos
            set paciente_id = $3, profissional_id = $4, status = 'aprovado', aprovado_em = now(), updated_by = $5
          where id = $1 and empresa_id = $2`,
        [quoteId, auth.empresaId, patient.id, input.profissionalId, auth.usuarioId],
      );
      return { eventId, patient };
    });

    const [orcamento, evento, notificacoes] = await Promise.all([
      getQuote(auth, quoteId),
      getEvent(auth, result.eventId),
      sendScheduleNotification(result.eventId, 'confirmacao_agendamento', auth.usuarioId),
    ]);
    return { orcamento, evento, paciente: result.patient, notificacoes };
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23P01') {
      throw conflict('O profissional ja possui um agendamento nesse horario.');
    }
    if ((error as { code?: string }).code === '23505') {
      throw conflict('CPF ja cadastrado ou orcamento ja agendado.');
    }
    throw error;
  }
}
