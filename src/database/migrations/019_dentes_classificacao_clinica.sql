alter table odonto.catalogo_procedimentos
  add column extracao boolean not null default false,
  add column forma_cobranca varchar(16) not null default 'VALOR_UNICO'
    check (forma_cobranca in ('POR_DENTE', 'VALOR_UNICO')),
  add column tipo_evento_ortodontico varchar(16) not null default 'NENHUM'
    check (tipo_evento_ortodontico in ('NENHUM', 'INSTALACAO', 'MANUTENCAO', 'OUTRO'));

alter table odonto.orcamento_itens add column empresa_id uuid;
update odonto.orcamento_itens i set empresa_id = o.empresa_id from odonto.orcamentos o where o.id = i.orcamento_id;
alter table odonto.orcamento_itens alter column empresa_id set not null;
alter table odonto.orcamento_itens add unique (id, empresa_id);
alter table odonto.orcamento_itens add foreign key (orcamento_id, empresa_id) references odonto.orcamentos(id, empresa_id);
alter table odonto.orcamento_itens add column extracao boolean not null default false,
  add column forma_cobranca varchar(16) not null default 'VALOR_UNICO' check (forma_cobranca in ('POR_DENTE','VALOR_UNICO'));

-- Keep older insertion paths compatible while enforcing the tenant of the parent quote.
create function odonto.orcamento_item_empresa() returns trigger language plpgsql as $$
begin
  if new.empresa_id is null then
    select empresa_id into new.empresa_id from odonto.orcamentos where id = new.orcamento_id;
  end if;
  return new;
end $$;
create trigger tg_orcamento_item_empresa before insert on odonto.orcamento_itens
  for each row execute procedure odonto.orcamento_item_empresa();

alter table odonto.agenda_evento_procedimentos add unique (id, empresa_id);
alter table odonto.agenda_evento_procedimentos add column orcamento_item_id uuid,
  add column extracao boolean not null default false,
  add column forma_cobranca varchar(16) not null default 'VALOR_UNICO' check (forma_cobranca in ('POR_DENTE','VALOR_UNICO')),
  add foreign key (orcamento_item_id, empresa_id) references odonto.orcamento_itens(id, empresa_id);
alter table odonto.procedimentos_realizados add unique (id, empresa_id);
alter table odonto.procedimentos_realizados add column agenda_item_id uuid,
  add column orcamento_item_id uuid,
  add column realizado_em timestamptz,
  add column tipo_evento_ortodontico varchar(16),
  add foreign key (agenda_item_id, empresa_id) references odonto.agenda_evento_procedimentos(id, empresa_id),
  add foreign key (orcamento_item_id, empresa_id) references odonto.orcamento_itens(id, empresa_id),
  add unique (agenda_item_id);

alter table odonto.pacientes add unique (id, empresa_id);

-- Connect legacy items only when the catalog reference is unambiguous in both directions.
update odonto.agenda_evento_procedimentos a set orcamento_item_id=i.id
from odonto.agenda_eventos e, odonto.orcamento_itens i
where a.agenda_evento_id=e.id and a.empresa_id=e.empresa_id and i.orcamento_id=e.orcamento_id and i.empresa_id=e.empresa_id
  and a.catalogo_procedimento_id=i.catalogo_procedimento_id
  and (select count(*) from odonto.orcamento_itens x where x.orcamento_id=i.orcamento_id and x.catalogo_procedimento_id=i.catalogo_procedimento_id)=1
  and (select count(*) from odonto.agenda_evento_procedimentos x where x.agenda_evento_id=a.agenda_evento_id and x.catalogo_procedimento_id=a.catalogo_procedimento_id)=1;

-- Each row belongs to exactly one stage: planned, scheduled or performed.
create table odonto.procedimento_dentes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references odonto.empresas(id),
  paciente_id uuid,
  orcamento_item_id uuid,
  agenda_item_id uuid,
  realizado_id uuid,
  numero_dente smallint not null,
  tipo_denticao varchar(10) not null check (tipo_denticao in ('permanente','decidua')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references odonto.usuarios(id),
  updated_by uuid not null references odonto.usuarios(id),
  check (num_nonnulls(orcamento_item_id, agenda_item_id, realizado_id) = 1),
  check ((tipo_denticao = 'permanente' and numero_dente / 10 between 1 and 4 and numero_dente % 10 between 1 and 8)
    or (tipo_denticao = 'decidua' and numero_dente / 10 between 5 and 8 and numero_dente % 10 between 1 and 5)),
  foreign key (paciente_id, empresa_id) references odonto.pacientes(id, empresa_id),
  foreign key (orcamento_item_id, empresa_id) references odonto.orcamento_itens(id, empresa_id) on delete cascade,
  foreign key (agenda_item_id, empresa_id) references odonto.agenda_evento_procedimentos(id, empresa_id) on delete cascade,
  foreign key (realizado_id, empresa_id) references odonto.procedimentos_realizados(id, empresa_id),
  unique (orcamento_item_id, numero_dente),
  unique (agenda_item_id, numero_dente),
  unique (realizado_id, numero_dente)
);
create index idx_dentes_paciente on odonto.procedimento_dentes(empresa_id, paciente_id, numero_dente);

-- Portable accent folding, without requiring an extension or elevated DB privileges.
create function odonto.search_text(value text) returns text immutable parallel safe language sql as $$
  select translate(lower(regexp_replace(trim(coalesce(value,'')), '\s+', ' ', 'g')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;
