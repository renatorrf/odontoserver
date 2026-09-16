# Entrega: painel, agenda, orcamentos e extracoes

Data da validacao: 02/09/2026.

## Escopo e implantacao

Backend: C:/Projetos/Odonto/Odonto-Backend.
Frontend: C:/Projetos/Odonto/Odonto-Front/odonto.

A base existente foi mantida. A implementacao usa TypeScript, Express, pg, PostgreSQL,
Ionic/Angular, Reactive Forms, RxJS e FullCalendar, conforme os projetos.
Nenhuma configuracao Firebase foi alterada nesta entrega.

Executar no backend, com o .env do ambiente correto:

```powershell
npm run db:migrate
npm run build
npm test
npm run test:integration
npm start
```

Executar no frontend:

```powershell
npm install
npm run lint
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
npm start -- --host 127.0.0.1 --port 4200
```

As migrations 019 e 020 foram aplicadas na conexao configurada e a segunda execucao
confirmou que ambas sao ignoradas pelo controle de migrations. Nao executar o SQL
manualmente por fora desse controle. Fazer backup antes de aplicar em outro ambiente.

## Banco de dados

### 019_dentes_classificacao_clinica.sql

- Catalogo: extracao, forma_cobranca e tipo_evento_ortodontico.
- Itens de orcamento: empresa_id preenchido pelo orcamento pai, FK composta,
  snapshot da classificacao de extracao e da forma de cobranca.
- Itens de agenda: orcamento_item_id, classificacao e cobranca.
- Procedimentos realizados: agenda_item_id unico, orcamento_item_id, realizado_em
  e campo para classificacao ortodontica.
- Tabela procedimento_dentes: cada linha pertence exclusivamente a um item
  planejado, programado ou realizado. Inclui empresa, paciente, numero FDI,
  denticao, datas e usuarios.
- Checks FDI e unicidade impedem dentes invalidos e duplicados no mesmo item.
- FKs compostas impedem relacionamentos entre empresas.
- Indice (empresa_id, paciente_id, numero_dente) atende a consulta de alertas.
- Relacionamentos legados agenda/orcamento sao preenchidos somente quando ha
  correspondencia inequivoca de catalogo nos dois lados.
- Trigger compativel com caminhos antigos de insercao deriva a empresa do pai.
- Funcao odonto.search_text normaliza caixa, espacos e acentos latinos comuns.
  Nao exige unaccent ou extensao nova. Nao foram criados indices textuais
  indiscriminadamente para LIKE com curinga inicial.

### 020_auditoria_classificacao.sql

Trigger registra alteracoes dos marcadores clinicos e da forma de cobranca no
audit_logs existente, com valores anteriores/novos e usuario.

Foi verificado PostgreSQL 9.6.24 nesta conexao. O SQL utiliza a sintaxe de trigger
compativel com essa versao; a extensao pgcrypto ja era utilizada pela base.

## Regras clinicas e financeiras

### Instalacoes ortodonticas

O indicador quantidadeInstalacoes e independente dos valores financeiros existentes.
Somente o marcador estruturado INSTALACAO habilita a contagem. Nenhuma pesquisa
por palavras no nome do procedimento foi implementada.

Na agenda, o evento deve estar atendido/concluido, possuir fim_atendimento_em no
periodo e conter item ativo de instalacao. A finalizacao do atendimento e a
confirmacao de realizacao adotada pelo fluxo existente. Itens cancelados/suspensos
nao contam. O dia de referencia e a data efetiva de finalizacao em America/Sao_Paulo,
nao a data originalmente agendada.

Registros em procedimentos_realizados usam data_procedimento. Quando vinculados a
uma agenda, compartilham a chave do atendimento. O UNION elimina repeticao:
uma instalacao por paciente e atendimento, mesmo com varios itens de instalacao.
Um realizado avulso sem agenda representa um evento individual.

Manutencao, avaliacao, retorno e outros procedimentos devem ficar em MANUTENCAO,
OUTRO ou NENHUM. Marcacao incorreta do catalogo exige revisao do gestor.
O card oculta apenas Nao recebidos e Ticket medio; as propriedades continuam na API.

### Extracoes

- POR_DENTE: quantidade = numero de dentes; total = quantidade x valor unitario.
- VALOR_UNICO: um item, quantidade 1, com varios dentes relacionados.
- O backend rejeita divergencias de quantidade e selecao, e exige dentes.
- Dentes permanentes e deciduos sao validados por FDI.
- Aviso de outro planejamento considera orcamentos ativos do mesmo paciente.
  Nao considera cancelados, recusados, expirados, nao aprovados ou concluidos.
