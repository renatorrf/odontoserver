do $$
begin
  create type odonto.notificacao_canal as enum ('aplicativo', 'whatsapp');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type odonto.notificacao_envio_status as enum ('pendente', 'enviada', 'falhou');
exception
  when duplicate_object then null;
end $$;

create table if not exists odonto.notificacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  paciente_id uuid not null references odonto.pacientes(id) on delete cascade,
  agenda_evento_id uuid references odonto.agenda_eventos(id) on delete set null,
  canal odonto.notificacao_canal not null,
  tipo varchar(50) not null default 'lembrete_agendamento',
  titulo varchar(160) not null,
  mensagem text not null,
  destinatario varchar(180),
  status_envio odonto.notificacao_envio_status not null default 'pendente',
  provedor_id varchar(180),
  erro_envio text,
  enviada_em timestamptz,
  lida_em timestamptz,
  created_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_odonto_notificacoes_paciente
  on odonto.notificacoes (empresa_id, paciente_id, created_at desc);

create index if not exists ix_odonto_notificacoes_evento
  on odonto.notificacoes (empresa_id, agenda_evento_id, canal, created_at desc);

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'tg_notificacoes_updated_at'
       and tgrelid = 'odonto.notificacoes'::regclass
  ) then
    create trigger tg_notificacoes_updated_at
    before update on odonto.notificacoes
    for each row execute procedure odonto.set_updated_at();
  end if;
end $$;
