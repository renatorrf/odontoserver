import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { notFound } from '../../utils/http-error';
import { sendAppointmentWhatsApp } from '../../services/whatsapp.service';
import { ProjectionQuery, SendProjectionNotificationInput } from './projection.schemas';

type CommissionType = 'porcentagem' | 'valor_fixo';
type NotificationChannel = 'aplicativo' | 'whatsapp';
type NotificationStatus = 'pendente' | 'enviada' | 'falhou';

interface ProjectionRow {
  evento_id: string;
  inicio_em: string;
  fim_em: string;
  status: string;
  paciente_id: string;
  paciente_nome: string;
  paciente_celular: string | null;
  celular_pais: string | null;
  profissional_id: string;
  profissional_nome: string;
  profissional_cor: string;
  procedimento_id: string;
  procedimento_descricao: string;
  procedimento_valor: string | null;
  comissao_configuracao_id: string | null;
  comissao_tipo: CommissionType | null;
  percentual_geral: string | null;
  valor_fixo: string | null;
  aplicativo_status: NotificationStatus | null;
  whatsapp_status: NotificationStatus | null;
}

interface NotificationEventRow {
  id: string;
  inicio_em: string;
  paciente_id: string;
  paciente_nome: string;
  paciente_celular: string | null;
  celular_pais: string | null;
  profissional_nome: string;
  procedimentos: string[];
}

interface ProjectionProcedure {
  id: string;
  descricao: string;
  valor: number;
  comissaoConfigurada: boolean;
  comissaoTipo: CommissionType | null;
  percentualComissao: number | null;
  valorComissao: number;
}

interface ProjectionAppointment {
  eventoId: string;
  inicioEm: string;
  fimEm: string;
  status: string;
  pacienteId: string;
  pacienteNome: string;
  whatsappDisponivel: boolean;
  profissionalId: string;
  profissionalNome: string;
  profissionalCor: string;
  procedimentos: ProjectionProcedure[];
  valorProcedimentos: number;
  valorComissoes: number;
  notificacoes: {
    aplicativo: NotificationStatus | null;
    whatsapp: NotificationStatus | null;
  };
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateCommission(row: ProjectionRow, procedureValue: number): number {
  if (row.comissao_tipo === 'porcentagem') {
    return money(procedureValue * Number(row.percentual_geral ?? 0) / 100);
  }
  if (row.comissao_tipo === 'valor_fixo') {
    return money(Number(row.valor_fixo ?? 0));
  }
  return 0;
}

function normalizeWhatsAppNumber(country: string | null, phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) {
    return null;
  }
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  return (country ?? 'BR').toUpperCase() === 'BR' ? `55${digits}` : digits;
}

function appointmentMessage(event: NotificationEventRow): {
  title: string;
  message: string;
  date: string;
  time: string;
  procedures: string;
} {
  const scheduledAt = new Date(event.inicio_em);
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(scheduledAt);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(scheduledAt);
  const procedures = event.procedimentos.join(', ');
  return {
    title: `Consulta agendada para ${date}`,
    message: `${event.paciente_nome}, sua consulta com ${event.profissional_nome} está agendada para ${date} às ${time}. Procedimentos: ${procedures}.`,
    date,
    time,
    procedures,
  };
}

