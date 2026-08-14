"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendScheduleNotification = sendScheduleNotification;
const pool_1 = require("../../database/pool");
const whatsapp_service_1 = require("../../services/whatsapp.service");
function normalizeWhatsAppNumber(country, phone) {
    const digits = phone?.replace(/\D/g, '') ?? '';
    if (!digits)
        return null;
    if (digits.startsWith('55') && digits.length >= 12)
        return digits;
    return (country ?? 'BR').toUpperCase() === 'BR' ? `55${digits}` : digits;
}
function contentFor(event, kind) {
    const date = new Date(event.inicio_em);
    const dateText = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(date);
    const timeText = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
    const procedures = event.procedimentos.join(', ');
    const title = kind === 'lembrete_duas_horas'
        ? 'Seu atendimento começa em 2 horas'
        : kind === 'remarcacao_agendamento'
            ? 'Consulta remarcada'
            : 'Consulta agendada';
    const action = kind === 'lembrete_duas_horas'
        ? 'Lembramos que seu atendimento acontece hoje'
        : kind === 'remarcacao_agendamento'
            ? 'Seu atendimento foi remarcado'
            : 'Seu atendimento foi agendado';
    return {
        title,
        date: dateText,
        time: timeText,
        procedures,
        message: `${action} para ${dateText}, as ${timeText}, com ${event.profissional_nome}. Procedimentos: ${procedures}.`,
    };
}
async function sendScheduleNotification(eventId, kind, createdBy = null) {
    const result = await (0, pool_1.query)(`select ae.id, ae.empresa_id, ae.paciente_id, pac.nome as paciente_nome,
            pct.celular, pct.celular_pais, p.nome as profissional_nome, ae.inicio_em::text,
            ae.notificar_aplicativo, ae.notificar_whatsapp,
            array_agg(aep.descricao order by aep.descricao) as procedimentos
       from odonto.agenda_eventos ae
       inner join odonto.pacientes pac on pac.id = ae.paciente_id and pac.empresa_id = ae.empresa_id
       inner join odonto.profissionais p on p.id = ae.profissional_id and p.empresa_id = ae.empresa_id
       inner join odonto.agenda_evento_procedimentos aep on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
       left join odonto.paciente_contatos pct on pct.paciente_id = pac.id
      where ae.id = $1 and ae.tipo = 'consulta' and ae.status in ('agendado', 'confirmado')
      group by ae.id, pac.id, pac.nome, pct.celular, pct.celular_pais, p.nome
      limit 1`, [eventId]);
    const event = result.rows[0];
    if (!event)
        return [];
    const content = contentFor(event, kind);
    const notifications = [];
    let whatsappStatus = null;
    let whatsappProviderId = null;
    let whatsappError = null;
    const phone = normalizeWhatsAppNumber(event.celular_pais, event.celular);
    if (event.notificar_whatsapp) {
        if (!phone) {
            whatsappStatus = 'falhou';
            whatsappError = 'Paciente sem celular cadastrado.';
        }
        else {
            const sent = await (0, whatsapp_service_1.sendAppointmentWhatsApp)({
                to: phone,
                patientName: event.paciente_nome.split(' ')[0],
                date: content.date,
                time: content.time,
                professionalName: event.profissional_nome,
                procedures: content.procedures,
            });
            whatsappStatus = sent.status;
            whatsappProviderId = sent.providerId ?? null;
            whatsappError = sent.error ?? null;
        }
    }
    await (0, pool_1.transaction)(async (client) => {
        if (event.notificar_aplicativo) {
            await client.query(`insert into odonto.notificacoes (
          empresa_id, paciente_id, agenda_evento_id, canal, tipo, titulo, mensagem,
          destinatario, status_envio, enviada_em, created_by
        ) values ($1, $2, $3, 'aplicativo', $4, $5, $6, 'portal do paciente', 'enviada', now(), $7)`, [event.empresa_id, event.paciente_id, event.id, kind, content.title, content.message, createdBy]);
            notifications.push({ canal: 'aplicativo', status: 'enviada', erro: null });
        }
        if (whatsappStatus) {
            await client.query(`insert into odonto.notificacoes (
          empresa_id, paciente_id, agenda_evento_id, canal, tipo, titulo, mensagem,
          destinatario, status_envio, provedor_id, erro_envio, enviada_em, created_by
        ) values ($1, $2, $3, 'whatsapp', $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [event.empresa_id, event.paciente_id, event.id, kind, content.title, content.message,
                phone, whatsappStatus, whatsappProviderId, whatsappError,
                whatsappStatus === 'enviada' ? new Date() : null, createdBy]);
            notifications.push({ canal: 'whatsapp', status: whatsappStatus, erro: whatsappError });
        }
    });
    return notifications;
}