- Excecao exige permissao clinica e justificativa; a checagem e serializada por
  paciente para evitar que dois planejamentos simultaneos ultrapassem a validacao.
- Contato ainda nao cadastrado recebe paciente_id ao aprovar/agendar. A verificacao
  de conflitos ocorre novamente nessa associacao.
- IDs dos itens sao preservados nas edicoes. Dentes do orcamento, agenda e realizado
  sao etapas separadas: alterar a programacao nao sobrescreve o planejamento.
- Mudanca da programacao em relacao ao orcamento exige justificativa.
- Na conclusao, ha confirmacao explicita dos dentes efetivamente extraidos.
  Diferencas exigem justificativa e ficam auditadas.
- O valor do realizado POR_DENTE considera os dentes efetivamente confirmados.
  O orcamento original continua preservado para reconciliacao financeira.
- Uma correcao clinica posterior nao refaz recebimentos, comissoes ou titulos
  automaticamente. Eventual ajuste financeiro deve seguir o fluxo financeiro.
- Exclusao de um item de extracao da agenda nao apaga o planejamento original.
- Orcamento ja vinculado/concluido nao pode ter sua composicao regravada pela tela
  comercial. Utilizar agenda para programacao e correcao clinica para realizados.
- Nao e permitido trocar o paciente de uma consulta/orcamento ja vinculado.
- Duplicacao de orcamento copia dentes e classificacao, com validacao de conflito.
- Corrigida a projecao no painel: agenda_evento_procedimentos.valor ja representa
  o total do item; nao deve ser multiplicado novamente pela quantidade.

## Permissoes

As permissoes das rotas existentes foram preservadas:
- Comercial e financeiro: portal_admin e gestor.
- Agenda/pacientes/catalogo: perfis operacionais admitidos pelos routers existentes.
- Selecionar/alterar dentes, confirmar/corrigir extracao, consultar contexto dental
  e visualizar timeline/documentos clinicos: portal_admin, gestor ou dentista.
- Atendentes nao recebem os atalhos de historico e o backend recusa acesso clinico,
  mesmo com chamada direta. Frontend nao e usado como fronteira de seguranca.
- Portal do paciente continua com suas rotas proprias.

A auditoria usa audit_logs, nao os logs tecnicos gerais. Registra etapa, paciente,
contexto disponivel de orcamento/agenda/procedimento, selecoes anterior/nova,
usuario, data e justificativa. Nao havia auditoria de leitura de timeline a ampliar.

## Interfaces

- Card Ortodontia reorganizado com faturamento, recebido e quantidade de instalacoes.
- Nome/avatar e nomes dos alertas da agenda abrem o paciente em ?aba=historico,
  com origem=agenda e agendamentoId quando disponivel.
- Voltar a agenda restaura data, visualizacao e filtros salvos na sessao.
- Links sao botoes nativos, acessiveis por teclado, com foco e sem propagacao
  indevida para a acao do evento.
- Nomenclatura visivel alterada para Orcamento; nomes tecnicos preservados.
- Listagem de recentes saiu da lateral para modal responsivo com numero, contato,
  profissional, data, total, recebido, saldo, status e acoes.
- Modal filtra paciente/numero/situacao/datas, tem paginacao, estados de carregamento,
  vazio e erro. Selecionar fecha o modal e atualiza orcamentoId na rota.
- Orcamento ja carregado nao e buscado novamente apenas por selecao repetida.
- Selecao de outro registro nao descarta silenciosamente edicoes.
- Impressao usa o orcamento salvo e inclui dentes, regra de cobranca e valores.
- Arcada reutilizavel tem denticoes permanente/decidua, chips removiveis, foco,
  aria-pressed, alertas de planejamento e indicacao de extracoes registradas.
- Dentes aparecem na agenda, orcamento, timeline, documentos e impressao.
- Ajustado o campo monetario do item no celular para nao cortar o valor.

## Mapa de pesquisas

Debounce textual: 350 ms. Limpeza e selecoes/datas atualizam imediatamente.
LatestSearch cancela a assinatura anterior das listagens; typeaheads usam switchMap.
As assinaturas de pesquisas sao descartadas com DestroyRef/takeUntilDestroyed.

