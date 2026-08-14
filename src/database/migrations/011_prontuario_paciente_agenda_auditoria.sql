-- migrate:no-transaction
alter type odonto.agenda_evento_status add value if not exists 'em_espera';
-- migrate:statement
alter type odonto.agenda_evento_status add value if not exists 'atendido';
-- migrate:statement
alter type odonto.agenda_evento_status add value if not exists 'atrasado';
-- migrate:statement
alter type odonto.orcamento_status add value if not exists 'aguardando_aprovacao';
-- migrate:statement
alter type odonto.orcamento_status add value if not exists 'em_execucao';
-- migrate:statement
alter type odonto.orcamento_status add value if not exists 'concluido';
-- migrate:statement
alter type odonto.orcamento_status add value if not exists 'recusado';
-- migrate:statement

do $$
begin
  create type odonto.procedimento_planejamento_status as enum (
    'planejado', 'autorizado', 'em_execucao', 'concluido', 'suspenso', 'cancelado'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.paciente_financeiro_status as enum (
    'pendente', 'pago', 'parcialmente_pago', 'vencido', 'cancelado', 'estornado'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.paciente_forma_pagamento as enum (
    'dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'boleto',
    'transferencia', 'convenio', 'outra'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.documento_paciente_categoria as enum (
    'laudo', 'radiografia', 'foto_inicial', 'foto_acompanhamento', 'foto_final',
    'receita', 'termo', 'documento', 'outro'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.anamnese_resposta as enum ('sim', 'nao', 'nao_informado');
exception
  when duplicate_object then null;
end $$;

alter table odonto.orcamentos
  add column if not exists profissional_id uuid references odonto.profissionais(id) on delete set null;

alter table odonto.orcamento_itens
  add column if not exists status odonto.procedimento_planejamento_status not null default 'planejado';

alter table odonto.agenda_evento_procedimentos
  add column if not exists status odonto.procedimento_planejamento_status not null default 'planejado';

alter table odonto.agenda_eventos
  add column if not exists confirmado_em timestamptz,
  add column if not exists inicio_atendimento_em timestamptz,
  add column if not exists fim_atendimento_em timestamptz,
  add column if not exists justificativa_status text;

create table if not exists odonto.agenda_evento_status_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  agenda_evento_id uuid not null references odonto.agenda_eventos(id) on delete cascade,
  status_anterior varchar(40),
  status_novo varchar(40) not null,
  justificativa text,
  created_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ix_odonto_agenda_status_historico
  on odonto.agenda_evento_status_historico (empresa_id, agenda_evento_id, created_at desc);

create index if not exists ix_odonto_agenda_eventos_status
  on odonto.agenda_eventos (empresa_id, status, inicio_em desc);

create table if not exists odonto.paciente_financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid not null references odonto.pacientes(id) on delete restrict,
  orcamento_id uuid references odonto.orcamentos(id) on delete set null,
  descricao varchar(180) not null,
  vencimento date not null,
  valor numeric(12, 2) not null,
  numero_parcela integer not null default 1,
  total_parcelas integer not null default 1,
  status odonto.paciente_financeiro_status not null default 'pendente',
  cancelado_em timestamptz,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valor >= 0),
  check (numero_parcela >= 1 and total_parcelas >= numero_parcela),
  unique (id, empresa_id)
);

create table if not exists odonto.paciente_financeiro_pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  lancamento_id uuid not null references odonto.paciente_financeiro_lancamentos(id) on delete restrict,
  valor numeric(12, 2) not null,
  forma_pagamento odonto.paciente_forma_pagamento not null,
  parcelas_cartao integer,
  pago_em timestamptz not null default now(),
  referencia varchar(120),
  estornado_em timestamptz,
  created_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  check (valor > 0),
  check (parcelas_cartao is null or parcelas_cartao between 1 and 48),
  check (forma_pagamento = 'cartao_credito' or parcelas_cartao is null)
);

create index if not exists ix_odonto_paciente_financeiro
  on odonto.paciente_financeiro_lancamentos (empresa_id, paciente_id, vencimento desc, status);

create index if not exists ix_odonto_orcamento_financeiro
  on odonto.paciente_financeiro_lancamentos (empresa_id, orcamento_id, vencimento)
  where orcamento_id is not null;

create index if not exists ix_odonto_paciente_pagamentos
  on odonto.paciente_financeiro_pagamentos (empresa_id, lancamento_id, pago_em desc);

create table if not exists odonto.paciente_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid not null references odonto.pacientes(id) on delete restrict,
  orcamento_id uuid references odonto.orcamentos(id) on delete set null,
  procedimento_realizado_id uuid references odonto.procedimentos_realizados(id) on delete set null,
  categoria odonto.documento_paciente_categoria not null default 'documento',
  descricao varchar(240),
  data_documento date,
  nome_original varchar(255) not null,
  mime_type varchar(100) not null,
  tamanho_bytes bigint not null,
  storage_key varchar(500) not null,
  created_by uuid references odonto.usuarios(id) on delete set null,
  deleted_by uuid references odonto.usuarios(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tamanho_bytes > 0),
  unique (id, empresa_id),
  unique (storage_key)
);

create index if not exists ix_odonto_documentos_paciente
  on odonto.paciente_documentos (empresa_id, paciente_id, created_at desc)
  where deleted_at is null;

create table if not exists odonto.paciente_anamneses (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid not null references odonto.pacientes(id) on delete restrict,
  versao integer not null,
  observacoes text,
  aceite_paciente boolean not null default false,
  assinatura_nome varchar(180),
  preenchida_por uuid references odonto.usuarios(id) on delete set null,
  preenchida_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (empresa_id, paciente_id, versao),
  unique (id, empresa_id)
);

create table if not exists odonto.paciente_anamnese_respostas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  anamnese_id uuid not null references odonto.paciente_anamneses(id) on delete cascade,
  pergunta_codigo varchar(80) not null,
  resposta odonto.anamnese_resposta not null default 'nao_informado',
  detalhes text,
  created_at timestamptz not null default now(),
  unique (anamnese_id, pergunta_codigo)
);

create index if not exists ix_odonto_anamneses_paciente
  on odonto.paciente_anamneses (empresa_id, paciente_id, versao desc);

create index if not exists ix_odonto_anamnese_respostas
  on odonto.paciente_anamnese_respostas (empresa_id, anamnese_id, pergunta_codigo);

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array['paciente_financeiro_lancamentos', 'paciente_documentos']
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
