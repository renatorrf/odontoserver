insert into odonto.medicamentos (empresa_id,nome,apresentacao,concentracao,posologia_padrao)
select e.id, seed.nome, seed.apresentacao, seed.concentracao, seed.posologia
from odonto.empresas e
cross join (values
  ('Amoxicilina','Capsula','500 mg','Tomar 1 capsula a cada 8 horas.'),
  ('Ibuprofeno','Comprimido','600 mg','Tomar 1 comprimido a cada 8 horas, apos alimentacao.'),
  ('Paracetamol','Comprimido','750 mg','Tomar 1 comprimido a cada 6 horas se houver dor.'),
  ('Digluconato de clorexidina','Solucao para bochecho','0,12%','Bochechar 15 ml por 30 segundos, 2 vezes ao dia.')
) seed(nome,apresentacao,concentracao,posologia)
on conflict (empresa_id,nome,concentracao) do nothing;
