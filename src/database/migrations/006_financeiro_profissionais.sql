alter table odonto.procedimentos_realizados
  add column if not exists profissional_id uuid references odonto.profissionais(id) on delete restrict;

alter table odonto.procedimentos_realizados
  add column if not exists catalogo_procedimento_id uuid references odonto.catalogo_procedimentos(id) on delete set null;

update odonto.procedimentos_realizados pr
   set profissional_id = (
     select p.id
       from odonto.profissionais p
      where p.empresa_id = pr.empresa_id
        and lower(p.nome) = lower(pr.profissional_nome)
      order by p.created_at
      limit 1
   )
 where pr.profissional_id is null
   and pr.profissional_nome is not null
   and 1 = (
     select count(*)
       from odonto.profissionais p
      where p.empresa_id = pr.empresa_id
        and lower(p.nome) = lower(pr.profissional_nome)
   );

create index if not exists ix_odonto_procedimentos_profissional_periodo
  on odonto.procedimentos_realizados (empresa_id, profissional_id, data_procedimento desc);

do $$
begin
  create type odonto.pagamento_profissional_status as enum ('pendente', 'pago');
exception
  when duplicate_object then null;
end $$;

create table if not exists odonto.financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  procedimento_realizado_id uuid not null references odonto.procedimentos_realizados(id) on delete restrict,
  profissional_id uuid not null references odonto.profissionais(id) on delete restrict,
  comissao_configuracao_id uuid references odonto.profissional_comissoes(id) on delete set null,
  valor_procedimento numeric(12, 2) not null,
  comissao_tipo odonto.comissao_tipo,
  percentual_comissao numeric(7, 4),
  valor_fixo_comissao numeric(12, 2),
  valor_comissao numeric(12, 2) not null default 0,
  status_pagamento odonto.pagamento_profissional_status not null default 'pendente',
  faturado_em timestamptz not null default now(),
  faturado_por uuid references odonto.usuarios(id) on delete set null,
  pago_em timestamptz,
  pago_por uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valor_procedimento >= 0),
  check (valor_comissao >= 0),
  check (percentual_comissao is null or percentual_comissao between 0 and 100),
  unique (procedimento_realizado_id)
);

create index if not exists ix_odonto_financeiro_apuracao
  on odonto.financeiro_lancamentos (empresa_id, profissional_id, status_pagamento, faturado_em desc);

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'tg_financeiro_lancamentos_updated_at'
       and tgrelid = 'odonto.financeiro_lancamentos'::regclass
  ) then
    create trigger tg_financeiro_lancamentos_updated_at
    before update on odonto.financeiro_lancamentos
    for each row execute procedure odonto.set_updated_at();
  end if;
end $$;
