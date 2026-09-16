export const installationCountSql = `select count(*)::text as quantidade from (
      select e.paciente_id, e.id::text as atendimento
      from odonto.agenda_eventos e
      where e.empresa_id=$1 and e.status::text in ('atendido','concluido')
        and (e.fim_atendimento_em at time zone 'America/Sao_Paulo')::date between $2::date and $3::date
        and exists (select 1 from odonto.agenda_evento_procedimentos i
          join odonto.catalogo_procedimentos c on c.id=i.catalogo_procedimento_id and c.empresa_id=i.empresa_id
          where i.empresa_id=e.empresa_id and i.agenda_evento_id=e.id and i.status not in ('cancelado','suspenso')
            and c.tipo_evento_ortodontico='INSTALACAO')
      union
      select r.paciente_id, coalesce(a.agenda_evento_id::text, r.id::text)
      from odonto.procedimentos_realizados r
      join odonto.catalogo_procedimentos c on c.id=r.catalogo_procedimento_id and c.empresa_id=r.empresa_id
      left join odonto.agenda_evento_procedimentos a on a.id=r.agenda_item_id and a.empresa_id=r.empresa_id
      where r.empresa_id=$1 and r.data_procedimento between $2::date and $3::date
        and coalesce(r.tipo_evento_ortodontico,c.tipo_evento_ortodontico)='INSTALACAO'
        and (a.id is null or not exists(select 1 from odonto.agenda_eventos e where e.id=a.agenda_evento_id
          and e.empresa_id=r.empresa_id and e.status::text in ('cancelado','faltou')))
    ) installed`;

export const installationSalesSql = `select coalesce(sum(installed.valor),0)::text as valor from (
      select r.id::text as instalacao,
             coalesce(r.valor,c.valor,0) as valor
      from odonto.procedimentos_realizados r
      join odonto.catalogo_procedimentos c on c.id=r.catalogo_procedimento_id and c.empresa_id=r.empresa_id
      left join odonto.agenda_evento_procedimentos a on a.id=r.agenda_item_id and a.empresa_id=r.empresa_id
      where r.empresa_id=$1 and r.data_procedimento between $2::date and $3::date
        and coalesce(r.tipo_evento_ortodontico,c.tipo_evento_ortodontico)='INSTALACAO'
        and (a.id is null or not exists(select 1 from odonto.agenda_eventos e where e.id=a.agenda_evento_id
          and e.empresa_id=r.empresa_id and e.status::text in ('cancelado','faltou')))
      union all
      select i.id::text,
             coalesce(i.valor,c.valor,0) * i.quantidade
      from odonto.agenda_eventos e
      join odonto.agenda_evento_procedimentos i on i.agenda_evento_id=e.id and i.empresa_id=e.empresa_id
      join odonto.catalogo_procedimentos c on c.id=i.catalogo_procedimento_id and c.empresa_id=i.empresa_id
      where e.empresa_id=$1 and e.status::text in ('atendido','concluido')
        and (e.fim_atendimento_em at time zone 'America/Sao_Paulo')::date between $2::date and $3::date
        and i.status::text not in ('cancelado','suspenso') and c.tipo_evento_ortodontico='INSTALACAO'
        and not exists(select 1 from odonto.procedimentos_realizados r
          where r.empresa_id=e.empresa_id and r.agenda_item_id=i.id)
    ) installed`;
