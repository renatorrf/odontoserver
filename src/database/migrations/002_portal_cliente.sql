alter table odonto.usuarios
  add column if not exists senha_temporaria boolean not null default false,
  add column if not exists senha_alterada_em timestamptz;

create table if not exists odonto.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references odonto.usuarios(id) on delete cascade,
  empresa_id uuid references odonto.empresas(id) on delete cascade,
  token_hash varchar(64) not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_odonto_password_reset_tokens_hash
  on odonto.password_reset_tokens (token_hash);

create index if not exists ix_odonto_password_reset_tokens_usuario
  on odonto.password_reset_tokens (usuario_id, used_at, expires_at);

create table if not exists odonto.procedimentos_realizados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid not null references odonto.pacientes(id) on delete cascade,
  data_procedimento date not null default current_date,
  descricao varchar(180) not null,
  dente varchar(30),
  profissional_nome varchar(160),
  valor numeric(12, 2),
  observacoes text,
  created_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_odonto_procedimentos_paciente
  on odonto.procedimentos_realizados (empresa_id, paciente_id, data_procedimento desc);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'tg_procedimentos_realizados_updated_at'
      and tgrelid = 'odonto.procedimentos_realizados'::regclass
  ) then
    create trigger tg_procedimentos_realizados_updated_at
    before update on odonto.procedimentos_realizados
    for each row execute procedure odonto.set_updated_at();
  end if;
end $$;
