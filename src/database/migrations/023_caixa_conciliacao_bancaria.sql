create table if not exists odonto.conciliacao_importacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  banco_id uuid not null references odonto.bancos(id) on delete restrict,
  nome_arquivo varchar(255) not null,
  arquivo_hash char(64) not null,
  banco_ofx varchar(20),
  conta_final varchar(12),
  periodo_inicio date,
  periodo_fim date,
  quantidade_movimentos integer not null default 0,
  importado_por uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (empresa_id, banco_id, arquivo_hash)
);

create table if not exists odonto.conciliacao_extrato_movimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  importacao_id uuid not null references odonto.conciliacao_importacoes(id) on delete cascade,
  banco_id uuid not null references odonto.bancos(id) on delete restrict,
  fit_id varchar(180) not null,
  data_movimento date not null,
  natureza varchar(10) not null,
  valor numeric(12, 2) not null,
  tipo_ofx varchar(30),
  documento varchar(120),
  favorecido varchar(180),
  descricao text,
  created_at timestamptz not null default now(),
  check (natureza in ('credito', 'debito')),
  check (valor > 0),
  unique (empresa_id, banco_id, fit_id),
  unique (id, empresa_id)
);

create table if not exists odonto.conciliacao_vinculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  extrato_movimento_id uuid not null,
  origem_sistema varchar(30) not null,
  movimento_sistema_id uuid not null,
  valor_conciliado numeric(12, 2) not null,
  modo varchar(20) not null default 'manual',
  score_sugestao integer,
  conciliado_por uuid references odonto.usuarios(id) on delete set null,
  conciliado_em timestamptz not null default now(),
  check (origem_sistema in ('recebimento', 'despesa', 'comissao')),
  check (modo in ('manual', 'sugerido')),
  check (valor_conciliado > 0),
  check (score_sugestao is null or score_sugestao between 0 and 100),
  foreign key (extrato_movimento_id, empresa_id)
    references odonto.conciliacao_extrato_movimentos(id, empresa_id) on delete cascade,
  unique (empresa_id, origem_sistema, movimento_sistema_id)
);

create index if not exists ix_odonto_conciliacao_importacoes_periodo
  on odonto.conciliacao_importacoes (empresa_id, banco_id, periodo_inicio, periodo_fim);

create index if not exists ix_odonto_conciliacao_extrato_periodo
  on odonto.conciliacao_extrato_movimentos (empresa_id, banco_id, data_movimento, natureza);

create index if not exists ix_odonto_conciliacao_vinculos_extrato
  on odonto.conciliacao_vinculos (empresa_id, extrato_movimento_id);
