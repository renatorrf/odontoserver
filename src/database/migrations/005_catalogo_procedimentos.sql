create table if not exists odonto.catalogo_procedimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  codigo varchar(30),
  nome varchar(160) not null,
  descricao text,
  categoria varchar(80),
  duracao_minutos integer not null default 30,
  valor numeric(12, 2) not null default 0,
  ativo boolean not null default true,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duracao_minutos between 5 and 480),
  check (valor >= 0),
  unique (id, empresa_id)
);

create unique index if not exists uq_odonto_catalogo_procedimentos_nome
  on odonto.catalogo_procedimentos (empresa_id, lower(nome));

create unique index if not exists uq_odonto_catalogo_procedimentos_codigo
  on odonto.catalogo_procedimentos (empresa_id, upper(codigo))
  where codigo is not null;

create index if not exists ix_odonto_catalogo_procedimentos_busca
  on odonto.catalogo_procedimentos (empresa_id, ativo, lower(nome));

alter table odonto.agenda_evento_procedimentos
  add column if not exists catalogo_procedimento_id uuid references odonto.catalogo_procedimentos(id) on delete set null;

alter table odonto.agenda_evento_procedimentos
  add column if not exists valor numeric(12, 2);

create index if not exists ix_odonto_agenda_evento_procedimento_catalogo
  on odonto.agenda_evento_procedimentos (empresa_id, catalogo_procedimento_id)
  where catalogo_procedimento_id is not null;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'tg_catalogo_procedimentos_updated_at'
       and tgrelid = 'odonto.catalogo_procedimentos'::regclass
  ) then
    create trigger tg_catalogo_procedimentos_updated_at
    before update on odonto.catalogo_procedimentos
    for each row execute procedure odonto.set_updated_at();
  end if;
end $$;
