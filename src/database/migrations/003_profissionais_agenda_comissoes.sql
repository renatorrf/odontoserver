do $$
begin
  create type odonto.profissional_status as enum ('ativo', 'inativo');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.agenda_visualizacao as enum ('propria', 'clinica');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.comissao_tipo as enum ('porcentagem', 'valor_fixo');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.comissao_momento as enum (
    'recebimento_pagamento',
    'execucao_procedimento',
    'checkout_paciente',
    'aprovacao_orcamento'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists odonto.profissionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  unidade_id uuid references odonto.unidades(id) on delete set null,
  usuario_id uuid references odonto.usuarios(id) on delete set null,
  nome varchar(180) not null,
  nascimento date,
  sexo odonto.sexo_tipo not null default 'nao_informado',
  estado_civil varchar(40),
  cpf varchar(14),
  cpf_normalizado varchar(11),
  rg varchar(30),
  conselho_tipo varchar(20) not null default 'CRO',
  conselho_uf char(2),
  conselho_numero varchar(30),
  cor_agenda varchar(7) not null default '#126B62',
  email citext,
  celular varchar(30),
  fone_fixo varchar(30),
  cep varchar(9),
  cidade varchar(100),
  estado char(2),
  logradouro varchar(180),
  numero varchar(20),
  bairro varchar(100),
  complemento varchar(120),
  observacoes text,
  status odonto.profissional_status not null default 'ativo',
  agenda_habilitada boolean not null default true,
  visualizacao_agenda odonto.agenda_visualizacao not null default 'propria',
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, empresa_id)
);

create unique index if not exists uq_odonto_profissionais_empresa_cpf
  on odonto.profissionais (empresa_id, cpf_normalizado)
  where cpf_normalizado is not null;

create unique index if not exists uq_odonto_profissionais_empresa_conselho
  on odonto.profissionais (empresa_id, conselho_tipo, conselho_uf, conselho_numero)
  where conselho_uf is not null and conselho_numero is not null;

create index if not exists ix_odonto_profissionais_empresa_nome
  on odonto.profissionais (empresa_id, lower(nome));

create table if not exists odonto.especialidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  nome varchar(100) not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_odonto_especialidades_empresa_nome
  on odonto.especialidades (empresa_id, lower(nome));

create table if not exists odonto.profissional_especialidades (
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  profissional_id uuid not null references odonto.profissionais(id) on delete cascade,
  especialidade_id uuid not null references odonto.especialidades(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (profissional_id, especialidade_id)
);

create index if not exists ix_odonto_profissional_especialidades_empresa
  on odonto.profissional_especialidades (empresa_id, profissional_id);

create table if not exists odonto.profissional_disponibilidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  profissional_id uuid not null references odonto.profissionais(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  intervalo_minutos smallint not null default 30 check (intervalo_minutos between 5 and 240),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hora_inicio < hora_fim),
  unique (profissional_id, dia_semana, hora_inicio, hora_fim)
);

create index if not exists ix_odonto_profissional_disponibilidades_empresa
  on odonto.profissional_disponibilidades (empresa_id, profissional_id, dia_semana);

create table if not exists odonto.profissional_comissoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  profissional_id uuid not null references odonto.profissionais(id) on delete cascade,
  valido_desde date not null,
  valido_ate date,
  duracao_indeterminada boolean not null default true,
  requer_aprovacao boolean not null default false,
  tipo odonto.comissao_tipo not null default 'porcentagem',
  momento odonto.comissao_momento not null default 'recebimento_pagamento',
  percentual_geral numeric(7, 4),
  percentual_plano numeric(7, 4),
  valor_fixo numeric(12, 2),
  descontar_impostos boolean not null default false,
  descontar_taxas_pagamento boolean not null default false,
  gerar_plano_proprio_execucao boolean not null default false,
  ativo boolean not null default true,
  created_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valido_ate is null or valido_ate >= valido_desde),
  check (percentual_geral is null or percentual_geral between 0 and 100),
  check (percentual_plano is null or percentual_plano between 0 and 100),
  check (valor_fixo is null or valor_fixo >= 0)
);

create index if not exists ix_odonto_profissional_comissoes_vigencia
  on odonto.profissional_comissoes (empresa_id, profissional_id, ativo, valido_desde desc);

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'profissionais',
    'especialidades',
    'profissional_disponibilidades',
    'profissional_comissoes'
  ]
  loop
    trigger_name := 'tg_' || target_table || '_updated_at';

    if not exists (
      select 1
      from pg_trigger
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
