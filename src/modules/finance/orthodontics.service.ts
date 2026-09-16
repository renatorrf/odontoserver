import { query } from '../../database/pool';
import { AuthContext } from '../../types/public';

interface OrthodonticFollowUpRow {
  paciente_id: string;
  paciente_nome: string;
  celular: string | null;
  celular_pais: string | null;
  instalacao_em: string;
  instalacao_procedimento: string;
  instalacao_profissional: string | null;
  dias_sem_manutencao: string;
  manutencao_procedimento_id: string | null;
  manutencao_procedimento: string | null;
  agenda_evento_id: string | null;
  agenda_inicio_em: string | null;
  agenda_profissional: string | null;
}

export async function listOrthodonticFollowUps(auth: AuthContext) {
  const result = await query<OrthodonticFollowUpRow>(
    `with completed_orthodontics as (
       select pr.paciente_id,
              coalesce(pr.realizado_em, pr.data_procedimento::timestamp at time zone 'America/Sao_Paulo') as realizado_em,
              pr.descricao as procedimento,
              coalesce(pr.tipo_evento_ortodontico, cp.tipo_evento_ortodontico) as tipo_evento,
              prof.nome as profissional_nome
         from odonto.procedimentos_realizados pr
         join odonto.catalogo_procedimentos cp
           on cp.id=pr.catalogo_procedimento_id and cp.empresa_id=pr.empresa_id
         left join odonto.profissionais prof
           on prof.id=pr.profissional_id and prof.empresa_id=pr.empresa_id
        where pr.empresa_id=$1
          and coalesce(pr.tipo_evento_ortodontico, cp.tipo_evento_ortodontico) in ('INSTALACAO','MANUTENCAO')
       union all
       select ae.paciente_id, ae.fim_atendimento_em, aep.descricao,
              cp.tipo_evento_ortodontico, prof.nome
         from odonto.agenda_eventos ae
         join odonto.agenda_evento_procedimentos aep
           on aep.agenda_evento_id=ae.id and aep.empresa_id=ae.empresa_id
         join odonto.catalogo_procedimentos cp
           on cp.id=aep.catalogo_procedimento_id and cp.empresa_id=aep.empresa_id
         left join odonto.profissionais prof
           on prof.id=ae.profissional_id and prof.empresa_id=ae.empresa_id
        where ae.empresa_id=$1 and ae.paciente_id is not null
          and ae.status::text in ('atendido','concluido')
          and cp.tipo_evento_ortodontico in ('INSTALACAO','MANUTENCAO')
          and not exists (
            select 1 from odonto.procedimentos_realizados pr
             where pr.empresa_id=ae.empresa_id and pr.agenda_item_id=aep.id
          )
     ), latest_installation as (
       select distinct on (patient.paciente_id)
              patient.paciente_id, patient.realizado_em, patient.procedimento, patient.profissional_nome
         from completed_orthodontics patient
        where patient.tipo_evento='INSTALACAO'
        order by patient.paciente_id, patient.realizado_em desc
     )
     select p.id as paciente_id, p.nome as paciente_nome, pc.celular, pc.celular_pais,
            installation.realizado_em::text as instalacao_em,
            installation.procedimento as instalacao_procedimento,
            installation.profissional_nome as instalacao_profissional,
            greatest(current_date-(installation.realizado_em at time zone 'America/Sao_Paulo')::date,0)::text as dias_sem_manutencao,
            maintenance.id as manutencao_procedimento_id,
            maintenance.nome as manutencao_procedimento,
            appointment.id as agenda_evento_id,
            appointment.inicio_em::text as agenda_inicio_em,
            appointment.profissional_nome as agenda_profissional
       from latest_installation installation
       join odonto.pacientes p on p.id=installation.paciente_id and p.empresa_id=$1 and p.status='ativo'
       left join odonto.paciente_contatos pc on pc.paciente_id=p.id
       left join lateral (
         select cp.id, cp.nome
           from odonto.catalogo_procedimentos cp
          where cp.empresa_id=$1 and cp.ativo and cp.tipo_evento_ortodontico='MANUTENCAO'
          order by cp.nome
          limit 1
       ) maintenance on true
       left join lateral (
         select ae.id, ae.inicio_em, prof.nome as profissional_nome
           from odonto.agenda_eventos ae
           join odonto.profissionais prof on prof.id=ae.profissional_id and prof.empresa_id=ae.empresa_id
          where ae.empresa_id=$1 and ae.paciente_id=p.id and ae.tipo='consulta'
            and ae.status::text in ('agendado','confirmado') and ae.inicio_em>=now()
            and exists (
              select 1 from odonto.agenda_evento_procedimentos aep
              join odonto.catalogo_procedimentos cp
                on cp.id=aep.catalogo_procedimento_id and cp.empresa_id=aep.empresa_id
              where aep.empresa_id=ae.empresa_id and aep.agenda_evento_id=ae.id
                and aep.status::text not in ('cancelado','suspenso')
                and cp.tipo_evento_ortodontico='MANUTENCAO'
            )
          order by ae.inicio_em
          limit 1
       ) appointment on true
      where not exists (
        select 1 from completed_orthodontics follow_up
         where follow_up.paciente_id=installation.paciente_id
           and follow_up.tipo_evento='MANUTENCAO'
           and follow_up.realizado_em>installation.realizado_em
      )
      order by appointment.inicio_em nulls last, installation.realizado_em`,
    [auth.empresaId],
  );

  const pacientes = result.rows.map((row) => ({
    pacienteId: row.paciente_id,
    pacienteNome: row.paciente_nome,
    celular: row.celular,
    celularPais: row.celular_pais,
    whatsappDisponivel: Boolean(row.celular?.replace(/\D/g, '')),
    instalacaoEm: row.instalacao_em,
    instalacaoProcedimento: row.instalacao_procedimento,
    instalacaoProfissional: row.instalacao_profissional,
    diasSemManutencao: Number(row.dias_sem_manutencao),
    manutencaoProcedimentoId: row.manutencao_procedimento_id,
    manutencaoProcedimento: row.manutencao_procedimento,
    agendaEventoId: row.agenda_evento_id,
    agendaInicioEm: row.agenda_inicio_em,
    agendaProfissional: row.agenda_profissional,
  }));

  return {
    resumo: {
      pacientes: pacientes.length,
      agendados: pacientes.filter((item) => item.agendaEventoId).length,
      semAgendamento: pacientes.filter((item) => !item.agendaEventoId).length,
      comWhatsapp: pacientes.filter((item) => item.whatsappDisponivel).length,
    },
    pacientes,
  };
}