| Tela/campo | Consulta ou filtro | Comportamento |
| --- | --- | --- |
| Pacientes: nome/CPF/prontuario | Backend /pacientes | Incremental; limite 80; estado da busca na sessao |
| Profissionais: nome/documento/conselho | Backend /profissionais | Incremental; limite 50; busca na sessao |
| Catalogo: nome/codigo/categoria | Backend /procedimentos/catalogo | Incremental; limite 200; status combinado |
| Agenda: cabecalho paciente | Backend /agenda/eventos | Nome parcial normalizado + periodo/profissionais |
| Agenda: situacao | Local sobre resposta do periodo | Colecao do servidor preservada; sem alterar agendamentos |
| Agenda: paciente/retorno/procedimento no modal | Backend, com switchMap | Minimo 2 caracteres; sugestoes limitadas a 8 |
| Orcamento: seletor de paciente | Backend /pacientes | Minimo 2 caracteres; sem Enter |
| Orcamentos recentes | Backend /comercial/orcamentos | Paginas de 25, maximo 100; pagina reiniciada no filtro |
| Contas a receber | Backend /financeiro/contas-receber | Paginas de 30, maximo 100; resumo de TODO o filtro |
| Painel/DRE/custo basal/desempenho | Backend, agregacoes por periodo | Datas atualizam automaticamente |
| Apuracao | Backend /financeiro | Periodo/profissional/situacao/pagamento imediatos |
| Receita futura | Backend /projecao | Datas/profissional imediatos; selecao do agrupamento local |
| Despesas | Backend | Datas/categoria/status imediatos; cancelamento da busca anterior |
| Paciente: agendamentos | Backend /pacientes/:id/agendamentos | Datas/profissional/status/periodo imediatos |
| Pasta Vermelha | Backend | Botoes 30/60/90 dias e tipo ja eram imediatos |
| Historico clinico | Dados da timeline | Alternancia local Timeline/Lista, sem novo campo textual |
| Contas bancarias, usuarios, categorias, documentos | Sem campo de pesquisa textual de listagem encontrado | Formularios de edicao nao foram convertidos em pesquisas |

A Agenda suporta Dia, Semana, Mes e Lista, com os plugins FullCalendar da mesma
versao instalada (6.1.21). Consultas sao limitadas a 62 dias e 5.000 eventos.
Acima disso, ha mensagem para restringir filtros, nunca truncamento silencioso.
Listagens de pacientes/profissionais mantem limites preexistentes.

Corrigido um problema nas pesquisas de pacientes e contas a receber: termos sem
digitos nao correspondem mais a todo CPF/telefone por produzirem LIKE '%%'.

Nao foi acrescentado campo textual em telas que nao tinham busca. Alternar
profissional/visualizacao/agrupamento sobre dados ja carregados continua local.
A sessao guarda filtros da agenda, pacientes, profissionais e recentes; a paginacao
de recentes fica na instancia enquanto o usuario alterna entre modal e editor.

## Endpoints criados ou ampliados

Todos abaixo usam o prefixo /api e autenticacao existente.

| Metodo/caminho | Alteracao |
| --- | --- |
| GET/POST/PUT /procedimentos/catalogo[/:id] | extracao, formaCobranca, tipoEventoOrtodontico |
| GET /pacientes/:id/dentes?orcamentoId=UUID | planejados e realizados, por paciente/empresa |
| PATCH /procedimentos/realizados/:id/dentes | dentes + justificativa para correcao auditada |
| GET /comercial/orcamentos | search, status, inicio, fim, pagina, limite; temMais |
| POST/PUT /comercial/orcamentos[/:id] | item id, dentes, justificativaDentes, validacao/cobranca |
| POST /comercial/orcamentos/:id/aprovar-agendamento | vinculos e justificativaDentes opcional |
| POST /pacientes/:id/orcamentos/:quoteId/duplicar | justificativa opcional, copia dental auditada |
| GET/POST/PUT /agenda/eventos[/:id] | busca, IDs e dentes dos itens |
| PATCH /agenda/eventos/:id/status | extracoes confirmadas na conclusao |
| GET /pacientes/:id/timeline | permissao clinica; dentes reais e vinculos |
| GET/POST/PUT /pacientes/:id/documentos-clinicos[/:documentId] | snapshot dental derivado no servidor |
| GET /financeiro/painel-estrategico | quantidadeInstalacoes; valores financeiros preservados |
| GET /financeiro/contas-receber | busca normalizada, pagina/limite/temMais, resumo global |
| GET /pacientes, /profissionais, /procedimentos/catalogo | normalizacao da pesquisa |

Exemplo de item de extracao:

```json
{
  "catalogoProcedimentoId": "UUID-DO-CATALOGO",
  "quantidade": 2,
  "valorUnitario": 300,
  "dentes": [
    { "numero": 18, "denticao": "permanente" },
    { "numero": 28, "denticao": "permanente" }
  ],
  "justificativaDentes": null
}
```

