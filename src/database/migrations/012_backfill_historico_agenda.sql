insert into odonto.agenda_evento_status_historico (
  empresa_id,
  agenda_evento_id,
  status_anterior,
  status_novo,
  justificativa,
  created_by,
  created_at
)
select
  event.empresa_id,
  event.id,
  null,
  event.status::text,
  'Situacao registrada na implantacao do historico.',
  event.created_by,
  event.created_at
from odonto.agenda_eventos event
where not exists (
  select 1
  from odonto.agenda_evento_status_historico history
  where history.empresa_id = event.empresa_id
    and history.agenda_evento_id = event.id
);