export async function getRevenueProjection(auth: AuthContext, input: ProjectionQuery) {
  const result = await query<ProjectionRow>(
    `
      select
        ae.id as evento_id,
        ae.inicio_em,
        ae.fim_em,
        ae.status::text,
        pac.id as paciente_id,
        pac.nome as paciente_nome,
        pct.celular as paciente_celular,
        pct.celular_pais,
        p.id as profissional_id,
        p.nome as profissional_nome,
        p.cor_agenda as profissional_cor,
        aep.id as procedimento_id,
        aep.descricao as procedimento_descricao,
        aep.valor as procedimento_valor,
        pc.id as comissao_configuracao_id,
        pc.tipo::text as comissao_tipo,
        pc.percentual_geral,
        pc.valor_fixo,
        app_notification.status_envio::text as aplicativo_status,
        whatsapp_notification.status_envio::text as whatsapp_status
      from odonto.agenda_eventos ae
      inner join odonto.pacientes pac on pac.id = ae.paciente_id and pac.empresa_id = ae.empresa_id
      inner join odonto.profissionais p on p.id = ae.profissional_id and p.empresa_id = ae.empresa_id
      inner join odonto.agenda_evento_procedimentos aep on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
      left join odonto.paciente_contatos pct on pct.paciente_id = pac.id
      left join lateral (
        select commission.*
          from odonto.profissional_comissoes commission
         where commission.empresa_id = ae.empresa_id
           and commission.profissional_id = ae.profissional_id
           and commission.ativo = true
           and commission.valido_desde <= timezone('America/Sao_Paulo', ae.inicio_em)::date
           and (commission.valido_ate is null or commission.valido_ate >= timezone('America/Sao_Paulo', ae.inicio_em)::date)
         order by commission.valido_desde desc, commission.created_at desc
         limit 1
      ) pc on true
      left join lateral (
        select notification.status_envio
          from odonto.notificacoes notification
         where notification.empresa_id = ae.empresa_id
           and notification.agenda_evento_id = ae.id
           and notification.canal = 'aplicativo'
         order by notification.created_at desc
         limit 1
      ) app_notification on true
      left join lateral (
        select notification.status_envio
          from odonto.notificacoes notification
         where notification.empresa_id = ae.empresa_id
           and notification.agenda_evento_id = ae.id
           and notification.canal = 'whatsapp'
         order by notification.created_at desc
         limit 1
      ) whatsapp_notification on true
      where ae.empresa_id = $1
        and ae.tipo = 'consulta'
        and ae.status in ('agendado', 'confirmado')
        and ae.inicio_em >= $2::date
        and ae.inicio_em < ($3::date + interval '1 day')
        and ($4::uuid is null or ae.profissional_id = $4::uuid)
      order by p.nome, ae.inicio_em, aep.descricao
    `,
    [auth.empresaId, input.inicio, input.fim, input.profissionalId ?? null],
  );

  const appointments = new Map<string, ProjectionAppointment>();
  for (const row of result.rows) {
    const procedureValue = money(Number(row.procedimento_valor ?? 0));
    const calculatedCommission = calculateCommission(row, procedureValue);
    const appointment = appointments.get(row.evento_id) ?? {
      eventoId: row.evento_id,
      inicioEm: row.inicio_em,
      fimEm: row.fim_em,
      status: row.status,
      pacienteId: row.paciente_id,
      pacienteNome: row.paciente_nome,
      whatsappDisponivel: Boolean(normalizeWhatsAppNumber(row.celular_pais, row.paciente_celular)),
      profissionalId: row.profissional_id,
      profissionalNome: row.profissional_nome,
      profissionalCor: row.profissional_cor,
      procedimentos: [],
      valorProcedimentos: 0,
      valorComissoes: 0,
      notificacoes: {
        aplicativo: row.aplicativo_status,
        whatsapp: row.whatsapp_status,
      },
    };
    appointment.procedimentos.push({
      id: row.procedimento_id,
      descricao: row.procedimento_descricao,
      valor: procedureValue,
      comissaoConfigurada: Boolean(row.comissao_configuracao_id),
      comissaoTipo: row.comissao_tipo,
      percentualComissao: row.percentual_geral == null ? null : Number(row.percentual_geral),
      valorComissao: calculatedCommission,
    });
    appointment.valorProcedimentos = money(appointment.valorProcedimentos + procedureValue);
    appointment.valorComissoes = money(appointment.valorComissoes + calculatedCommission);
    appointments.set(row.evento_id, appointment);
  }

  const groups = new Map<string, {
    profissionalId: string;
    profissionalNome: string;
    profissionalCor: string;
    quantidadeAgendamentos: number;
    quantidadeProcedimentos: number;
    valorProcedimentos: number;
    valorComissoes: number;
    agendamentos: ProjectionAppointment[];
  }>();
  for (const appointment of appointments.values()) {
    const group = groups.get(appointment.profissionalId) ?? {
      profissionalId: appointment.profissionalId,
      profissionalNome: appointment.profissionalNome,
      profissionalCor: appointment.profissionalCor,
      quantidadeAgendamentos: 0,
      quantidadeProcedimentos: 0,
      valorProcedimentos: 0,
      valorComissoes: 0,
      agendamentos: [],
    };
    group.agendamentos.push(appointment);
    group.quantidadeAgendamentos += 1;
    group.quantidadeProcedimentos += appointment.procedimentos.length;
    group.valorProcedimentos = money(group.valorProcedimentos + appointment.valorProcedimentos);
    group.valorComissoes = money(group.valorComissoes + appointment.valorComissoes);
    groups.set(appointment.profissionalId, group);
  }
  const grouped = [...groups.values()];
  return {
    grupos: grouped,
    resumo: {
      quantidadeAgendamentos: appointments.size,
      quantidadeProcedimentos: result.rows.length,
      quantidadeProfissionais: grouped.length,
      valorProcedimentos: money(grouped.reduce((total, group) => total + group.valorProcedimentos, 0)),
      valorComissoes: money(grouped.reduce((total, group) => total + group.valorComissoes, 0)),
    },
  };
}

