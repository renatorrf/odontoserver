create table if not exists odonto.perfis_acesso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete cascade,
  nome varchar(100) not null,
  descricao varchar(240),
  codigo_sistema varchar(40),
  sistema boolean not null default false,
  ativo boolean not null default true,
  created_by uuid references odonto.usuarios(id) on delete set null,
  updated_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create unique index if not exists uq_odonto_perfis_acesso_codigo
  on odonto.perfis_acesso (empresa_id, codigo_sistema)
  where codigo_sistema is not null;

create table if not exists odonto.perfil_permissoes (
  perfil_acesso_id uuid not null references odonto.perfis_acesso(id) on delete cascade,
  permissao varchar(100) not null,
  concedida_por uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (perfil_acesso_id, permissao)
);

alter table odonto.usuario_empresas
  add column if not exists perfil_acesso_id uuid references odonto.perfis_acesso(id) on delete restrict;

create index if not exists ix_odonto_usuario_empresas_perfil_acesso
  on odonto.usuario_empresas (empresa_id, perfil_acesso_id, ativo);

create table if not exists odonto.solicitacoes_aprovacao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  tipo varchar(60) not null check (tipo in (
    'recebimento_retroativo',
    'estorno_recebimento_retroativo',
    'pagamento_profissional_retroativo',
    'pagamento_despesa_retroativo',
    'desfazer_conciliacao'
  )),
  entidade varchar(80) not null,
  entidade_id uuid not null,
  payload jsonb not null,
  payload_hash char(64) not null,
  motivo text not null,
  status varchar(20) not null default 'pendente' check (status in (
    'pendente', 'aprovada', 'rejeitada', 'executando', 'executada', 'falhou', 'cancelada', 'expirada'
  )),
  solicitado_por uuid not null references odonto.usuarios(id) on delete restrict,
  solicitado_por_vinculo uuid not null references odonto.usuario_empresas(id) on delete restrict,
  solicitado_em timestamptz not null default now(),
  decidido_por uuid references odonto.usuarios(id) on delete restrict,
  decidido_em timestamptz,
  justificativa_decisao text,
  executado_em timestamptz,
  erro_execucao text,
  expira_em timestamptz not null default (now() + interval '72 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_odonto_solicitacoes_aprovacao_fila
  on odonto.solicitacoes_aprovacao (empresa_id, status, solicitado_em desc);

create unique index if not exists uq_odonto_solicitacao_aprovacao_pendente
  on odonto.solicitacoes_aprovacao (empresa_id, tipo, entidade_id, payload_hash)
  where status in ('pendente', 'aprovada', 'executando');

create table if not exists odonto.aprovacao_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  solicitacao_id uuid not null references odonto.solicitacoes_aprovacao(id) on delete restrict,
  usuario_id uuid not null references odonto.usuarios(id) on delete restrict,
  evento varchar(30) not null,
  detalhes jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists ix_odonto_aprovacao_eventos_solicitacao
  on odonto.aprovacao_eventos (solicitacao_id, created_at);

create or replace function odonto.bloquear_mutacao_auditoria()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Registros de auditoria nao podem ser alterados ou excluidos.';
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'tg_audit_logs_immutable'
       and tgrelid = 'odonto.audit_logs'::regclass
  ) then
    create trigger tg_audit_logs_immutable
    before update or delete on odonto.audit_logs
    for each row execute procedure odonto.bloquear_mutacao_auditoria();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'tg_aprovacao_eventos_immutable'
       and tgrelid = 'odonto.aprovacao_eventos'::regclass
  ) then
    create trigger tg_aprovacao_eventos_immutable
    before update or delete on odonto.aprovacao_eventos
    for each row execute procedure odonto.bloquear_mutacao_auditoria();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'tg_perfis_acesso_updated_at'
       and tgrelid = 'odonto.perfis_acesso'::regclass
  ) then
    create trigger tg_perfis_acesso_updated_at
    before update on odonto.perfis_acesso
    for each row execute procedure odonto.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'tg_solicitacoes_aprovacao_updated_at'
       and tgrelid = 'odonto.solicitacoes_aprovacao'::regclass
  ) then
    create trigger tg_solicitacoes_aprovacao_updated_at
    before update on odonto.solicitacoes_aprovacao
    for each row execute procedure odonto.set_updated_at();
  end if;
end $$;

do $$
declare
  company record;
  manager_profile uuid;
  attendance_profile uuid;
  clinical_profile uuid;
  finance_profile uuid;
