import { PoolClient } from 'pg';
import { AuthContext } from '../../types/public';
import { notFound } from '../../utils/http-error';
import { ClinicalDocumentInput } from '../patients/patient-tabs.schemas';
import { assertClinical } from './dental.rules';

export async function dentalDocumentContent(client:PoolClient,auth:AuthContext,patientId:string,input:ClinicalDocumentInput) {
  assertClinical(auth);
  if(input.agendamentoId && !(await client.query('select 1 from odonto.agenda_eventos where id=$1 and empresa_id=$2 and paciente_id=$3',[input.agendamentoId,auth.empresaId,patientId])).rowCount) throw notFound('Agendamento nao pertence ao paciente.');
  if(input.procedimentoRealizadoId && !(await client.query('select 1 from odonto.procedimentos_realizados where id=$1 and empresa_id=$2 and paciente_id=$3',[input.procedimentoRealizadoId,auth.empresaId,patientId])).rowCount) throw notFound('Procedimento nao pertence ao paciente.');
  if(!(await client.query('select 1 from odonto.profissionais where id=$1 and empresa_id=$2',[input.profissionalId,auth.empresaId])).rowCount) throw notFound('Profissional nao encontrado.');
  const result=await client.query(`select distinct d.numero_dente as numero,d.tipo_denticao as denticao,
    case when d.realizado_id is null then 'programados' else 'realizados' end as etapa
    from odonto.procedimento_dentes d
    left join odonto.agenda_evento_procedimentos a on a.id=d.agenda_item_id and a.empresa_id=d.empresa_id
    left join odonto.procedimentos_realizados r on r.id=d.realizado_id and r.empresa_id=d.empresa_id
    left join odonto.agenda_evento_procedimentos ra on ra.id=r.agenda_item_id and ra.empresa_id=r.empresa_id
    where d.empresa_id=$1 and d.paciente_id=$2 and
      (d.realizado_id=$3::uuid or a.agenda_evento_id=$4::uuid or ra.agenda_evento_id=$4::uuid)
    order by numero`,[auth.empresaId,patientId,input.procedimentoRealizadoId ?? null,input.agendamentoId ?? null]);
  return {...input.conteudo,dentes:{
    programados:result.rows.filter((r)=>r.etapa==='programados').map(({numero,denticao})=>({numero,denticao})),
    realizados:result.rows.filter((r)=>r.etapa==='realizados').map(({numero,denticao})=>({numero,denticao})),
  }};
}