Ao editar, enviar tambem o id do item retornado pela API. Para conclusao:

```json
{
  "status": "atendido",
  "extracoes": [
    {
      "agendaItemId": "UUID-DO-ITEM-DA-AGENDA",
      "dentes": [{ "numero": 18, "denticao": "permanente" }],
      "confirmado": true,
      "justificativa": "Segundo dente adiado conforme avaliacao clinica"
    }
  ]
}
```

Nao enviar empresa_id no corpo como fonte de autorizacao. O tenant vem do token.

## Arquivos da entrega

### Backend

Criados:
- src/database/migrations/019_dentes_classificacao_clinica.sql
- src/database/migrations/020_auditoria_classificacao.sql
- src/modules/dental/dental.rules.ts
- src/modules/dental/dental.service.ts
- src/modules/dental/schedule-dental-sync.ts
- src/modules/dental/dental-documents.ts
- src/modules/dental/dental.rules.test.ts
- src/modules/dental/dental.integration.test.ts
- src/modules/finance/installation-count.ts
- scripts/serve-preview.cjs
- scripts/ui-dental-fixture.cjs
- docs/ajustes-painel-agenda-extracoes.md

Alterados:
- package.json
- src/modules/commercial/commercial.schemas.ts
- src/modules/commercial/quote.service.ts
- src/modules/finance/receivables.schemas.ts
- src/modules/finance/receivables.service.ts
- src/modules/finance/strategic-dashboard.service.ts
- src/modules/patients/patient-tabs.service.ts
- src/modules/patients/patient.routes.ts
- src/modules/patients/patient.service.ts
- src/modules/procedures/procedure.routes.ts
- src/modules/procedures/procedure.schemas.ts
- src/modules/procedures/procedure.service.ts
- src/modules/professionals/professional.service.ts
- src/modules/schedule/schedule.schemas.ts
- src/modules/schedule/schedule.service.ts
- Arquivos correspondentes de dist, regenerados por tsc; nao editar dist manualmente.

### Frontend

Novos componentes/utilitarios/testes:
- src/app/core/models/dental.ts
- src/app/core/incremental-search.ts e incremental-search.spec.ts
- src/app/core/quote-print.ts e quote-print.spec.ts
- src/app/manager/components/tooth-selector/tooth-selector.component.ts/.html/.scss/.spec.ts
- src/app/manager/pages/workflow-regressions.spec.ts
- src/app/manager/pages/strategic-dashboard/strategic-dashboard.page.spec.ts

Alterados nesta entrega, inclusive arquivos que ja estavam fora do Git:
- package.json, package-lock.json, src/global.scss
- src/app/app.component.ts (somente sintaxe de injecao, sem alterar Firebase)
- src/app/core/services/management-api.service.ts
- src/app/core/services/finance-api.service.ts
- src/app/core/services/patients-api.service.ts
- src/app/core/services/procedure-catalog-api.service.ts
- src/app/core/services/schedule-api.service.ts
- src/app/manager/manager.module.ts e manager.page.ts
- Paginas strategic-dashboard, schedule, quick-quotes, procedure-catalog,
  patient-registration, professional-registration, accounts-receivable:
  respectivos arquivos .ts/.html/.scss tocados conforme a funcionalidade.
- Paginas dre, operational-cost, results, expenses, finance, revenue-projection:
  arquivos .ts para filtros/cancelamento.
- red-folder.page.html: nomenclatura.
- Componentes patient-timeline e clinical-documents: .ts/.html/.scss pertinentes
  para dentes, correcao e documentos.

As demais alteracoes preexistentes do frontend foram preservadas.

## Validacao executada

- Backend: build aprovado; 16 testes unitarios aprovados.
- Integracao PostgreSQL: um cenario transacional com diversas assercoes, aprovado.
  Cobre FDI, persistencia, IDs estaveis, precos, etapas preservadas, conflito,
  excecao, permissao, FKs entre empresas, conclusao/correcao, auditoria e contagem.
  Todos os dados desse cenario sao revertidos com ROLLBACK.
- Frontend: lint aprovado, build aprovado e 16 testes Karma/ChromeHeadless aprovados.
- Cobertura frontend inclui card de ortodontia, filtros automaticos, modal de recentes,
  rota, protecao de edicoes, cancelamento de resposta antiga, cobranca, permissoes,
  arcada permanente/decidua e HTML de impressao com escaping.
- Verificacao de paginacao das contas a receber no PostgreSQL: limite de uma linha
  e resumo identico nas paginas 1 e 2, sem alteracao de dados.