begin
  for company in select id from odonto.empresas loop
    insert into odonto.perfis_acesso (empresa_id, nome, descricao, codigo_sistema, sistema)
    values (company.id, 'Administrador da clinica', 'Acesso integral a operacao da empresa.', 'administrador', true)
    on conflict (empresa_id, nome) do update set codigo_sistema = 'administrador', sistema = true
    returning id into manager_profile;

    insert into odonto.perfis_acesso (empresa_id, nome, descricao, codigo_sistema, sistema)
    values (company.id, 'Atendimento', 'Pacientes, agenda, orcamentos e recebimentos do dia.', 'atendimento', true)
    on conflict (empresa_id, nome) do update set codigo_sistema = 'atendimento', sistema = true
    returning id into attendance_profile;

    insert into odonto.perfis_acesso (empresa_id, nome, descricao, codigo_sistema, sistema)
    values (company.id, 'Profissional clinico', 'Agenda e informacoes clinicas necessarias ao atendimento.', 'clinico', true)
    on conflict (empresa_id, nome) do update set codigo_sistema = 'clinico', sistema = true
    returning id into clinical_profile;

    insert into odonto.perfis_acesso (empresa_id, nome, descricao, codigo_sistema, sistema)
    values (company.id, 'Financeiro', 'Rotinas financeiras sem poder de autoaprovacao.', 'financeiro', true)
    on conflict (empresa_id, nome) do update set codigo_sistema = 'financeiro', sistema = true
    returning id into finance_profile;

    insert into odonto.perfil_permissoes (perfil_acesso_id, permissao)
    select manager_profile, permissao from unnest(array[
      'menu.inicio','menu.painel_estrategico','menu.pacientes','pacientes.editar','pacientes.clinico.editar','menu.profissionais',
      'profissionais.editar','menu.procedimentos','procedimentos.editar','menu.agenda','agenda.editar',
      'menu.ortodontia','menu.caixa','menu.contas_receber','financeiro.recebimentos.registrar',
      'financeiro.recebimentos.retroativo.solicitar','financeiro.recebimentos.estornar','menu.conciliacao',
      'financeiro.conciliacao.importar','financeiro.conciliacao.conciliar',
      'financeiro.conciliacao.desfazer.solicitar','menu.apuracao','financeiro.pagamentos.registrar',
      'financeiro.pagamentos.retroativo.solicitar','menu.projecao','projecao.notificar','menu.despesas','financeiro.despesas.editar',
      'financeiro.despesas.retroativo.solicitar',
      'menu.bancos','financeiro.bancos.editar','menu.custo_basal','menu.dre','menu.resultados','menu.comercial',
      'comercial.editar','menu.configuracoes','configuracoes.integracoes.editar','menu.usuarios',
      'usuarios.visualizar','usuarios.gerenciar','perfis.gerenciar','aprovacoes.financeiras.aprovar',
      'auditoria.visualizar'
    ]) as permissao on conflict do nothing;

    insert into odonto.perfil_permissoes (perfil_acesso_id, permissao)
    select attendance_profile, permissao from unnest(array[
      'menu.inicio','menu.pacientes','pacientes.editar','menu.procedimentos','menu.agenda','agenda.editar',
      'menu.ortodontia','menu.caixa','menu.contas_receber','financeiro.recebimentos.registrar',
      'financeiro.recebimentos.retroativo.solicitar','menu.projecao','projecao.notificar','menu.comercial','comercial.editar'
    ]) as permissao on conflict do nothing;

    insert into odonto.perfil_permissoes (perfil_acesso_id, permissao)
    select clinical_profile, permissao from unnest(array[
      'menu.inicio','menu.pacientes','pacientes.clinico.editar','menu.procedimentos','menu.agenda','agenda.editar',
      'menu.ortodontia','menu.resultados'
    ]) as permissao on conflict do nothing;

    insert into odonto.perfil_permissoes (perfil_acesso_id, permissao)
    select finance_profile, permissao from unnest(array[
      'menu.inicio','menu.painel_estrategico','menu.caixa','menu.contas_receber',
      'financeiro.recebimentos.registrar','financeiro.recebimentos.retroativo.solicitar',
      'financeiro.recebimentos.estornar','menu.conciliacao','financeiro.conciliacao.importar',
      'financeiro.conciliacao.conciliar','financeiro.conciliacao.desfazer.solicitar','menu.apuracao',
      'financeiro.pagamentos.registrar','financeiro.pagamentos.retroativo.solicitar','menu.projecao',
      'menu.despesas','financeiro.despesas.editar','menu.bancos','financeiro.bancos.editar',
      'financeiro.despesas.retroativo.solicitar',
      'menu.custo_basal','menu.dre','menu.resultados'
    ]) as permissao on conflict do nothing;

    update odonto.usuario_empresas
       set perfil_acesso_id = case perfil::text
         when 'gestor' then manager_profile
         when 'atendente' then attendance_profile
         when 'dentista' then clinical_profile
         else perfil_acesso_id
       end
     where empresa_id = company.id and perfil_acesso_id is null;
  end loop;
end $$;
