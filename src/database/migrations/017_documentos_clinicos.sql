create table if not exists odonto.medicamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  nome varchar(160) not null,
  apresentacao varchar(120),
  concentracao varchar(80),
  posologia_padrao text,
  ativo boolean not null default true,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome, concentracao)
);

create table if not exists odonto.documentos_clinicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid not null references odonto.pacientes(id) on delete restrict,
  agendamento_id uuid references odonto.agenda_eventos(id) on delete set null,
  procedimento_realizado_id uuid references odonto.procedimentos_realizados(id) on delete set null,
  profissional_id uuid references odonto.profissionais(id) on delete set null,
  tipo varchar(40) not null check (tipo in ('atestado','prescricao','orientacao_pos_operatoria','outro')),
  status varchar(20) not null default 'emitido' check (status in ('rascunho','emitido','cancelado')),
  conteudo jsonb not null default '{}'::jsonb,
  versao integer not null default 1 check (versao > 0),
  emitido_em timestamptz not null default now(),
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_odonto_documentos_clinicos_paciente
  on odonto.documentos_clinicos (empresa_id, paciente_id, emitido_em desc);
create index if not exists ix_odonto_documentos_clinicos_agendamento
  on odonto.documentos_clinicos (empresa_id, agendamento_id) where agendamento_id is not null;

drop trigger if exists tg_medicamentos_updated_at on odonto.medicamentos;
create trigger tg_medicamentos_updated_at before update on odonto.medicamentos
for each row execute procedure odonto.set_updated_at();
drop trigger if exists tg_documentos_clinicos_updated_at on odonto.documentos_clinicos;
create trigger tg_documentos_clinicos_updated_at before update on odonto.documentos_clinicos
for each row execute procedure odonto.set_updated_at();
