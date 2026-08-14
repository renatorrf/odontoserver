alter table odonto.paciente_financeiro_pagamentos
  add column if not exists idempotency_key uuid,
  add column if not exists desconto numeric(12, 2) not null default 0,
  add column if not exists acrescimo numeric(12, 2) not null default 0,
  add column if not exists estornado_por uuid references odonto.usuarios(id) on delete set null,
  add column if not exists justificativa_estorno text,
  add column if not exists referencia_estorno varchar(120),
  add column if not exists tipo_estorno varchar(30),
  add column if not exists status_estorno_provedor varchar(30),
  add constraint ck_paciente_pagamento_ajustes check (desconto >= 0 and acrescimo >= 0);

create unique index if not exists uq_odonto_pagamento_idempotencia
  on odonto.paciente_financeiro_pagamentos (empresa_id, idempotency_key)
  where idempotency_key is not null;

alter table odonto.orcamento_itens
  add column if not exists cortesia boolean not null default false,
  add column if not exists cortesia_justificativa text,
  add column if not exists cortesia_autorizada_por uuid references odonto.usuarios(id) on delete set null,
  add column if not exists desconto_valor numeric(12, 2) not null default 0,
  add column if not exists desconto_justificativa text,
  add constraint ck_orcamento_item_desconto check (desconto_valor >= 0 and desconto_valor <= valor_total);

alter table odonto.orcamentos
  add column if not exists desconto_tipo varchar(20) not null default 'valor',
  add column if not exists desconto_percentual numeric(5, 2),
  add column if not exists desconto_justificativa text,
  add constraint ck_orcamento_desconto_percentual check (desconto_percentual is null or desconto_percentual between 0 and 100);

insert into odonto.paciente_financeiro_lancamentos (
  empresa_id, paciente_id, orcamento_id, descricao, vencimento, valor, created_by, updated_by
)
select o.empresa_id, o.paciente_id, o.id, 'Orcamento #' || upper(substr(o.id::text, 1, 8)),
       coalesce(o.validade, o.created_at::date),
       greatest(coalesce(sum(oi.valor_total), 0) - o.desconto_valor, 0), o.created_by, o.updated_by
  from odonto.orcamentos o
  left join odonto.orcamento_itens oi on oi.orcamento_id = o.id
 where o.paciente_id is not null and o.status not in ('cancelado', 'expirado', 'nao_aprovado', 'recusado')
   and not exists (select 1 from odonto.paciente_financeiro_lancamentos fl
     where fl.empresa_id = o.empresa_id and fl.orcamento_id = o.id and fl.status <> 'cancelado')
 group by o.id
having greatest(coalesce(sum(oi.valor_total), 0) - o.desconto_valor, 0) > 0;
