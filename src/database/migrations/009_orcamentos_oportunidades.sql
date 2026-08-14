do $$
begin
  create type odonto.orcamento_status as enum (
    'rascunho',
    'enviado',
    'aprovado',
    'nao_aprovado',
    'expirado',
    'cancelado'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.orcamento_origem as enum ('rapido', 'pasta_vermelha', 'consulta');
exception
  when duplicate_object then null;
end $$;

create table if not exists odonto.orcamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid references odonto.pacientes(id) on delete set null,
  nome_contato varchar(180) not null,
  whatsapp varchar(30) not null,
  origem odonto.orcamento_origem not null default 'rapido',
  status odonto.orcamento_status not null default 'rascunho',
  validade date,
  desconto_valor numeric(12, 2) not null default 0,
  observacoes text,
  motivo_nao_aprovacao text,
  enviado_em timestamptz,
  aprovado_em timestamptz,
  nao_aprovado_em timestamptz,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (desconto_valor >= 0),
  check (length(regexp_replace(whatsapp, '[^0-9]', '', 'g')) between 8 and 15),
  unique (id, empresa_id)
);

create table if not exists odonto.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references odonto.orcamentos(id) on delete cascade,
  catalogo_procedimento_id uuid references odonto.catalogo_procedimentos(id) on delete set null,
  descricao varchar(180) not null,
  quantidade integer not null default 1,
  valor_unitario numeric(12, 2) not null,
  valor_total numeric(12, 2) not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantidade > 0),
  check (valor_unitario >= 0),
  check (valor_total >= 0)
);

create index if not exists ix_odonto_orcamentos_status
  on odonto.orcamentos (empresa_id, status, updated_at desc);

create index if not exists ix_odonto_orcamentos_paciente
  on odonto.orcamentos (empresa_id, paciente_id, updated_at desc)
  where paciente_id is not null;

create index if not exists ix_odonto_orcamentos_whatsapp
  on odonto.orcamentos (empresa_id, regexp_replace(whatsapp, '[^0-9]', '', 'g'), updated_at desc);

create index if not exists ix_odonto_orcamento_itens_orcamento
  on odonto.orcamento_itens (orcamento_id, ordem, created_at);

alter table odonto.notificacoes
  alter column paciente_id drop not null;

alter table odonto.notificacoes
  add column if not exists orcamento_id uuid references odonto.orcamentos(id) on delete set null;

create index if not exists ix_odonto_notificacoes_orcamento
  on odonto.notificacoes (empresa_id, orcamento_id, created_at desc)
  where orcamento_id is not null;

alter table odonto.comercial_contatos
  alter column paciente_id drop not null;

alter table odonto.comercial_contatos
  add column if not exists orcamento_id uuid references odonto.orcamentos(id) on delete set null;

create index if not exists ix_odonto_comercial_contatos_orcamento
  on odonto.comercial_contatos (empresa_id, orcamento_id, created_at desc)
  where orcamento_id is not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_comercial_contatos_destino'
       and conrelid = 'odonto.comercial_contatos'::regclass
  ) then
    alter table odonto.comercial_contatos
      add constraint ck_comercial_contatos_destino
      check (paciente_id is not null or orcamento_id is not null);
  end if;
end $$;

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array['orcamentos', 'orcamento_itens']
  loop
    trigger_name := 'tg_' || target_table || '_updated_at';
    if not exists (
      select 1 from pg_trigger
       where tgname = trigger_name
         and tgrelid = ('odonto.' || target_table)::regclass
    ) then
      execute format(
        'create trigger %I before update on odonto.%I for each row execute procedure odonto.set_updated_at()',
        trigger_name,
        target_table
      );
    end if;
  end loop;
end $$;
