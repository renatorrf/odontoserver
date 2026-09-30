alter table odonto.agenda_eventos
  add column if not exists retorno_ortodontico boolean not null default false;

alter table odonto.agenda_eventos
  add column if not exists origem_evento_id uuid references odonto.agenda_eventos(id) on delete set null;

alter table odonto.agenda_eventos
  add column if not exists lembrete_tres_dias_enviado_em timestamptz;

create unique index if not exists uq_odonto_retorno_ortodontico_origem
  on odonto.agenda_eventos (empresa_id, origem_evento_id)
  where retorno_ortodontico = true and origem_evento_id is not null;

create index if not exists ix_odonto_retorno_ortodontico_lembrete
  on odonto.agenda_eventos (inicio_em, lembrete_tres_dias_enviado_em)
  where retorno_ortodontico = true
    and tipo = 'consulta'
    and status in ('agendado', 'confirmado');
