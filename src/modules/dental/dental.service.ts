import { PoolClient } from 'pg';
import { query } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { assertClinical, sameTeeth, Tooth, teethSchema } from './dental.rules';

type Stage = 'orcamento_item_id' | 'agenda_item_id' | 'realizado_id';
export async function patientDentalContext(auth:AuthContext,patientId:string,quoteId?:string) {
  assertClinical(auth);
  const patient=await query('select id from odonto.pacientes where id=$1 and empresa_id=$2',[patientId,auth.empresaId]);
  if(!patient.rowCount) throw notFound('Paciente nao encontrado.');
  const result=await query<{numero:number; realizado:boolean}>(`select distinct d.numero_dente as numero,d.realizado_id is not null as realizado
    from odonto.procedimento_dentes d
    left join odonto.orcamento_itens i on i.id=d.orcamento_item_id and i.empresa_id=d.empresa_id
    left join odonto.orcamentos o on o.id=i.orcamento_id and o.empresa_id=i.empresa_id
    where d.empresa_id=$1 and d.paciente_id=$2 and (d.realizado_id is not null or
      (o.id is not null and ($3::uuid is null or o.id<>$3)
       and i.status not in ('concluido','cancelado','suspenso')
       and o.status::text not in ('nao_aprovado','recusado','cancelado','expirado','concluido')))
    order by numero`,[auth.empresaId,patientId,quoteId ?? null]);
  return {planejados:result.rows.filter(r=>!r.realizado).map(r=>r.numero),realizados:result.rows.filter(r=>r.realizado).map(r=>r.numero)};
}
export async function readTeeth(client: {query: (text:string,values?:unknown[])=>Promise<{rows:any[]}>}, auth: AuthContext, stage: Stage, id: string): Promise<Tooth[]> {
  const result = await client.query(`select numero_dente as numero, tipo_denticao as denticao
    from odonto.procedimento_dentes where empresa_id=$1 and ${stage}=$2 order by numero_dente`, [auth.empresaId, id]);
  return result.rows;
}

export async function writeTeeth(client: PoolClient, auth: AuthContext, stage: Stage, id: string,
  patientId: string | null, teeth: Tooth[], context: Record<string, unknown> = {}, reason?: string | null) {
  teethSchema.parse(teeth);
  const before = await readTeeth(client, auth, stage, id);
  if (sameTeeth(before, teeth)) {
    await client.query(`update odonto.procedimento_dentes set paciente_id=$3 where empresa_id=$1 and ${stage}=$2`, [auth.empresaId, id, patientId]);
    return;
  }
  assertClinical(auth);
  await client.query(`delete from odonto.procedimento_dentes where empresa_id=$1 and ${stage}=$2`, [auth.empresaId, id]);
  for (const tooth of teeth) {
    await client.query(`insert into odonto.procedimento_dentes
      (empresa_id,paciente_id,${stage},numero_dente,tipo_denticao,created_by,updated_by)
      values ($1,$2,$3,$4,$5,$6,$6)`, [auth.empresaId,patientId,id,tooth.numero,tooth.denticao,auth.usuarioId]);
  }
  await client.query(`insert into odonto.audit_logs(empresa_id,usuario_id,entidade,entidade_id,acao,payload)
    values ($1,$2,'procedimento_dentes',$3,$4,$5::jsonb)`, [auth.empresaId,auth.usuarioId,id,
    stage === 'realizado_id' ? 'extracao_confirmada_ou_corrigida' : 'dentes_planejamento_alterados',
    JSON.stringify({ ...context, pacienteId:patientId, etapa:stage, dentesAnteriores:before, dentesNovos:teeth, justificativa:reason })]);
}

export async function checkPlannedTeeth(client: PoolClient, auth: AuthContext, patientId: string | null,
  teeth: Tooth[], quoteId: string | null, reason?: string | null) {
  if (!patientId || !teeth.length) return;
  // Serialize planning for a patient to prevent two concurrent plans from bypassing the warning.
  await client.query('select id from odonto.pacientes where empresa_id=$1 and id=$2 for update', [auth.empresaId, patientId]);
  const result = await client.query(`select distinct d.numero_dente from odonto.procedimento_dentes d
    join odonto.orcamento_itens i on i.id=d.orcamento_item_id and i.empresa_id=d.empresa_id
    join odonto.orcamentos o on o.id=i.orcamento_id and o.empresa_id=i.empresa_id
    where d.empresa_id=$1 and d.paciente_id=$2 and d.numero_dente=any($3::smallint[])
      and ($4::uuid is null or o.id<>$4) and i.status not in ('concluido','cancelado','suspenso')
      and o.status::text not in ('nao_aprovado','recusado','cancelado','expirado','concluido')`,
    [auth.empresaId,patientId,teeth.map((t)=>t.numero),quoteId]);
  if (result.rowCount) {
    if (!reason || reason.trim().length < 3) throw conflict(`Dentes com outra extracao planejada: ${result.rows.map((r)=>r.numero_dente).join(', ')}. Confirme a excecao com justificativa.`);
    assertClinical(auth);
    await client.query(`insert into odonto.audit_logs(empresa_id,usuario_id,entidade,entidade_id,acao,payload)
      values ($1,$2,'paciente',$3,'extracao_planejada_excecao',$4::jsonb)`, [auth.empresaId,auth.usuarioId,patientId,
      JSON.stringify({orcamentoId:quoteId,dentes:teeth,justificativa:reason})]);
  }
}

