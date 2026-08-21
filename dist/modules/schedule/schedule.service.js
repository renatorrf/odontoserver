"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEvents = listEvents;
exports.getEvent = getEvent;
exports.createEvent = createEvent;
exports.updateEvent = updateEvent;
exports.updateEventStatus = updateEventStatus;
exports.listReturnAlerts = listReturnAlerts;
exports.createReturnAlert = createReturnAlert;
exports.updateReturnAlertStatus = updateReturnAlertStatus;
const pool_1 = require("../../database/pool");
const http_error_1 = require("../../utils/http-error");
const normalize_1 = require("../../utils/normalize");
const availability_service_1 = require("./availability.service");
const schedule_notification_service_1 = require("./schedule-notification.service");
const schedule_status_1 = require("./schedule-status");
const anamnesis_config_1 = require("../patients/anamnesis.config");
async function validateReferences(client, auth, input) {
    let patientName = null;
    let patientWhatsapp = null;
    if (input.profissionalId) {
        const professional = await client.query(`select 1 from odonto.profissionais where id = $1 and empresa_id = $2 and status = 'ativo' limit 1`, [input.profissionalId, auth.empresaId]);
        if (!professional.rowCount) {
            throw (0, http_error_1.notFound)('Profissional ativo nao encontrado.');
        }
    }
    if (input.pacienteId) {
        const patient = await client.query(`select pac.nome, pct.celular
         from odonto.pacientes pac
         left join odonto.paciente_contatos pct on pct.paciente_id = pac.id
        where pac.id = $1 and pac.empresa_id = $2 and pac.status = 'ativo'
        limit 1`, [input.pacienteId, auth.empresaId]);
        if (!patient.rowCount) {
            throw (0, http_error_1.notFound)('Paciente ativo nao encontrado.');
        }
        patientName = patient.rows[0].nome;
        patientWhatsapp = patient.rows[0].celular;
    }
    if (input.tipo === 'consulta') {
        const whatsappDigits = patientWhatsapp?.replace(/\D/g, '') ?? '';
        if (whatsappDigits.length < 8 || whatsappDigits.length > 15) {
            throw (0, http_error_1.badRequest)('O paciente precisa ter um WhatsApp valido para gerar o orcamento da consulta.');
        }
    }
    return { patientName, patientWhatsapp };
}
function notificationSettings(input) {
    const preference = input.lembreteEnvio?.toLowerCase() ?? 'ambos';
    const app = ['ambos', 'aplicativo_whatsapp', 'aplicativo'].includes(preference);
    const whatsapp = ['ambos', 'aplicativo_whatsapp', 'whatsapp'].includes(preference);
    return { app, whatsapp, enabled: input.tipo === 'consulta' && (app || whatsapp) };
}
async function resolveEventPeriod(client, auth, input, ignoreEventId) {
    const start = new Date(input.inicioEm);
    let end = new Date(input.fimEm);
    if (input.diaInteiro) {
        end = new Date(start.getTime() + 24 * 60 * 60_000);
    }
    else if (input.tipo === 'consulta' && input.procedimentos.length) {
        const quantities = new Map();
        for (const item of input.procedimentos) {
            quantities.set(item.catalogoProcedimentoId, (quantities.get(item.catalogoProcedimentoId) ?? 0) + item.quantidade);
        }
        const ids = [...quantities.keys()];
        const catalog = await client.query(`select id, duracao_minutos from odonto.catalogo_procedimentos
        where empresa_id = $1 and id = any($2::uuid[])`, [auth.empresaId, ids]);
        if (catalog.rows.length !== ids.length) {
            throw (0, http_error_1.notFound)('Um dos procedimentos selecionados nao foi encontrado.');
        }
        const duration = catalog.rows.reduce((total, procedure) => total + procedure.duracao_minutos * (quantities.get(procedure.id) ?? 1), 0);
        end = new Date(start.getTime() + duration * 60_000);
    }
    if (input.profissionalId) {
        await (0, availability_service_1.validateProfessionalSlot)(client, auth, {
            profissionalId: input.profissionalId,
            inicioEm: start,
            fimEm: end,
            diaInteiro: input.diaInteiro,
            ignorarEventoId: ignoreEventId,
        });
    }
    return { start, end };
}
async function replaceProcedures(client, auth, eventId, procedures) {
    await client.query('delete from odonto.agenda_evento_procedimentos where agenda_evento_id = $1 and empresa_id = $2', [eventId, auth.empresaId]);
    const uniqueIds = [...new Set(procedures.map((item) => item.catalogoProcedimentoId))];
    if (!uniqueIds.length) {
        return;
    }
    const catalog = await client.query(`
      select id, nome, valor, duracao_minutos
        from odonto.catalogo_procedimentos
       where empresa_id = $1 and id = any($2::uuid[])
    `, [auth.empresaId, uniqueIds]);
    if (catalog.rows.length !== uniqueIds.length) {
        throw (0, http_error_1.notFound)('Um dos procedimentos selecionados nao foi encontrado.');
    }
    const quantities = new Map();
    for (const item of procedures) {
        quantities.set(item.catalogoProcedimentoId, (quantities.get(item.catalogoProcedimentoId) ?? 0) + item.quantidade);
    }
    for (const procedure of catalog.rows) {
        const quantity = quantities.get(procedure.id) ?? 1;
        await client.query(`
        insert into odonto.agenda_evento_procedimentos (
          empresa_id, agenda_evento_id, catalogo_procedimento_id, descricao, valor,
          quantidade, duracao_minutos
        ) values ($1, $2, $3, $4, $5, $6, $7)
      `, [
            auth.empresaId, eventId, procedure.id, procedure.nome,
            Number(procedure.valor) * quantity, quantity, procedure.duracao_minutos * quantity,
        ]);
    }
}
async function syncConsultationQuote(client, auth, eventId, input, patientName, patientWhatsapp) {
    const eventResult = await client.query(`select orcamento_id
       from odonto.agenda_eventos
      where id = $1 and empresa_id = $2
      limit 1 for update`, [eventId, auth.empresaId]);
    const linkedQuoteId = eventResult.rows[0]?.orcamento_id ?? null;
    let quoteId = linkedQuoteId;
    if (quoteId) {
        const updated = await client.query(`update odonto.orcamentos
          set paciente_id = $3, profissional_id = $4, nome_contato = $5, whatsapp = $6,
              origem = 'consulta',
              status = case when status in ('em_execucao', 'concluido') then status else 'aprovado' end,
              observacoes = $7, aprovado_em = coalesce(aprovado_em, now()), updated_by = $8
        where id = $1 and empresa_id = $2`, [quoteId, auth.empresaId, input.pacienteId, input.profissionalId, patientName,
            patientWhatsapp, (0, normalize_1.optionalText)(input.observacoesProcedimentos), auth.usuarioId]);
        if (!updated.rowCount) {
            quoteId = null;
        }
    }
    if (!quoteId) {
        const created = await client.query(`insert into odonto.orcamentos (
         empresa_id, paciente_id, profissional_id, nome_contato, whatsapp, origem, status,
         desconto_valor, observacoes, aprovado_em, created_by, updated_by
       ) values ($1, $2, $3, $4, $5, 'consulta', 'aprovado', 0, $6, now(), $7, $7)
       returning id`, [auth.empresaId, input.pacienteId, input.profissionalId, patientName, patientWhatsapp,
            (0, normalize_1.optionalText)(input.observacoesProcedimentos), auth.usuarioId]);
        quoteId = created.rows[0].id;
        await client.query(`update odonto.agenda_eventos set orcamento_id = $3
        where id = $1 and empresa_id = $2`, [eventId, auth.empresaId, quoteId]);
    }
    await client.query('delete from odonto.orcamento_itens where orcamento_id = $1', [quoteId]);
    await client.query(`insert into odonto.orcamento_itens (
       orcamento_id, catalogo_procedimento_id, descricao, quantidade,
       valor_unitario, valor_total, ordem, duracao_minutos, status
     )
     select $1, aep.catalogo_procedimento_id, aep.descricao, aep.quantidade,
            round(aep.valor / aep.quantidade, 2), aep.valor,
            row_number() over (order by aep.created_at, aep.id) - 1,
            greatest(5, round(aep.duracao_minutos::numeric / aep.quantidade)::integer),
            aep.status
       from odonto.agenda_evento_procedimentos aep
      where aep.agenda_evento_id = $2 and aep.empresa_id = $3
      order by aep.created_at, aep.id`, [quoteId, eventId, auth.empresaId]);
    const createdFinancialTitle = await client.query(`insert into odonto.paciente_financeiro_lancamentos (
       empresa_id, paciente_id, orcamento_id, descricao, vencimento, valor, created_by, updated_by
     ) select $1::uuid, $2::uuid, $3::uuid,
              'Orcamento #' || upper(substr($3::uuid::text, 1, 8)), $4::date,
              coalesce(sum(valor_total), 0), $5, $5
         from odonto.orcamento_itens
        where orcamento_id = $3::uuid
          and not exists (select 1 from odonto.paciente_financeiro_lancamentos fl
            where fl.empresa_id = $1::uuid
              and fl.orcamento_id = $3::uuid
              and fl.status <> 'cancelado')
       having coalesce(sum(valor_total), 0) > 0
       returning id`, [auth.empresaId, input.pacienteId, quoteId, input.inicioEm.slice(0, 10), auth.usuarioId]);
    if (createdFinancialTitle.rowCount) {
        await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
      values ($1, $2, 'paciente_financeiro_lancamento', $3, 'titulo_criado', $4::jsonb)`, [auth.empresaId,
            auth.usuarioId, createdFinancialTitle.rows[0].id, JSON.stringify({ perfil: auth.perfil, pacienteId: input.pacienteId,
                orcamentoId: quoteId, agendamentoId: eventId, origem: 'agenda' })]);
    }
    return quoteId;
}
function mapEvent(row, auth) {
    const canViewClinical = ['portal_admin', 'gestor', 'dentista'].includes(auth.perfil);
    const canViewFinance = ['portal_admin', 'gestor'].includes(auth.perfil);
    const alertLabels = canViewClinical
        ? row.anamnese_alertas.map((code) => anamnesis_config_1.anamnesisAlertLabels[code]).filter(Boolean)
        : [];
    const anamnesisStatus = !row.anamnese_atualizada_em
        ? 'nao_cadastrada'
        : alertLabels.length
            ? 'com_alertas'
            : 'cadastrada';
    const quoteTotal = row.orcamento_valor == null ? null : Number(row.orcamento_valor);
    const quoteBalance = row.orcamento_saldo == null ? null : Number(row.orcamento_saldo);
    const quotePaid = quoteTotal == null || quoteBalance == null ? null : Math.max(quoteTotal - quoteBalance, 0);
    return {
        id: row.id,
        tipo: row.tipo,
        profissionalId: row.profissional_id,
        profissionalNome: row.profissional_nome,
        profissionalCor: row.profissional_cor,
        pacienteId: row.paciente_id,
        pacienteNome: row.paciente_nome,
        pacienteCelular: row.paciente_celular,
        pacienteEmail: row.paciente_email,
        titulo: row.titulo,
        categoria: row.categoria,
        observacoes: row.observacoes,
        observacoesProcedimentos: row.observacoes_procedimentos,
        observacoesProcedimentosAtualizadasEm: row.observacoes_procedimentos_updated_at,
        observacoesProcedimentosResponsavel: row.observacoes_procedimentos_responsavel,
        inicioEm: row.inicio_em,
        fimEm: row.fim_em,
        diaInteiro: row.dia_inteiro,
        primeiraConsulta: row.primeira_consulta,
        status: row.status,
        confirmacaoEnvio: row.confirmacao_envio,
        lembreteEnvio: row.lembrete_envio,
        procedimentos: row.procedimentos.map((procedure) => ({
            catalogoProcedimentoId: procedure.catalogoProcedimentoId,
            descricao: procedure.descricao,
            valor: procedure.valor == null ? null : Number(procedure.valor),
            quantidade: procedure.quantidade,
            duracaoMinutos: procedure.duracaoMinutos,
            status: procedure.status,
        })),
        orcamentoId: row.orcamento_id,
        orcamentoNumero: row.orcamento_numero,
        orcamentoValor: canViewFinance ? quoteTotal : null,
        orcamentoPago: canViewFinance ? quotePaid : null,
        orcamentoSaldo: canViewFinance ? quoteBalance : null,
        orcamentoSituacaoFinanceira: !canViewFinance || quoteTotal == null ? null : quoteBalance === 0 ? 'pago' : quotePaid && quotePaid > 0 ? 'parcialmente_pago' : 'pendente',
        tituloFinanceiroId: canViewFinance ? row.titulo_financeiro_id : null,
        proximaParcela: canViewFinance ? row.proxima_parcela : null,
        proximaParcelaTotal: canViewFinance ? row.proxima_parcela_total : null,
        proximoVencimento: canViewFinance ? row.proximo_vencimento : null,
        podeVisualizarFinanceiro: canViewFinance,
        podeReceber: canViewFinance && Boolean(row.titulo_financeiro_id) && Number(quoteBalance ?? 0) > 0,
        alertaAnamnese: canViewClinical && alertLabels.length > 0,
        anamneseSituacao: anamnesisStatus,
        anamneseAtualizadaEm: row.anamnese_atualizada_em,
        anamneseAlertas: alertLabels,
        podeVisualizarAnamnese: canViewClinical,
        confirmadoEm: row.confirmado_em,
        inicioAtendimentoEm: row.inicio_atendimento_em,
        fimAtendimentoEm: row.fim_atendimento_em,
        justificativaStatus: row.justificativa_status,
        historicoStatus: row.historico_status,
    };
}
function mapAlert(row) {
    return {
        id: row.id,
        pacienteId: row.paciente_id,
        pacienteNome: row.paciente_nome,
        profissionalId: row.profissional_id,
        profissionalNome: row.profissional_nome,
        motivo: row.motivo,
        retornarEm: row.retornar_em,
        observacoes: row.observacoes,
        status: row.status,
        agendaEventoId: row.agenda_evento_id,
    };
}
const eventSelect = `
  select
    ae.*,
    p.nome as profissional_nome,
    p.cor_agenda as profissional_cor,
    pac.nome as paciente_nome,
    pc.celular as paciente_celular,
    pc.email as paciente_email,
    coalesce(procedure_list.procedimentos, '[]'::json) as procedimentos,
    upper(substr(ae.orcamento_id::text, 1, 8)) as orcamento_numero,
    quote_values.total::text as orcamento_valor,
    greatest(coalesce(quote_values.total, 0) - coalesce(quote_payments.paid, 0), 0)::text as orcamento_saldo,
    quote_payments.titulo_id as titulo_financeiro_id,
    quote_payments.numero_parcela as proxima_parcela,
    quote_payments.total_parcelas as proxima_parcela_total,
    quote_payments.vencimento::text as proximo_vencimento,
    coalesce(cardinality(anamnesis.alertas), 0) > 0 as alerta_anamnese,
    anamnesis.preenchida_em as anamnese_atualizada_em,
    coalesce(anamnesis.alertas, array[]::varchar[]) as anamnese_alertas,
    notes_user.nome as observacoes_procedimentos_responsavel,
    coalesce(status_history.items, '[]'::json) as historico_status
  from odonto.agenda_eventos ae
  left join odonto.profissionais p on p.id = ae.profissional_id and p.empresa_id = ae.empresa_id
  left join odonto.pacientes pac on pac.id = ae.paciente_id and pac.empresa_id = ae.empresa_id
  left join odonto.paciente_contatos pc on pc.paciente_id = pac.id
  left join odonto.orcamentos quote on quote.id = ae.orcamento_id and quote.empresa_id = ae.empresa_id
  left join odonto.usuarios notes_user on notes_user.id = ae.observacoes_procedimentos_updated_by
  left join lateral (
    select latest.preenchida_em,
           coalesce(array_agg(answer.pergunta_codigo order by answer.pergunta_codigo)
             filter (where answer.resposta = 'sim'), array[]::varchar[]) as alertas
      from (
        select pa.id, pa.preenchida_em
          from odonto.paciente_anamneses pa
         where pa.empresa_id = ae.empresa_id and pa.paciente_id = ae.paciente_id
         order by pa.versao desc
         limit 1
      ) latest
      left join odonto.paciente_anamnese_respostas answer
        on answer.anamnese_id = latest.id and answer.empresa_id = ae.empresa_id
     group by latest.id, latest.preenchida_em
  ) anamnesis on true
  left join lateral (
    select json_agg(json_build_object(
      'catalogoProcedimentoId', aep.catalogo_procedimento_id,
      'descricao', aep.descricao,
      'valor', aep.valor,
      'quantidade', aep.quantidade,
      'duracaoMinutos', aep.duracao_minutos,
      'status', aep.status::text
    ) order by aep.descricao) as procedimentos
      from odonto.agenda_evento_procedimentos aep
     where aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
  ) procedure_list on true
  left join lateral (
    select greatest(coalesce(sum(oi.valor_total), 0)
      - coalesce(sum(oi.valor_total) filter (where oi.cortesia), 0)
      - coalesce(sum(oi.desconto_valor) filter (where not oi.cortesia), 0)
      - coalesce(quote.desconto_valor, 0), 0) as total
      from odonto.orcamento_itens oi where oi.orcamento_id = quote.id
  ) quote_values on true
  left join lateral (
    select coalesce(sum(pg.valor + pg.desconto - pg.acrescimo) filter (where pg.estornado_em is null), 0) as paid,
           pending.id as titulo_id, pending.numero_parcela, pending.total_parcelas, pending.vencimento
      from odonto.paciente_financeiro_lancamentos fl
      left join odonto.paciente_financeiro_pagamentos pg on pg.lancamento_id = fl.id and pg.empresa_id = fl.empresa_id
      left join lateral (select x.id, x.numero_parcela, x.total_parcelas, x.vencimento
        from odonto.paciente_financeiro_lancamentos x where x.empresa_id = ae.empresa_id
          and x.orcamento_id = ae.orcamento_id and x.status in ('pendente','parcialmente_pago','vencido')
        order by x.vencimento, x.numero_parcela limit 1) pending on true
     where fl.empresa_id = ae.empresa_id and fl.orcamento_id = ae.orcamento_id
     group by pending.id, pending.numero_parcela, pending.total_parcelas, pending.vencimento
  ) quote_payments on true
  left join lateral (
    select json_agg(json_build_object(
      'id', h.id,
      'statusAnterior', h.status_anterior,
      'statusNovo', h.status_novo,
      'justificativa', h.justificativa,
      'responsavelNome', u.nome,
      'alteradoEm', h.created_at
    ) order by h.created_at desc) as items
      from odonto.agenda_evento_status_historico h
      left join odonto.usuarios u on u.id = h.created_by
     where h.empresa_id = ae.empresa_id and h.agenda_evento_id = ae.id
  ) status_history on true
`;
async function listEvents(auth, input) {
    const result = await (0, pool_1.query)(`${eventSelect}
      where ae.empresa_id = $1
        and ae.inicio_em < $3::timestamptz
        and ae.fim_em > $2::timestamptz
        and (
          coalesce(array_length($4::uuid[], 1), 0) = 0
          or ae.profissional_id is null
          or ae.profissional_id = any($4::uuid[])
        )
      order by ae.inicio_em, ae.titulo
    `, [auth.empresaId, input.inicio, input.fim, input.profissionalIds]);
    return result.rows.map((row) => mapEvent(row, auth));
}
async function getEvent(auth, id) {
    const result = await (0, pool_1.query)(`${eventSelect}
      where ae.id = $1 and ae.empresa_id = $2
      limit 1
    `, [id, auth.empresaId]);
    if (!result.rowCount) {
        throw (0, http_error_1.notFound)('Agendamento nao encontrado.');
    }
    return mapEvent(result.rows[0], auth);
}
async function createEvent(auth, input) {
    try {
        const id = await (0, pool_1.transaction)(async (client) => {
            const { patientName, patientWhatsapp } = await validateReferences(client, auth, input);
            const period = await resolveEventPeriod(client, auth, input);
            const notifications = notificationSettings(input);
            const title = input.tipo === 'consulta' ? patientName : input.titulo;
            const result = await client.query(`
          insert into odonto.agenda_eventos (
            empresa_id, profissional_id, paciente_id, tipo, titulo, categoria, observacoes,
            observacoes_procedimentos, inicio_em, fim_em, dia_inteiro, primeira_consulta, confirmacao_envio,
            lembrete_envio, lembrete_duas_horas_habilitado, notificar_aplicativo,
            notificar_whatsapp, created_by, updated_by, observacoes_procedimentos_updated_at,
            observacoes_procedimentos_updated_by
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18,
            case when $8::text is null then null else now() end,
            case when $8::text is null then null else $18::uuid end
          )
          returning id
        `, [
                auth.empresaId, input.profissionalId ?? null, input.pacienteId ?? null, input.tipo,
                title, (0, normalize_1.optionalText)(input.categoria), (0, normalize_1.optionalText)(input.observacoes), (0, normalize_1.optionalText)(input.observacoesProcedimentos),
                period.start.toISOString(), period.end.toISOString(), input.diaInteiro, input.primeiraConsulta, (0, normalize_1.optionalText)(input.confirmacaoEnvio),
                (0, normalize_1.optionalText)(input.lembreteEnvio), notifications.enabled, notifications.app, notifications.whatsapp,
                auth.usuarioId,
            ]);
            await replaceProcedures(client, auth, result.rows[0].id, input.procedimentos);
            if (input.tipo === 'consulta') {
                await syncConsultationQuote(client, auth, result.rows[0].id, input, patientName, patientWhatsapp);
            }
            await client.query(`insert into odonto.agenda_evento_status_historico (
          empresa_id, agenda_evento_id, status_anterior, status_novo, created_by
        ) values ($1, $2, null, 'agendado', $3)`, [auth.empresaId, result.rows[0].id, auth.usuarioId]);
            if ((0, normalize_1.optionalText)(input.observacoesProcedimentos)) {
                await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
           values ($1, $2, 'agenda_eventos', $3, 'create_procedure_notes', $4::jsonb)`, [auth.empresaId, auth.usuarioId, result.rows[0].id, JSON.stringify({ campo: 'observacoes_procedimentos' })]);
            }
            return result.rows[0].id;
        });
        const event = await getEvent(auth, id);
        if (event.tipo === 'consulta') {
            await (0, schedule_notification_service_1.sendScheduleNotification)(id, 'confirmacao_agendamento', auth.usuarioId);
        }
        return event;
    }
    catch (error) {
        if (error.code === '23P01') {
            throw (0, http_error_1.conflict)('O profissional ja possui um agendamento nesse horario.');
        }
        throw error;
    }
}
async function updateEvent(auth, id, input) {
    try {
        let rescheduled = false;
        await (0, pool_1.transaction)(async (client) => {
            const existing = await client.query('select inicio_em::text, fim_em::text, observacoes_procedimentos from odonto.agenda_eventos where id = $1 and empresa_id = $2 limit 1 for update', [id, auth.empresaId]);
            if (!existing.rowCount) {
                throw (0, http_error_1.notFound)('Agendamento nao encontrado.');
            }
            const { patientName, patientWhatsapp } = await validateReferences(client, auth, input);
            const period = await resolveEventPeriod(client, auth, input, id);
            const notifications = notificationSettings(input);
            const previous = existing.rows[0];
            rescheduled = new Date(previous.inicio_em).getTime() !== period.start.getTime()
                || new Date(previous.fim_em).getTime() !== period.end.getTime();
            const title = input.tipo === 'consulta' ? patientName : input.titulo;
            const procedureNotes = (0, normalize_1.optionalText)(input.observacoesProcedimentos);
            const procedureNotesChanged = previous.observacoes_procedimentos !== (procedureNotes ?? null);
            await client.query(`
          update odonto.agenda_eventos set
            profissional_id = $3, paciente_id = $4, tipo = $5, titulo = $6, categoria = $7,
            observacoes = $8, observacoes_procedimentos = $9,
            observacoes_procedimentos_updated_at = case when observacoes_procedimentos is distinct from $9::text then now() else observacoes_procedimentos_updated_at end,
            observacoes_procedimentos_updated_by = case when observacoes_procedimentos is distinct from $9::text then $20 else observacoes_procedimentos_updated_by end,
            inicio_em = $10, fim_em = $11, dia_inteiro = $12,
            primeira_consulta = $13, confirmacao_envio = $14, lembrete_envio = $15,
            lembrete_duas_horas_habilitado = $16, notificar_aplicativo = $17,
            notificar_whatsapp = $18,
            lembrete_duas_horas_enviado_em = case when $19 then null else lembrete_duas_horas_enviado_em end,
            updated_by = $20
          where id = $1 and empresa_id = $2
        `, [
                id, auth.empresaId, input.profissionalId ?? null, input.pacienteId ?? null, input.tipo,
                title, (0, normalize_1.optionalText)(input.categoria), (0, normalize_1.optionalText)(input.observacoes), procedureNotes, period.start.toISOString(),
                period.end.toISOString(), input.diaInteiro, input.primeiraConsulta, (0, normalize_1.optionalText)(input.confirmacaoEnvio),
                (0, normalize_1.optionalText)(input.lembreteEnvio), notifications.enabled, notifications.app, notifications.whatsapp,
                rescheduled, auth.usuarioId,
            ]);
            await replaceProcedures(client, auth, id, input.procedimentos);
            if (input.tipo === 'consulta') {
                await syncConsultationQuote(client, auth, id, input, patientName, patientWhatsapp);
            }
            else {
                await client.query('update odonto.agenda_eventos set orcamento_id = null where id = $1 and empresa_id = $2', [id, auth.empresaId]);
            }
            if (procedureNotesChanged) {
                await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
           values ($1, $2, 'agenda_eventos', $3, 'update_procedure_notes', $4::jsonb)`, [auth.empresaId, auth.usuarioId, id, JSON.stringify({ campo: 'observacoes_procedimentos' })]);
            }
            if (rescheduled) {
                await client.query(`insert into odonto.agenda_evento_remarcacoes (
            empresa_id, agenda_evento_id, inicio_anterior, fim_anterior,
            inicio_novo, fim_novo, motivo, created_by
          ) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [auth.empresaId, id, previous.inicio_em, previous.fim_em, period.start.toISOString(),
                    period.end.toISOString(), (0, normalize_1.optionalText)(input.motivoRemarcacao), auth.usuarioId]);
            }
        });
        const event = await getEvent(auth, id);
        if (rescheduled && event.tipo === 'consulta') {
            await (0, schedule_notification_service_1.sendScheduleNotification)(id, 'remarcacao_agendamento', auth.usuarioId);
        }
        return event;
    }
    catch (error) {
        if (error.code === '23P01') {
            throw (0, http_error_1.conflict)('O profissional ja possui um agendamento nesse horario.');
        }
        throw error;
    }
}
async function updateEventStatus(auth, id, input) {
    await (0, pool_1.transaction)(async (client) => {
        const currentResult = await client.query('select status::text from odonto.agenda_eventos where id = $1 and empresa_id = $2 for update', [id, auth.empresaId]);
        const current = currentResult.rows[0]?.status;
        if (!current) {
            throw (0, http_error_1.notFound)('Agendamento nao encontrado.');
        }
        if (current === input.status) {
            return;
        }
        const allowed = schedule_status_1.scheduleStatusTransitions[current] ?? [];
        if (!allowed.includes(input.status)) {
            throw (0, http_error_1.conflict)(`Transicao de ${current} para ${input.status} nao permitida.`);
        }
        await client.query(`update odonto.agenda_eventos set
         status = $3::odonto.agenda_evento_status,
         confirmado_em = case when $3::text = 'confirmado' then now() else confirmado_em end,
         inicio_atendimento_em = case when $3::text = 'em_atendimento' then now() else inicio_atendimento_em end,
         fim_atendimento_em = case when $3::text in ('atendido', 'concluido') then now() else fim_atendimento_em end,
         justificativa_status = $4,
         updated_by = $5
       where id = $1 and empresa_id = $2`, [id, auth.empresaId, input.status, (0, normalize_1.optionalText)(input.justificativa), auth.usuarioId]);
        await client.query(`insert into odonto.agenda_evento_status_historico (
        empresa_id, agenda_evento_id, status_anterior, status_novo, justificativa, created_by
      ) values ($1, $2, $3, $4, $5, $6)`, [auth.empresaId, id, current, input.status, (0, normalize_1.optionalText)(input.justificativa), auth.usuarioId]);
        if (['atendido', 'concluido'].includes(input.status)) {
            await client.query(`insert into odonto.audit_logs (empresa_id,usuario_id,entidade,entidade_id,acao,payload)
         values ($1,$2,'agenda_eventos',$3,'conclusao_procedimento',$4::jsonb)`, [auth.empresaId, auth.usuarioId, id, JSON.stringify({ statusAnterior: current, statusNovo: input.status })]);
        }
    });
}
async function listReturnAlerts(auth, input) {
    const result = await (0, pool_1.query)(`
      select ar.id, ar.paciente_id, ar.profissional_id, ar.motivo,
             ar.retornar_em::text as retornar_em, ar.observacoes,
             ar.status::text as status, ar.agenda_evento_id,
             pac.nome as paciente_nome, p.nome as profissional_nome
        from odonto.alertas_retorno ar
        join odonto.pacientes pac on pac.id = ar.paciente_id and pac.empresa_id = ar.empresa_id
        left join odonto.profissionais p on p.id = ar.profissional_id and p.empresa_id = ar.empresa_id
       where ar.empresa_id = $1 and ar.status = $2
         and ($3::date is null or ar.retornar_em <= $3::date)
       order by ar.retornar_em, pac.nome
       limit 100
    `, [auth.empresaId, input.status, input.ate ?? null]);
    return result.rows.map(mapAlert);
}
async function createReturnAlert(auth, input) {
    const alertId = await (0, pool_1.transaction)(async (client) => {
        const patient = await client.query(`select 1 from odonto.pacientes where id = $1 and empresa_id = $2 and status = 'ativo' limit 1`, [input.pacienteId, auth.empresaId]);
        if (!patient.rowCount) {
            throw (0, http_error_1.notFound)('Paciente ativo nao encontrado.');
        }
        if (input.profissionalId) {
            const professional = await client.query(`select 1 from odonto.profissionais where id = $1 and empresa_id = $2 and status = 'ativo' limit 1`, [input.profissionalId, auth.empresaId]);
            if (!professional.rowCount) {
                throw (0, http_error_1.notFound)('Profissional ativo nao encontrado.');
            }
        }
        const result = await client.query(`
        insert into odonto.alertas_retorno (
          empresa_id, paciente_id, profissional_id, motivo, retornar_em, observacoes, created_by, updated_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $7)
        returning id
      `, [
            auth.empresaId, input.pacienteId, input.profissionalId ?? null, input.motivo,
            input.retornarEm, (0, normalize_1.optionalText)(input.observacoes), auth.usuarioId,
        ]);
        return result.rows[0].id;
    });
    const result = await (0, pool_1.query)(`
      select ar.id, ar.paciente_id, ar.profissional_id, ar.motivo,
             ar.retornar_em::text as retornar_em, ar.observacoes,
             ar.status::text as status, ar.agenda_evento_id,
             pac.nome as paciente_nome, p.nome as profissional_nome
        from odonto.alertas_retorno ar
        join odonto.pacientes pac on pac.id = ar.paciente_id and pac.empresa_id = ar.empresa_id
        left join odonto.profissionais p on p.id = ar.profissional_id and p.empresa_id = ar.empresa_id
       where ar.id = $1 and ar.empresa_id = $2
       limit 1
    `, [alertId, auth.empresaId]);
    return mapAlert(result.rows[0]);
}
async function updateReturnAlertStatus(auth, id, input) {
    const result = await (0, pool_1.query)(`
      update odonto.alertas_retorno
         set status = $3, agenda_evento_id = $4, updated_by = $5
       where id = $1 and empresa_id = $2
    `, [id, auth.empresaId, input.status, input.agendaEventoId ?? null, auth.usuarioId]);
    if (!result.rowCount) {
        throw (0, http_error_1.notFound)('Alerta de retorno nao encontrado.');
    }
}
