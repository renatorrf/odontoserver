do $$
declare
  appointment record;
  quote_id uuid;
begin
  for appointment in
    select ae.id, ae.empresa_id, ae.paciente_id, ae.profissional_id,
           pac.nome as paciente_nome, pct.celular,
           ae.observacoes_procedimentos, ae.created_by, ae.updated_by
      from odonto.agenda_eventos ae
      inner join odonto.pacientes pac
        on pac.id = ae.paciente_id and pac.empresa_id = ae.empresa_id
      inner join odonto.paciente_contatos pct on pct.paciente_id = pac.id
     where ae.tipo = 'consulta'
       and ae.orcamento_id is null
       and length(regexp_replace(coalesce(pct.celular, ''), '[^0-9]', '', 'g')) between 8 and 15
       and exists (
         select 1
           from odonto.agenda_evento_procedimentos aep
          where aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
       )
  loop
    insert into odonto.orcamentos (
      empresa_id, paciente_id, profissional_id, nome_contato, whatsapp,
      origem, status, desconto_valor, observacoes, aprovado_em, created_by, updated_by
    ) values (
      appointment.empresa_id, appointment.paciente_id, appointment.profissional_id,
      appointment.paciente_nome, appointment.celular, 'consulta', 'aprovado', 0,
      appointment.observacoes_procedimentos, now(), appointment.created_by,
      coalesce(appointment.updated_by, appointment.created_by)
    ) returning id into quote_id;

    insert into odonto.orcamento_itens (
      orcamento_id, catalogo_procedimento_id, descricao, quantidade,
      valor_unitario, valor_total, ordem, duracao_minutos, status
    )
    select quote_id, aep.catalogo_procedimento_id, aep.descricao, aep.quantidade,
           round(aep.valor / aep.quantidade, 2), aep.valor,
           row_number() over (order by aep.created_at, aep.id) - 1,
           greatest(5, round(aep.duracao_minutos::numeric / aep.quantidade)::integer),
           aep.status
      from odonto.agenda_evento_procedimentos aep
     where aep.agenda_evento_id = appointment.id
       and aep.empresa_id = appointment.empresa_id
     order by aep.created_at, aep.id;

    update odonto.agenda_eventos
       set orcamento_id = quote_id
     where id = appointment.id and empresa_id = appointment.empresa_id;
  end loop;
end $$;
