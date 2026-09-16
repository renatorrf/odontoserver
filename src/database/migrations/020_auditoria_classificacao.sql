create function odonto.audit_classificacao_procedimento() returns trigger language plpgsql as $$
begin
  if (old.extracao,old.forma_cobranca,old.tipo_evento_ortodontico) is distinct from
     (new.extracao,new.forma_cobranca,new.tipo_evento_ortodontico) then
    insert into odonto.audit_logs(empresa_id,usuario_id,entidade,entidade_id,acao,payload)
    values(new.empresa_id,new.updated_by,'catalogo_procedimentos',new.id,'classificacao_clinica_alterada',
      jsonb_build_object('antes',jsonb_build_object('extracao',old.extracao,'formaCobranca',old.forma_cobranca,'eventoOrtodontico',old.tipo_evento_ortodontico),
        'depois',jsonb_build_object('extracao',new.extracao,'formaCobranca',new.forma_cobranca,'eventoOrtodontico',new.tipo_evento_ortodontico)));
  end if;
  return new;
end $$;
create trigger tg_audit_classificacao after update on odonto.catalogo_procedimentos
  for each row execute procedure odonto.audit_classificacao_procedimento();
