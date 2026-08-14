do $$
begin
  create type odonto.conta_bancaria_tipo as enum ('corrente', 'poupanca', 'pagamento', 'caixa');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.forma_pagamento as enum (
    'pix', 'transferencia', 'boleto', 'dinheiro', 'cartao', 'debito_automatico', 'outro'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.despesa_status as enum ('pendente', 'paga', 'cancelada');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.despesa_recorrencia as enum ('semanal', 'mensal', 'anual');
exception
  when duplicate_object then null;
end $$;

alter table odonto.profissionais
  add column if not exists chave_pix varchar(180);

alter table odonto.catalogo_procedimentos
  add column if not exists custo_variavel numeric(12, 2) not null default 0;

alter table odonto.catalogo_procedimentos
  drop constraint if exists ck_catalogo_procedimentos_custo_variavel;

alter table odonto.catalogo_procedimentos
  add constraint ck_catalogo_procedimentos_custo_variavel check (custo_variavel >= 0);

create table if not exists odonto.bancos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  nome varchar(120) not null,
  codigo_banco varchar(10),
  agencia varchar(20),
  conta varchar(30),
  tipo_conta odonto.conta_bancaria_tipo not null default 'corrente',
  titular varchar(160),
  documento_titular varchar(20),
  chave_pix varchar(180),
  ativo boolean not null default true,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, empresa_id)
);

create unique index if not exists uq_odonto_bancos_nome
  on odonto.bancos (empresa_id, lower(nome));

create table if not exists odonto.despesa_series (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  descricao varchar(180) not null,
  categoria varchar(50) not null,
  fornecedor varchar(160),
  centro_custo varchar(80),
  valor numeric(12, 2) not null,
  recorrencia odonto.despesa_recorrencia not null,
  inicio_em date not null,
  fim_em date,
  ativa boolean not null default true,
  observacoes text,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valor >= 0),
  check (fim_em is null or fim_em >= inicio_em),
  unique (id, empresa_id)
);

create table if not exists odonto.despesas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  serie_id uuid references odonto.despesa_series(id) on delete set null,
  banco_id uuid references odonto.bancos(id) on delete set null,
  descricao varchar(180) not null,
  categoria varchar(50) not null,
  fornecedor varchar(160),
  centro_custo varchar(80),
  documento varchar(80),
  competencia date not null,
  vencimento date not null,
  valor numeric(12, 2) not null,
  status odonto.despesa_status not null default 'pendente',
  forma_pagamento odonto.forma_pagamento,
  referencia_pagamento varchar(180),
  observacoes text,
  paga_em date,
  paga_por uuid references odonto.usuarios(id) on delete set null,
  numero_ocorrencia integer,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valor >= 0),
  check ((status = 'paga' and paga_em is not null) or status <> 'paga'),
  unique (id, empresa_id)
);

create unique index if not exists uq_odonto_despesas_serie_ocorrencia
  on odonto.despesas (serie_id, numero_ocorrencia)
  where serie_id is not null;

create index if not exists ix_odonto_despesas_periodo
  on odonto.despesas (empresa_id, vencimento, status, categoria);

create table if not exists odonto.custo_operacional_config (
  empresa_id uuid primary key references odonto.empresas(id) on delete cascade,
  quantidade_cadeiras integer not null default 1,
  horas_produtivas_cadeira_mes numeric(8, 2) not null default 160,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantidade_cadeiras between 1 and 100),
  check (horas_produtivas_cadeira_mes > 0 and horas_produtivas_cadeira_mes <= 744)
);

alter table odonto.financeiro_lancamentos
  add column if not exists banco_id uuid references odonto.bancos(id) on delete set null;

alter table odonto.financeiro_lancamentos
  add column if not exists forma_pagamento odonto.forma_pagamento;

alter table odonto.financeiro_lancamentos
  add column if not exists referencia_pagamento varchar(180);

alter table odonto.financeiro_lancamentos
  add column if not exists observacoes_pagamento text;

create table if not exists odonto.comercial_contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid not null references odonto.pacientes(id) on delete cascade,
  catalogo_procedimento_id uuid references odonto.catalogo_procedimentos(id) on delete set null,
  mensagem text not null,
  canais varchar(30)[] not null default array[]::varchar[],
  aplicativo_status odonto.notificacao_envio_status,
  whatsapp_status odonto.notificacao_envio_status,
  created_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ix_odonto_comercial_contatos_paciente
  on odonto.comercial_contatos (empresa_id, paciente_id, created_at desc);

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array['bancos', 'despesa_series', 'despesas', 'custo_operacional_config']
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