- Navegador: login, modal de recentes, pesquisa Marina sem Enter, agenda por nome
  parcial/caixa/espacos, previsualizacao, link ao historico, retorno, Mes/Lista.
- Inspecao visual em 1280x900 e 390x844. Modal/arcada sem overflow horizontal.
  Selecao 18/28/38 e remocao funcionais; valor 300 legivel no celular.
- Registro de catalogo criado exclusivamente para verificacao visual e removido.
  Nenhum orcamento/agenda/recebimento foi gravado nesse teste visual.

O backend nao possui comando lint configurado; a verificacao estatica executada
foi o TypeScript strict do build. Os dois git diff --check passaram.

## Roteiro manual

1. Como gestor, configure explicitamente os procedimentos de extracao e cobranca,
   e classifique a instalacao ortodontica. Nao confundir manutencao com instalacao.
2. Crie orcamento com dentes 18/28/38: por dente a R$300 deve totalizar R$900;
   por conjunto deve manter quantidade 1 e o valor informado.
3. Remova um dente; alterne para decidua e selecione 55; confira labels e teclado.
4. Salve, reabra em Recentes e confira os dentes. Imprima o orcamento salvo.
5. Planeje o mesmo dente em outro orcamento do paciente: verifique aviso, justificativa,
   recusa sem permissao e registro da excecao autorizada.
6. Aprove/agende, confira duracao e dentes. Altere programacao com justificativa;
   confira que dentes e valores planejados nao foram substituidos.
7. Finalize atendimento e confirme dentes reais. Uma divergencia sem justificativa
   deve falhar. Confira timeline, profissional, timestamp e referencias.
8. Corrija uma extracao no historico com justificativa; confira auditoria e preservacao
   do planejamento. Reavalie o financeiro separadamente se mudar o escopo executado.
9. Conte instalacao com varios itens no mesmo atendimento: 1. Confira manutencao,
   cancelamento, outra empresa e data fora do periodo: nao devem entrar.
10. Agenda: digite nome completo, parte intermediaria, sem acento e com espacos.
    Combine profissional/status/data. Alterne Dia/Semana/Mes/Lista; limpe.
11. Clique no nome/avatar ou alerta, confira ?aba=historico, atualize a pagina e
    volte a agenda. Teste atendente e chamada direta sem permissao.
12. Recentes: nome/numero/status/datas, avancar/voltar pagina, nenhum resultado,
    servidor indisponivel, retorno ao editor e tentativa com edicoes nao salvas.
13. Repita pesquisas em Pacientes, Profissionais, Catalogo e Contas a receber;
    filtre datas/status em financeiro, despesas, resultados e agendamentos do paciente.
14. Em conexao lenta, altere texto rapidamente. Resposta antiga nao deve substituir
    a busca nova. Ao limpar, o filtro textual deve ser restaurado imediatamente.
15. Em celular, confira rolagem interna e fechamento do modal, dentes, valores,
    e botoes sem sobreposicao. Validar tambem Safari/iOS real antes de publicar.

## Limites e cuidados

- Catalogo legado nao recebe classificacao inferida pelo nome. Configure os marcadores
  antes de usar a arcada e o indicador de instalacoes.
- Atendimentos antigos sem data efetiva de finalizacao nao sao presumidos realizados
  na data de agendamento. Registros avulsos realizados continuam contando por sua data.
- Relacionamentos legados ambiguos requerem revisao explicita. A edicao bloqueia em vez
  de inventar vinculos ou duplicar itens de orcamento.
- Indicacao de dentes concluidos nao e um bloqueio clinico universal: historicos podem
  precisar de correcao. A correcao exige permissao/justificativa e nao apaga a auditoria.
- PDF utiliza a impressao do navegador; nao foi criado um motor de PDF no servidor.
  O navegador pode bloquear a janela de impressao.
- Filtros/pagina/scroll nao sao persistidos integralmente em todas as telas; foram
  preservados os contextos centrais indicados acima.
- Build emite avisos de budget CSS: pacientes, agenda, orcamento e painel. Nao ha
  erro de compilacao; o budget nao foi aumentado para esconder os avisos.
- npm install informou vulnerabilidades na arvore de dependencias existente. Nao foi
  executado npm audit fix --force, por poder quebrar Angular/Ionic e fugir do escopo.
- Testes de navegador foram Chromium, nao dispositivos iOS fisicos nem ensaio de carga.
- Nao houve disparo manual de WhatsApp/app nesta validacao. O preview da API utiliza
  scripts/serve-preview.cjs, que nao inicia o worker de notificacoes. Esse helper e
  somente para teste; npm start continua sendo o servidor normal.

