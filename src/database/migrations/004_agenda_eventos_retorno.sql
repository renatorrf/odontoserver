create extension if not exists btree_gist;

do $$
begin
  create type odonto.agenda_evento_tipo as enum ('consulta', 'compromisso');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.agenda_evento_status as enum (
    'agendado',
    'confirmado',
    'em_atendimento',
    'concluido',
    'cancelado',
    'faltou'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.alerta_retorno_status as enum ('pendente', 'agendado', 'concluido', 'cancelado');
exception
  when duplicate_object then null;
end $$;

create table if not exists odonto.agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  unidade_id uuid references odonto.unidades(id) on delete set null,
  profissional_id uuid references odonto.profissionais(id) on delete restrict,
  paciente_id uuid references odonto.pacientes(id) on delete restrict,
  serie_id uuid,
  tipo odonto.agenda_evento_tipo not null,
  titulo varchar(180) not null,
  categoria varchar(80),
  observacoes text,
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  dia_inteiro boolean not null default false,
  primeira_consulta boolean not null default false,
  status odonto.agenda_evento_status not null default 'agendado',
  confirmacao_envio varchar(30),
  lembrete_envio varchar(30),
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (inicio_em < fim_em),
  check (tipo <> 'consulta' or (profissional_id is not null and paciente_id is not null)),
  unique (id, empresa_id)
);

alter table odonto.agenda_eventos
  drop constraint if exists ex_odonto_agenda_profissional_horario;

alter table odonto.agenda_eventos
  add constraint ex_odonto_agenda_profissional_horario
  exclude using gist (
    (empresa_id::text) with =,
    (profissional_id::text) with =,
    tstzrange(inicio_em, fim_em, '[)') with &&
  )
  where (profissional_id is not null and status <> 'cancelado');

create index if not exists ix_odonto_agenda_eventos_periodo
  on odonto.agenda_eventos (empresa_id, inicio_em, fim_em);

create index if not exists ix_odonto_agenda_eventos_profissional
  on odonto.agenda_eventos (empresa_id, profissional_id, inicio_em)
  where status <> 'cancelado';

create index if not exists ix_odonto_agenda_eventos_paciente
  on odonto.agenda_eventos (empresa_id, paciente_id, inicio_em desc)
  where paciente_id is not null;

create table if not exists odonto.agenda_evento_procedimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  agenda_evento_id uuid not null references odonto.agenda_eventos(id) on delete cascade,
  descricao varchar(180) not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_odonto_agenda_evento_procedimentos
  on odonto.agenda_evento_procedimentos (empresa_id, agenda_evento_id);

create table if not exists odonto.alertas_retorno (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid not null references odonto.pacientes(id) on delete restrict,
  profissional_id uuid references odonto.profissionais(id) on delete set null,
  agenda_evento_id uuid references odonto.agenda_eventos(id) on delete set null,
  motivo varchar(180) not null,
  retornar_em date not null,
  observacoes text,
  status odonto.alerta_retorno_status not null default 'pendente',
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_odonto_alertas_retorno_pendentes
  on odonto.alertas_retorno (empresa_id, status, retornar_em);

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array['agenda_eventos', 'alertas_retorno']
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
