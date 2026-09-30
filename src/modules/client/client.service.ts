import { QueryResult } from 'pg';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { listProfessionalAvailability, validateProfessionalSlot } from '../schedule/availability.service';
import { sendScheduleNotification } from '../schedule/schedule-notification.service';

interface ClientAppointmentRow {
  id: string;
  inicio_em: string;
  fim_em: string;
  status: 'agendado' | 'confirmado';
  profissional_id: string;
  profissional_nome: string;
  profissional_cor: string | null;
  retorno_ortodontico: boolean;
  procedimentos: Array<{ descricao: string }>;
}

function assertPatient(auth: AuthContext): asserts auth is AuthContext & { pacienteId: string } {
  if (auth.perfil !== 'paciente' || !auth.pacienteId) {
    throw forbidden();
  }
}

function mapClientAppointment(row: ClientAppointmentRow) {
  return {
    id: row.id,
    inicioEm: row.inicio_em,
    fimEm: row.fim_em,
    status: row.status,
    profissionalId: row.profissional_id,
    profissionalNome: row.profissional_nome,
    profissionalCor: row.profissional_cor,
    retornoOrtodontico: row.retorno_ortodontico,
    confirmacaoNecessaria: row.retorno_ortodontico && row.status === 'agendado',
    podeRemarcar: row.retorno_ortodontico,
    procedimentos: row.procedimentos,
  };
}

async function findClientAppointment(
  runQuery: (text: string, values: unknown[]) => Promise<QueryResult<ClientAppointmentRow>>,
  auth: AuthContext & { pacienteId: string },
  id: string,
  lock = false,
) {
  if (lock) {
    await runQuery(
      `select ae.* from odonto.agenda_eventos ae
        where ae.id = $1 and ae.empresa_id = $2 and ae.paciente_id = $3
        for update`,
      [id, auth.empresaId, auth.pacienteId],
    );
  }
  const result = await runQuery(
    `select ae.id, ae.inicio_em::text, ae.fim_em::text, ae.status::text,
            ae.profissional_id, p.nome as profissional_nome, p.cor_agenda as profissional_cor,
            ae.retorno_ortodontico,
            coalesce(
              json_agg(json_build_object('descricao', aep.descricao) order by aep.descricao)
                filter (where aep.id is not null),
              '[]'::json
            ) as procedimentos
       from odonto.agenda_eventos ae
       join odonto.profissionais p on p.id = ae.profissional_id and p.empresa_id = ae.empresa_id
       left join odonto.agenda_evento_procedimentos aep
         on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
      where ae.id = $1 and ae.empresa_id = $2 and ae.paciente_id = $3
        and ae.tipo = 'consulta' and ae.status in ('agendado', 'confirmado')
        and ae.fim_em >= now()
      group by ae.id, p.nome, p.cor_agenda`,
    [id, auth.empresaId, auth.pacienteId],
  );
  if (!result.rowCount) throw notFound('Agendamento nao encontrado.');
  return result.rows[0];
}

export async function getClientProfile(auth: AuthContext) {
  if (auth.perfil !== 'paciente' || !auth.pacienteId) {
    throw forbidden();
  }

  const result = await query(
    `
      select
        p.id,
        p.nome,
        p.apelido,
        p.nascimento,
        p.cpf,
        p.rg,
        p.status,
        e.nome_fantasia as empresa_nome,
        c.celular,
        c.email,
        pe.cidade,
        pe.estado
      from odonto.pacientes p
      inner join odonto.empresas e on e.id = p.empresa_id
      left join odonto.paciente_contatos c on c.paciente_id = p.id
      left join odonto.paciente_enderecos pe on pe.paciente_id = p.id and pe.principal = true
      where p.id = $1
        and p.empresa_id = $2
        and p.status = 'ativo'
      limit 1
    `,
    [auth.pacienteId, auth.empresaId],
  );
  const patient = result.rows[0];

  if (!patient) {
    throw notFound('Paciente nao encontrado.');
  }

  return {
    id: patient.id,
    nome: patient.nome,
    apelido: patient.apelido,
    nascimento: patient.nascimento,
    cpf: patient.cpf,
    rg: patient.rg,
    status: patient.status,
    empresaNome: patient.empresa_nome,
    contato: {
      celular: patient.celular,
      email: patient.email,
    },
    endereco: {
      cidade: patient.cidade,
      estado: patient.estado,
    },
    senhaTemporaria: Boolean(auth.senhaTemporaria),
  };
}

