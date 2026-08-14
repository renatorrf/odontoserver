alter table odonto.paciente_financeiro_pagamentos
  add column if not exists banco_id uuid references odonto.bancos(id) on delete set null,
  add column if not exists observacoes text;

create index if not exists ix_odonto_paciente_pagamentos_banco
  on odonto.paciente_financeiro_pagamentos (empresa_id, banco_id, pago_em desc)
  where banco_id is not null and estornado_em is null;

