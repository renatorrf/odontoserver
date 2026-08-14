import { query } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { forbidden, notFound } from '../../utils/http-error';

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
  if (auth.perfil !== 'paciente' || !auth.pacienteId) {
    throw forbidden();
  }

  const result = await query(
    `
      select
        ae.id,
        ae.inicio_em,
        ae.fim_em,
        ae.status::text,
        p.nome as profissional_nome,
        p.cor_agenda as profissional_cor,
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

  return result.rows.map((row) => ({
    id: row.id,
    inicioEm: row.inicio_em,
    fimEm: row.fim_em,
    status: row.status,
    profissionalNome: row.profissional_nome,
    profissionalCor: row.profissional_cor,
    procedimentos: row.procedimentos,
  }));
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
