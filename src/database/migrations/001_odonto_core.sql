create schema if not exists odonto;

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  create type odonto.usuario_perfil as enum (
    'portal_admin',
    'gestor',
    'dentista',
    'atendente',
    'paciente'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.sexo_tipo as enum (
    'masculino',
    'feminino',
    'outro',
    'nao_informado'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.paciente_status as enum (
    'ativo',
    'inativo',
    'arquivado'
  );
exception
  when duplicate_object then null;
end $$;

create or replace function odonto.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists odonto.empresas (
  id uuid primary key default gen_random_uuid(),
  nome_fantasia varchar(160) not null,
  razao_social varchar(180),
  cnpj varchar(18),
  cnpj_normalizado varchar(14),
  email citext,
  telefone varchar(30),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_odonto_empresas_cnpj
  on odonto.empresas (cnpj_normalizado)
  where cnpj_normalizado is not null;

create table if not exists odonto.unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  nome varchar(160) not null,
  cnpj varchar(18),
  cnpj_normalizado varchar(14),
  email citext,
  telefone varchar(30),
  cep varchar(9),
  logradouro varchar(180),
  numero varchar(20),
  bairro varchar(100),
  cidade varchar(100),
  estado char(2),
  complemento varchar(120),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_odonto_unidades_empresa_cnpj
  on odonto.unidades (empresa_id, cnpj_normalizado)
  where cnpj_normalizado is not null;

create table if not exists odonto.usuarios (
  id uuid primary key default gen_random_uuid(),
  nome varchar(160) not null,
  login citext not null,
  email citext,
  cpf varchar(14),
  cpf_normalizado varchar(11),
  telefone varchar(30),
  senha_hash varchar(120) not null,
  ativo boolean not null default true,
  ultimo_acesso_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_odonto_usuarios_login
  on odonto.usuarios (lower(login::text));

create unique index if not exists uq_odonto_usuarios_email
  on odonto.usuarios (lower(email::text))
  where email is not null;

create unique index if not exists uq_odonto_usuarios_cpf
  on odonto.usuarios (cpf_normalizado)
  where cpf_normalizado is not null;

create table if not exists odonto.usuario_empresas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references odonto.usuarios(id) on delete cascade,
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  perfil odonto.usuario_perfil not null,
  master boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (usuario_id, empresa_id)
);

create index if not exists ix_odonto_usuario_empresas_empresa
  on odonto.usuario_empresas (empresa_id, perfil, ativo);

create table if not exists odonto.login_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references odonto.usuarios(id) on delete cascade,
  empresa_id uuid not null references odonto.empresas(id) on delete cascade,
  usuario_empresa_id uuid not null references odonto.usuario_empresas(id) on delete cascade,
  jwt_id uuid not null,
  ip_address inet,
  user_agent text,
  ativo boolean not null default true,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists ix_odonto_login_sessions_usuario
  on odonto.login_sessions (usuario_id, ativo, expires_at);

create table if not exists odonto.pacientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  unidade_origem_id uuid references odonto.unidades(id) on delete set null,
  usuario_id uuid references odonto.usuarios(id) on delete set null,
  numero_prontuario varchar(40),
  nome varchar(180) not null,
  apelido varchar(100),
  nascimento date,
  sexo odonto.sexo_tipo not null default 'nao_informado',
  cpf varchar(14),
  cpf_normalizado varchar(11),
  rg varchar(30),
  estado_civil varchar(40),
  escolaridade varchar(80),
  como_conheceu varchar(100),
  observacoes text,
  status odonto.paciente_status not null default 'ativo',
  cadastrado_em timestamptz not null default now(),
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_odonto_pacientes_empresa_cpf
  on odonto.pacientes (empresa_id, cpf_normalizado)
  where cpf_normalizado is not null;

create unique index if not exists uq_odonto_pacientes_empresa_prontuario
  on odonto.pacientes (empresa_id, numero_prontuario)
  where numero_prontuario is not null;

create index if not exists ix_odonto_pacientes_empresa_nome
  on odonto.pacientes (empresa_id, lower(nome));

create table if not exists odonto.paciente_contatos (
  paciente_id uuid primary key references odonto.pacientes(id) on delete cascade,
  fone_fixo varchar(30),
  celular_pais varchar(4) not null default 'BR',
  celular varchar(30),
  usar_celular_contato boolean not null default false,
  celular_contato_de varchar(100),
  outros_telefones text,
  email citext,
  nao_possui_email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists odonto.paciente_enderecos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references odonto.pacientes(id) on delete cascade,
  tipo varchar(30) not null default 'principal',
  principal boolean not null default true,
  cep varchar(9),
  cidade varchar(100),
  estado char(2),
  logradouro varchar(180),
  numero varchar(20),
  bairro varchar(100),
  complemento varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_odonto_paciente_enderecos_principal
  on odonto.paciente_enderecos (paciente_id)
  where principal = true;

create table if not exists odonto.paciente_dados_complementares (
  paciente_id uuid primary key references odonto.pacientes(id) on delete cascade,
  profissao varchar(120),
  local_trabalho varchar(160),
  tempo_trabalho varchar(80),
  nome_plano varchar(120),
  numero_plano varchar(80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists odonto.paciente_filiacao (
  paciente_id uuid primary key references odonto.pacientes(id) on delete cascade,
  nome_pai varchar(180),
  cpf_pai varchar(14),
  cpf_pai_normalizado varchar(11),
  rg_pai varchar(30),
  profissao_pai varchar(120),
  nome_mae varchar(180),
  cpf_mae varchar(14),
  cpf_mae_normalizado varchar(11),
  rg_mae varchar(30),
  profissao_mae varchar(120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists odonto.paciente_representantes_legais (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references odonto.pacientes(id) on delete cascade,
  nome varchar(180) not null,
  cpf varchar(14),
  cpf_normalizado varchar(11),
  rg varchar(30),
  nascimento date,
  telefone varchar(30),
  principal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_odonto_representante_principal
  on odonto.paciente_representantes_legais (paciente_id)
  where principal = true;

create table if not exists odonto.audit_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references odonto.empresas(id) on delete set null,
  usuario_id uuid references odonto.usuarios(id) on delete set null,
  entidade varchar(80) not null,
  entidade_id uuid,
  acao varchar(40) not null,
  payload jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists ix_odonto_audit_logs_empresa
  on odonto.audit_logs (empresa_id, created_at desc);

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'empresas',
    'unidades',
    'usuarios',
    'usuario_empresas',
    'pacientes',
    'paciente_contatos',
    'paciente_enderecos',
    'paciente_dados_complementares',
    'paciente_filiacao',
    'paciente_representantes_legais'
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
