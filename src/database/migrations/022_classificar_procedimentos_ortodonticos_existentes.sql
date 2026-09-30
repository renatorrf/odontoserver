update odonto.catalogo_procedimentos
   set tipo_evento_ortodontico = 'INSTALACAO'
 where tipo_evento_ortodontico = 'NENHUM'
   and odonto.search_text(nome) in (
     'instalacao de aparelho convencional',
     'instalacao de aparelho convencional metalico'
   );

update odonto.catalogo_procedimentos
   set tipo_evento_ortodontico = 'MANUTENCAO'
 where tipo_evento_ortodontico = 'NENHUM'
   and odonto.search_text(nome) = 'manutencao ortodontica';
