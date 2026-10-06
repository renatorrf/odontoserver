create table if not exists odonto.empresa_integracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete cascade,
  tipo varchar(40) not null,
  ativo boolean not null default false,
  configuracao jsonb not null default '{}'::jsonb,
  segredos_criptografados text,
  ultima_validacao_em timestamptz,
  ultima_validacao_erro text,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo in ('whatsapp_meta', 'smtp')),
  unique (empresa_id, tipo)
);

create index if not exists ix_odonto_empresa_integracoes
  on odonto.empresa_integracoes (empresa_id, tipo, ativo);

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'tg_empresa_integracoes_updated_at'
       and tgrelid = 'odonto.empresa_integracoes'::regclass
  ) then
    create trigger tg_empresa_integracoes_updated_at
    before update on odonto.empresa_integracoes
    for each row execute procedure odonto.set_updated_at();
  end if;
end $$;