export async function sendProjectionNotification(
  auth: AuthContext,
  eventId: string,
  input: SendProjectionNotificationInput,
) {
  return transaction(async (client) => {
    const eventResult = await client.query<NotificationEventRow>(
      `
        select
          ae.id,
          ae.inicio_em,
          pac.id as paciente_id,
          pac.nome as paciente_nome,
          pct.celular as paciente_celular,
          pct.celular_pais,
          p.nome as profissional_nome,
          array_agg(aep.descricao order by aep.descricao) as procedimentos
        from odonto.agenda_eventos ae
        inner join odonto.pacientes pac on pac.id = ae.paciente_id and pac.empresa_id = ae.empresa_id
        inner join odonto.profissionais p on p.id = ae.profissional_id and p.empresa_id = ae.empresa_id
        inner join odonto.agenda_evento_procedimentos aep on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
        left join odonto.paciente_contatos pct on pct.paciente_id = pac.id
        where ae.id = $1
          and ae.empresa_id = $2
          and ae.tipo = 'consulta'
          and ae.status in ('agendado', 'confirmado')
        group by ae.id, pac.id, pac.nome, pct.celular, pct.celular_pais, p.nome
        limit 1
      `,
      [eventId, auth.empresaId],
    );
    const event = eventResult.rows[0];
    if (!event) {
      throw notFound('Agendamento futuro nao encontrado.');
    }

    const content = appointmentMessage(event);
    const results: Array<{ canal: NotificationChannel; status: NotificationStatus; message: string }> = [];
    const channels = [...new Set(input.canais)] as NotificationChannel[];
    for (const channel of channels) {
      let status: NotificationStatus = 'enviada';
      let recipient = 'portal do paciente';
      let providerId: string | null = null;
      let error: string | null = null;

      if (channel === 'whatsapp') {
        const phone = normalizeWhatsAppNumber(event.celular_pais, event.paciente_celular);
        recipient = phone ?? '';
        if (!phone) {
          status = 'falhou';
          error = 'Paciente sem celular cadastrado.';
        } else {
          const result = await sendAppointmentWhatsApp({
            to: phone,
            patientName: event.paciente_nome.split(' ')[0],
            date: content.date,
            time: content.time,
            professionalName: event.profissional_nome,
            procedures: content.procedures,
          });
          status = result.status;
          providerId = result.providerId ?? null;
          error = result.error ?? null;
        }
      }

      await client.query(
        `
          insert into odonto.notificacoes (
            empresa_id, paciente_id, agenda_evento_id, canal, titulo, mensagem,
            destinatario, status_envio, provedor_id, erro_envio, enviada_em, created_by
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          auth.empresaId,
          event.paciente_id,
          event.id,
          channel,
          content.title,
          content.message,
          recipient || null,
          status,
          providerId,
          error,
          status === 'enviada' ? new Date() : null,
          auth.usuarioId,
        ],
      );
      results.push({
        canal: channel,
        status,
        message: error ?? (status === 'enviada' ? 'Notificacao enviada.' : 'Notificacao pendente.'),
      });
    }
    return results;
  });
}
