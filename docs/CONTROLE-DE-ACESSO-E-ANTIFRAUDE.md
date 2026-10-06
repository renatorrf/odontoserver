# Controle de acesso e diretrizes antifraude

## Objetivo

Este documento define as regras obrigatorias para acesso, autorizacao e auditoria das operacoes do Odonto. O backend e a autoridade final: ocultar menus ou botoes no frontend melhora a experiencia, mas nunca substitui a validacao no servidor.

## Principios obrigatorios

1. **Menor privilegio:** cada usuario recebe somente as permissoes necessarias para sua funcao.
2. **Segregacao de funcoes:** quem solicita uma operacao excepcional nao pode aprova-la.
3. **Dupla autorizacao:** operacoes retroativas ou que desfazem conciliacao exigem decisao de outro gestor autorizado.
4. **Isolamento por empresa:** usuario, perfil, solicitacao, aprovacao e auditoria sempre usam o `empresa_id` obtido da sessao autenticada.
5. **Trilha imutavel:** eventos de aprovacao e auditoria nao podem ser alterados nem excluidos.
6. **Sem exclusao financeira:** recebimentos, pagamentos e conciliacoes sao estornados ou desfeitos por eventos compensatorios; nunca apagados.
7. **Sessao revogavel:** bloquear usuario ou alterar seu perfil encerra as sessoes vigentes imediatamente.
8. **Motivo obrigatorio:** excecoes financeiras devem registrar justificativa objetiva antes de serem submetidas.

## Perfis iniciais

| Perfil | Escopo recomendado | Restricoes principais |
| --- | --- | --- |
| Administrador da clinica | Configuracao da empresa, usuarios, perfis e operacao geral | Nao pode aprovar a propria solicitacao |
| Atendimento | Pacientes, agenda, orcamentos e recebimentos correntes | Sem perfis, integracoes, conciliacao ou pagamentos retroativos diretos |
| Profissional clinico | Agenda, historico e registros clinicos | Sem alteracao cadastral administrativa ou financeiro |
| Financeiro | Caixa, titulos, despesas, bancos, apuracao e conciliacao | Sem gestao de usuarios e sem autoaprovacao |

Perfis personalizados podem reduzir ou combinar acessos, desde que as permissoes administrativas sensiveis sejam concedidas somente por usuario master.

## Matriz das operacoes criticas

| Operacao | Permissao para solicitar/executar | Exigencia adicional |
| --- | --- | --- |
| Receber titulo na data atual | `financeiro.recebimentos.registrar` | Auditoria do usuario e horario |
| Receber titulo com data retroativa | `financeiro.recebimentos.retroativo.solicitar` | Aprovacao de outro usuario com `aprovacoes.financeiras.aprovar` |
| Estornar recebimento atual | `financeiro.recebimentos.estornar` | Justificativa e evento compensatorio |
| Estornar recebimento retroativo | `financeiro.recebimentos.estornar` | Aprovacao de outro gestor antes da execucao |
| Pagar profissional na data atual | `financeiro.pagamentos.registrar` | Auditoria do usuario, conta e valor |
| Pagar profissional retroativamente | `financeiro.pagamentos.retroativo.solicitar` | Aprovacao de outro gestor |
| Pagar despesa retroativamente | `financeiro.despesas.retroativo.solicitar` | Aprovacao de outro gestor |
| Importar OFX | `financeiro.conciliacao.importar` | Hash do arquivo e bloqueio de duplicidade |
| Conciliar movimento | `financeiro.conciliacao.conciliar` | Vinculos pertencentes a mesma empresa |
| Desfazer conciliacao | `financeiro.conciliacao.desfazer.solicitar` | Sempre exige aprovacao de outro gestor |
| Alterar valores de procedimentos | `procedimentos.editar` | Permissao sensivel e auditoria |
| Alterar integracoes | `configuracoes.integracoes.editar` | Somente valor mascarado em consultas; segredo nunca entra no log |
| Gerenciar usuarios e perfis | `usuarios.gerenciar` / `perfis.gerenciar` | Somente master concede permissoes administrativas sensiveis |

## Fluxo de autorizacao

1. O solicitante informa a operacao e uma justificativa.
2. O backend grava um retrato imutavel do payload e seu hash, com validade de 72 horas.
3. A fila exibe a solicitacao a outro usuario com permissao de aprovacao na mesma empresa.
4. O aprovador confere valor, data, beneficiario, conta e motivo antes de aprovar ou rejeitar.
5. Ao aprovar, o backend executa exclusivamente o payload armazenado; o frontend nao pode substitui-lo.
6. Solicitacao rejeitada, expirada, cancelada ou executada nao pode ser reutilizada.
7. Todas as transicoes registram usuario, data, IP, agente, justificativa e resultado.

## Regras de integridade

- Nao permitir autoaprovacao, mesmo para master.
- Nao permitir desativar o proprio usuario.
- Nao permitir desativar ou rebaixar o ultimo master ativo da empresa.
- Nao permitir perfil ativo de administrador sem todas as permissoes obrigatorias.
- Uma permissao de acao depende do respectivo menu; remover o menu remove suas acoes dependentes.
- Alterar perfil, bloqueio ou vinculo de usuario revoga todas as sessoes desse usuario.
- Valores monetarios, datas efetivas e contas bancarias sao validados novamente no momento da execucao.
- Toda consulta e mutacao deve filtrar pelo `empresa_id` da sessao, nunca pelo valor enviado pelo cliente.

## Operacoes proibidas

- Alterar diretamente data, valor ou titular de um lancamento financeiro ja efetivado.
- Excluir recebimento, pagamento, conciliacao, evento de aprovacao ou log de auditoria.
- Aprovar operacao solicitada pelo mesmo usuario.
- Editar o payload depois que a solicitacao foi criada.
- Compartilhar usuario ou usar contas genericas para atividades financeiras.
- Registrar tokens, senhas, chaves privadas ou dados completos de cartao nos logs.

## Revisao operacional

- Revisar mensalmente usuarios ativos, perfis e permissoes sensiveis.
- Revisar diariamente solicitacoes pendentes, expiradas e falhas de execucao.
- Confrontar caixa, contas a receber, extrato bancario e conciliacoes em fechamento diario.
- Investigar estornos, operacoes retroativas e desconciliacoes por usuario, data e justificativa.
- Bloquear imediatamente usuarios desligados e preservar seus registros de auditoria.
- Manter backup, retencao de logs e monitoramento de tentativas negadas conforme a politica da empresa.