export async function listClientProcedures(auth: AuthContext) {
  if (auth.perfil !== 'paciente' || !auth.pacienteId) {
    throw forbidden();
  }

  const result = await query(
    `
      select
        id,
        data_procedimento,
        descricao,
        dente,
        profissional_nome,
        valor,
        observacoes
      from odonto.procedimentos_realizados
      where empresa_id = $1
        and paciente_id = $2
      order by data_procedimento desc, created_at desc
    `,
    [auth.empresaId, auth.pacienteId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    dataProcedimento: row.data_procedimento,
    descricao: row.descricao,
    dente: row.dente,
    profissionalNome: row.profissional_nome,
    valor: row.valor,
    observacoes: row.observacoes,
  }));
}

export async function listClientAppointments(auth: AuthContext) {
  assertPatient(auth);

  const result = await query<ClientAppointmentRow>(
    `
      select
        ae.id,
        ae.inicio_em,
        ae.fim_em,
        ae.status::text,
        ae.profissional_id,
        p.nome as profissional_nome,
        p.cor_agenda as profissional_cor,
        ae.retorno_ortodontico,
        coalesce(
          json_agg(
            json_build_object('descricao', aep.descricao)
            order by aep.descricao
          ) filter (where aep.id is not null),
          '[]'::json
        ) as procedimentos
      from odonto.agenda_eventos ae
      inner join odonto.profissionais p on p.id = ae.profissional_id and p.empresa_id = ae.empresa_id
      left join odonto.agenda_evento_procedimentos aep on aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
      where ae.empresa_id = $1
        and ae.paciente_id = $2
        and ae.tipo = 'consulta'
        and ae.status in ('agendado', 'confirmado')
        and ae.fim_em >= now()
      group by ae.id, p.nome, p.cor_agenda
      order by ae.inicio_em
      limit 50
    `,
    [auth.empresaId, auth.pacienteId],
  );

  return result.rows.map(mapClientAppointment);
}

export async function confirmClientAppointment(auth: AuthContext, id: string) {
  assertPatient(auth);
  await transaction(async (client) => {
    const appointment = await findClientAppointment(
      (text, values) => client.query<ClientAppointmentRow>(text, values),
      auth,
      id,
      true,
    );
    if (!appointment.retorno_ortodontico) {
      throw badRequest('Somente retornos ortodonticos automaticos podem ser confirmados pelo portal.');
    }
    if (appointment.status === 'confirmado') return;
    await client.query(
      `update odonto.agenda_eventos
          set status = 'confirmado', confirmado_em = now(), updated_by = $4
        where id = $1 and empresa_id = $2 and paciente_id = $3`,
      [id, auth.empresaId, auth.pacienteId, auth.usuarioId],
    );
    await client.query(
      `insert into odonto.agenda_evento_status_historico (
         empresa_id, agenda_evento_id, status_anterior, status_novo, justificativa, created_by
       ) values ($1, $2, 'agendado', 'confirmado', 'Confirmado pelo paciente no portal', $3)`,
      [auth.empresaId, id, auth.usuarioId],
    );
    await client.query(
      `insert into odonto.notificacoes (
         empresa_id, paciente_id, agenda_evento_id, canal, tipo, titulo, mensagem,
         destinatario, status_envio, enviada_em, created_by
       ) values (
         $1, $2, $3, 'aplicativo', 'confirmacao_paciente', 'Horario confirmado',
         'Seu retorno ortodontico foi confirmado. O horario ja esta reservado na agenda da clinica.',
         'portal do paciente', 'enviada', now(), $4
       )`,
      [auth.empresaId, auth.pacienteId, id, auth.usuarioId],
    );
  });
  return mapClientAppointment(await findClientAppointment((text, values) => query<ClientAppointmentRow>(text, values), auth, id));
}

export async function listClientAppointmentAvailability(
  auth: AuthContext,
  id: string,
  startDate: string,
  days: number,
) {
  assertPatient(auth);
  const appointment = await findClientAppointment((text, values) => query<ClientAppointmentRow>(text, values), auth, id);
  if (!appointment.retorno_ortodontico) {
    throw badRequest('Este agendamento nao permite remarcacao pelo portal.');
  }
  const durationMinutes = Math.max(
    5,
    Math.round((new Date(appointment.fim_em).getTime() - new Date(appointment.inicio_em).getTime()) / 60_000),
  );
  return listProfessionalAvailability(auth, {
    profissionalId: appointment.profissional_id,
    inicio: startDate,
    dias: days,
    duracaoMinutos: durationMinutes,
    diaInteiro: false,
    ignorarEventoId: id,
  });
}