export interface ExecutionInput { agendaItemId: string; dentes: Tooth[]; justificativa?: string | null; confirmado: boolean }

export async function completeExtractions(client: PoolClient, auth: AuthContext, eventId: string, executions: ExecutionInput[]) {
  const result = await client.query(`select a.id, a.orcamento_item_id, a.catalogo_procedimento_id, a.descricao, a.valor, a.quantidade, a.forma_cobranca,
    e.paciente_id,e.profissional_id,e.orcamento_id,e.observacoes_procedimentos,p.nome as profissional_nome
    from odonto.agenda_evento_procedimentos a join odonto.agenda_eventos e on e.id=a.agenda_evento_id and e.empresa_id=a.empresa_id
    left join odonto.profissionais p on p.id=e.profissional_id and p.empresa_id=e.empresa_id
    where a.empresa_id=$1 and a.agenda_evento_id=$2 and a.extracao and a.status not in ('cancelado','suspenso') for update of a`, [auth.empresaId,eventId]);
  if (!result.rowCount) return;
  assertClinical(auth);
  for (const item of result.rows) {
    const execution = executions.find((input) => input.agendaItemId === item.id);
    if (!execution?.confirmado || !execution.dentes.length) throw badRequest('Confirme os dentes efetivamente extraidos antes de concluir o atendimento.');
    const planned = await readTeeth(client,auth,'agenda_item_id',item.id);
    if (!sameTeeth(planned, execution.dentes) && (!execution.justificativa || execution.justificativa.trim().length<3)) {
      throw badRequest('Justifique a diferenca entre dentes programados e extraidos.');
    }
    const realized = await client.query<{id:string}>(`insert into odonto.procedimentos_realizados
      (empresa_id,paciente_id,profissional_id,catalogo_procedimento_id,data_procedimento,descricao,dente,profissional_nome,
       valor,observacoes,created_by,agenda_item_id,orcamento_item_id,realizado_em)
      values ($1,$2,$3,$4,(now() at time zone 'America/Sao_Paulo')::date,$5,$6,$7,$8,$9,$10,$11,$12,now())
      on conflict (agenda_item_id) do nothing returning id`, [auth.empresaId,item.paciente_id,item.profissional_id,
      item.catalogo_procedimento_id,item.descricao,execution.dentes.map((t)=>t.numero).join(', '),item.profissional_nome,
      item.forma_cobranca==='POR_DENTE' ? Number((Number(item.valor)/item.quantidade*execution.dentes.length).toFixed(2)) : item.valor,item.observacoes_procedimentos,auth.usuarioId,item.id,item.orcamento_item_id]);
    if (!realized.rowCount) throw conflict('Extracao ja concluida. Utilize a correcao clinica com justificativa.');
    await writeTeeth(client,auth,'realizado_id',realized.rows[0].id,item.paciente_id,execution.dentes,
      {agendamentoId:eventId,orcamentoId:item.orcamento_id,itemId:item.orcamento_item_id,dentesProgramados:planned},execution.justificativa);
    await client.query(`update odonto.agenda_evento_procedimentos set status='concluido' where id=$1 and empresa_id=$2`,[item.id,auth.empresaId]);
    if (item.orcamento_item_id) await client.query(`update odonto.orcamento_itens set status='concluido' where id=$1 and empresa_id=$2`,[item.orcamento_item_id,auth.empresaId]);
  }
}

export async function correctExtraction(client: PoolClient, auth: AuthContext, id: string, teeth: Tooth[], reason: string) {
  assertClinical(auth);
  const result = await client.query(`select paciente_id,agenda_item_id,orcamento_item_id from odonto.procedimentos_realizados
    where id=$1 and empresa_id=$2 for update`,[id,auth.empresaId]);
  if (!result.rowCount) throw notFound('Extracao nao encontrada.');
  if (!(await readTeeth(client,auth,'realizado_id',id)).length) throw badRequest('Este registro nao e uma extracao estruturada.');
  if (!teeth.length || reason.trim().length<3) throw badRequest('Informe os dentes e justifique a correcao.');
  await writeTeeth(client,auth,'realizado_id',id,result.rows[0].paciente_id,teeth,result.rows[0],reason);
  await client.query('update odonto.procedimentos_realizados set dente=$3 where id=$1 and empresa_id=$2', [id,auth.empresaId,teeth.map((t)=>t.numero).join(', ')]);
}
