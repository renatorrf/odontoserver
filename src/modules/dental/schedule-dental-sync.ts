import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { AuthContext } from '../../types/public';
import { badRequest, conflict, notFound } from '../../utils/http-error';
import { ScheduleEventInput } from '../schedule/schedule.schemas';
import { dentalQuantity, sameTeeth } from './dental.rules';
import { readTeeth, writeTeeth, checkPlannedTeeth } from './dental.service';

export async function syncScheduledItems(client:PoolClient,auth:AuthContext,eventId:string,items:ScheduleEventInput['procedimentos']) {
  const previous = await client.query('select * from odonto.agenda_evento_procedimentos where agenda_evento_id=$1 and empresa_id=$2 for update',[eventId,auth.empresaId]);
  if(previous.rows.some((r)=>r.status==='concluido')) throw conflict('Procedimento concluido: utilize a correcao clinica justificada.');
  const event=(await client.query('select paciente_id,orcamento_id from odonto.agenda_eventos where id=$1 and empresa_id=$2',[eventId,auth.empresaId])).rows[0];
  const catalog=await client.query('select * from odonto.catalogo_procedimentos where empresa_id=$1 and id=any($2::uuid[])',[auth.empresaId,items.map((i)=>i.catalogoProcedimentoId)]);
  const kept:string[]=[];
  const teeth=items.flatMap((i)=>i.dentes.map((t)=>t.numero));
  if(new Set(teeth).size!==teeth.length) throw badRequest('Um dente esta repetido entre as extracoes.');
  for(const item of items) {
    const procedure=catalog.rows.find((r)=>r.id===item.catalogoProcedimentoId);
    if(!procedure) throw notFound('Procedimento nao encontrado.');
    const existing=item.id ? previous.rows.find((r)=>r.id===item.id)
      : previous.rows.find((r)=>r.catalogo_procedimento_id===item.catalogoProcedimentoId && !kept.includes(r.id));
    if(item.id && !existing) throw badRequest('Item de agendamento invalido.');
    if(existing && existing.catalogo_procedimento_id!==item.catalogoProcedimentoId) throw badRequest('Remova o item antes de selecionar outro procedimento.');
    const config=existing ?? procedure;
    if(existing?.orcamento_item_id && config.extracao && !sameTeeth(await readTeeth(client,auth,'orcamento_item_id',existing.orcamento_item_id),item.dentes) && !item.justificativaDentes?.trim()) throw badRequest('Justifique a alteracao dos dentes programados em relacao ao orcamento.');
    dentalQuantity(config,item.dentes,item.quantidade);
    await checkPlannedTeeth(client,auth,event.paciente_id,item.dentes,event.orcamento_id,item.justificativaDentes);
    const id=existing?.id ?? randomUUID();
    if(kept.includes(id)) throw badRequest('Item repetido.');
    kept.push(id);
    await client.query(`insert into odonto.agenda_evento_procedimentos
      (id,empresa_id,agenda_evento_id,catalogo_procedimento_id,descricao,valor,quantidade,duracao_minutos,extracao,forma_cobranca)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(id) do update set
      descricao=excluded.descricao,valor=excluded.valor,quantidade=excluded.quantidade,duracao_minutos=excluded.duracao_minutos`,
      [id,auth.empresaId,eventId,procedure.id,procedure.nome,
        (existing ? Number(existing.valor)/existing.quantidade : Number(procedure.valor))*item.quantidade,
        item.quantidade,procedure.duracao_minutos*item.quantidade,config.extracao,config.forma_cobranca]);
    await writeTeeth(client,auth,'agenda_item_id',id,event.paciente_id,item.dentes,{agendamentoId:eventId,orcamentoId:event.orcamento_id},item.justificativaDentes);
  }
  for(const row of previous.rows.filter((r)=>!kept.includes(r.id))) {
    await writeTeeth(client,auth,'agenda_item_id',row.id,event.paciente_id,[],{agendamentoId:eventId});
    await client.query('delete from odonto.agenda_evento_procedimentos where id=$1 and empresa_id=$2',[row.id,auth.empresaId]);
    if(row.orcamento_item_id && !row.extracao) {
      await writeTeeth(client,auth,'orcamento_item_id',row.orcamento_item_id,event.paciente_id,[],{orcamentoId:event.orcamento_id});
      await client.query('delete from odonto.orcamento_itens where id=$1 and empresa_id=$2',[row.orcamento_item_id,auth.empresaId]);
    }
  }
}

export async function syncQuoteFromSchedule(client:PoolClient,auth:AuthContext,eventId:string,quoteId:string,patientId:string|null) {
  const items=await client.query('select * from odonto.agenda_evento_procedimentos where agenda_evento_id=$1 and empresa_id=$2 order by created_at,id',[eventId,auth.empresaId]);
  for(const [index,item] of items.rows.entries()) {
    // A scheduled extraction may differ from its plan, but must not reprice that plan.
    if(item.orcamento_item_id && item.extracao) continue;
    if (!item.orcamento_item_id) {
      const legacy = await client.query(`select 1 from odonto.orcamento_itens i where i.empresa_id=$1 and i.orcamento_id=$2
        and i.catalogo_procedimento_id=$3 and not exists(select 1 from odonto.agenda_evento_procedimentos a
        where a.empresa_id=i.empresa_id and a.orcamento_item_id=i.id) limit 1`,[auth.empresaId,quoteId,item.catalogo_procedimento_id]);
      if(legacy.rowCount) throw conflict('Este orcamento possui itens sem vinculo inequivoco com a agenda. Revise os relacionamentos antes de alterar a composicao.');
    }
    const id=item.orcamento_item_id ?? randomUUID();
    await client.query(`insert into odonto.orcamento_itens
      (id,empresa_id,orcamento_id,catalogo_procedimento_id,descricao,quantidade,valor_unitario,valor_total,ordem,duracao_minutos,extracao,forma_cobranca)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(id) do update set
      descricao=excluded.descricao,quantidade=excluded.quantidade,duracao_minutos=excluded.duracao_minutos,
      valor_total=excluded.valor_total,valor_unitario=excluded.valor_unitario`,
      [id,auth.empresaId,quoteId,item.catalogo_procedimento_id,item.descricao,item.quantidade,
        Number(item.valor)/item.quantidade,item.valor,index,Math.max(5,Math.round(item.duracao_minutos/item.quantidade)),item.extracao,item.forma_cobranca]);
    // Do not overwrite the original planned teeth when rescheduling the execution.
    if(!item.orcamento_item_id) {
      await writeTeeth(client,auth,'orcamento_item_id',id,patientId,await readTeeth(client,auth,'agenda_item_id',item.id),{orcamentoId:quoteId,agendamentoId:eventId});
      await client.query('update odonto.agenda_evento_procedimentos set orcamento_item_id=$3 where id=$1 and empresa_id=$2',[item.id,auth.empresaId,id]);
    }
  }
}
