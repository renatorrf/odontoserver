alter table odonto.agenda_eventos
  add column if not exists observacoes_procedimentos text,
  add column if not exists observacoes_procedimentos_updated_at timestamptz,
  add column if not exists observacoes_procedimentos_updated_by uuid references odonto.usuarios(id) on delete set null;

alter table odonto.agenda_eventos
  drop constraint if exists ck_odonto_agenda_observacoes_procedimentos_tamanho;

alter table odonto.agenda_eventos
  add constraint ck_odonto_agenda_observacoes_procedimentos_tamanho
  check (observacoes_procedimentos is null or char_length(observacoes_procedimentos) <= 3000);

