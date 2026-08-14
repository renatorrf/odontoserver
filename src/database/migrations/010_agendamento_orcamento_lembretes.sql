alter table odonto.orcamento_itens
  add column if not exists duracao_minutos integer not null default 30;

update odonto.orcamento_itens oi
   set duracao_minutos = cp.duracao_minutos
  from odonto.catalogo_procedimentos cp
 where cp.id = oi.catalogo_procedimento_id
   and oi.duracao_minutos = 30;

alter table odonto.orcamento_itens
  drop constraint if exists ck_orcamento_itens_duracao;

alter table odonto.orcamento_itens
  add constraint ck_orcamento_itens_duracao check (duracao_minutos between 5 and 480);

alter table odonto.pacientes
  add column if not exists cadastro_incompleto boolean not null default false;

alter table odonto.agenda_evento_procedimentos
  add column if not exists quantidade integer not null default 1;

alter table odonto.agenda_evento_procedimentos
  add column if not exists duracao_minutos integer not null default 30;

update odonto.agenda_evento_procedimentos aep
   set duracao_minutos = cp.duracao_minutos
  from odonto.catalogo_procedimentos cp
 where cp.id = aep.catalogo_procedimento_id
   and aep.duracao_minutos = 30;

alter table odonto.agenda_evento_procedimentos
  drop constraint if exists ck_agenda_evento_procedimentos_quantidade;

alter table odonto.agenda_evento_procedimentos
  add constraint ck_agenda_evento_procedimentos_quantidade check (quantidade between 1 and 99);

alter table odonto.agenda_evento_procedimentos
  drop constraint if exists ck_agenda_evento_procedimentos_duracao;

alter table odonto.agenda_evento_procedimentos
  add constraint ck_agenda_evento_procedimentos_duracao check (duracao_minutos between 5 and 47520);

alter table odonto.agenda_eventos
  add column if not exists orcamento_id uuid references odonto.orcamentos(id) on delete set null;

alter table odonto.agenda_eventos
  add column if not exists lembrete_duas_horas_habilitado boolean not null default true;

alter table odonto.agenda_eventos
  add column if not exists notificar_aplicativo boolean not null default true;

alter table odonto.agenda_eventos
  add column if not exists notificar_whatsapp boolean not null default true;

alter table odonto.agenda_eventos
  add column if not exists lembrete_duas_horas_enviado_em timestamptz;

create unique index if not exists uq_odonto_agenda_eventos_orcamento
  on odonto.agenda_eventos (empresa_id, orcamento_id)
  where orcamento_id is not null and status <> 'cancelado';

create index if not exists ix_odonto_agenda_eventos_lembretes
  on odonto.agenda_eventos (inicio_em, lembrete_duas_horas_enviado_em)
  where tipo = 'consulta'
    and status in ('agendado', 'confirmado')
    and lembrete_duas_horas_habilitado = true;

create table if not exists odonto.agenda_evento_remarcacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id) on delete restrict,
  agenda_evento_id uuid not null references odonto.agenda_eventos(id) on delete cascade,
  inicio_anterior timestamptz not null,
  fim_anterior timestamptz not null,
  inicio_novo timestamptz not null,
  fim_novo timestamptz not null,
  motivo text,
  created_by uuid references odonto.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ix_odonto_agenda_evento_remarcacoes
  on odonto.agenda_evento_remarcacoes (empresa_id, agenda_evento_id, created_at desc);