export async function rescheduleClientAppointment(auth: AuthContext, id: string, startAt: string) {
  assertPatient(auth);
  const start = new Date(startAt);
  if (start.getTime() <= Date.now()) throw badRequest('Selecione um horario futuro.');

  await transaction(async (client) => {
    const appointment = await findClientAppointment(
      (text, values) => client.query<ClientAppointmentRow>(text, values),
      auth,
      id,
      true,
    );
    if (!appointment.retorno_ortodontico) {
      throw badRequest('Este agendamento nao permite remarcacao pelo portal.');
    }
    const durationMilliseconds = new Date(appointment.fim_em).getTime()
      - new Date(appointment.inicio_em).getTime();
    const end = new Date(start.getTime() + durationMilliseconds);
    await validateProfessionalSlot(client, auth, {
      profissionalId: appointment.profissional_id,
      inicioEm: start,
      fimEm: end,
      diaInteiro: false,
      ignorarEventoId: id,
    });
    const updated = await client.query(
      `update odonto.agenda_eventos
          set inicio_em = $4, fim_em = $5, status = 'confirmado', confirmado_em = now(),
              lembrete_duas_horas_enviado_em = null, lembrete_tres_dias_enviado_em = null,
              updated_by = $6
        where id = $1 and empresa_id = $2 and paciente_id = $3
          and status in ('agendado', 'confirmado')`,
      [id, auth.empresaId, auth.pacienteId, start.toISOString(), end.toISOString(), auth.usuarioId],
    );
    if (!updated.rowCount) throw conflict('O agendamento nao esta mais disponivel para remarcacao.');
    await client.query(
      `insert into odonto.agenda_evento_remarcacoes (
         empresa_id, agenda_evento_id, inicio_anterior, fim_anterior,
         inicio_novo, fim_novo, motivo, created_by
       ) values ($1, $2, $3, $4, $5, $6, 'Alterado pelo paciente no portal', $7)`,
      [auth.empresaId, id, appointment.inicio_em, appointment.fim_em,
        start.toISOString(), end.toISOString(), auth.usuarioId],
    );
    if (appointment.status !== 'confirmado') {
      await client.query(
        `insert into odonto.agenda_evento_status_historico (
           empresa_id, agenda_evento_id, status_anterior, status_novo, justificativa, created_by
         ) values ($1, $2, $3, 'confirmado', 'Novo horario escolhido pelo paciente', $4)`,
        [auth.empresaId, id, appointment.status, auth.usuarioId],
      );
    }
    await client.query(
      `update odonto.alertas_retorno
          set retornar_em = ($3::timestamptz at time zone 'America/Sao_Paulo')::date,
              status = 'agendado', updated_by = $4
        where empresa_id = $1 and agenda_evento_id = $2`,
      [auth.empresaId, id, start.toISOString(), auth.usuarioId],
    );
  });
  await sendScheduleNotification(id, 'remarcacao_agendamento', auth.usuarioId);
  return mapClientAppointment(await findClientAppointment((text, values) => query<ClientAppointmentRow>(text, values), auth, id));
}

export async function listClientNotifications(auth: AuthContext) {
  if (auth.perfil !== 'paciente' || !auth.pacienteId) {
    throw forbidden();
  }

  const result = await query(
    `
      select id, agenda_evento_id, canal::text, titulo, mensagem, status_envio::text,
             enviada_em, lida_em, created_at
       from odonto.notificacoes
       where empresa_id = $1
         and paciente_id = $2
         and canal = 'aplicativo'
         and status_envio = 'enviada'
       order by created_at desc
       limit 100
    `,
    [auth.empresaId, auth.pacienteId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    agendaEventoId: row.agenda_evento_id,
    canal: row.canal,
    titulo: row.titulo,
    mensagem: row.mensagem,
    statusEnvio: row.status_envio,
    enviadaEm: row.enviada_em,
    lidaEm: row.lida_em,
    criadaEm: row.created_at,
  }));
}

export async function markClientNotificationRead(auth: AuthContext, id: string): Promise<void> {
  if (auth.perfil !== 'paciente' || !auth.pacienteId) {
    throw forbidden();
  }

  const result = await query(
    `
      update odonto.notificacoes
         set lida_em = coalesce(lida_em, now())
       where id = $1 and empresa_id = $2 and paciente_id = $3
    `,
    [id, auth.empresaId, auth.pacienteId],
  );
  if (!result.rowCount) {
    throw notFound('Notificacao nao encontrada.');
  }
}
