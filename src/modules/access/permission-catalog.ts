import { AuthContext } from '../../types/public';

export type PermissionKind = 'menu' | 'acao';

export interface PermissionDefinition {
  key: string;
  grupo: string;
  label: string;
  descricao: string;
  tipo: PermissionKind;
  sensivel?: boolean;
}

export const PERMISSIONS = [
  { key: 'menu.inicio', grupo: 'Principal', label: 'Menu inicial', descricao: 'Visualizar o menu inicial.', tipo: 'menu' },
  { key: 'menu.painel_estrategico', grupo: 'Principal', label: 'Painel estrategico', descricao: 'Visualizar indicadores consolidados.', tipo: 'menu' },
  { key: 'menu.pacientes', grupo: 'Cadastros', label: 'Pacientes', descricao: 'Acessar cadastros e historicos de pacientes.', tipo: 'menu' },
  { key: 'pacientes.editar', grupo: 'Cadastros', label: 'Editar pacientes', descricao: 'Criar, alterar e inativar pacientes.', tipo: 'acao' },
  { key: 'pacientes.clinico.editar', grupo: 'Cadastros', label: 'Registrar dados clinicos', descricao: 'Criar e alterar anamneses e documentos clinicos.', tipo: 'acao' },
  { key: 'menu.profissionais', grupo: 'Cadastros', label: 'Profissionais', descricao: 'Acessar profissionais, agenda e comissoes.', tipo: 'menu' },
  { key: 'profissionais.editar', grupo: 'Cadastros', label: 'Editar profissionais', descricao: 'Criar e alterar profissionais.', tipo: 'acao' },
  { key: 'menu.procedimentos', grupo: 'Cadastros', label: 'Procedimentos', descricao: 'Consultar o catalogo de procedimentos.', tipo: 'menu' },
  { key: 'procedimentos.editar', grupo: 'Cadastros', label: 'Editar procedimentos', descricao: 'Alterar valores, duracoes e classificacoes.', tipo: 'acao', sensivel: true },
  { key: 'menu.agenda', grupo: 'Agenda', label: 'Agenda', descricao: 'Visualizar a agenda da clinica.', tipo: 'menu' },
  { key: 'agenda.editar', grupo: 'Agenda', label: 'Operar agenda', descricao: 'Criar, remarcar, cancelar e concluir atendimentos.', tipo: 'acao' },
  { key: 'menu.ortodontia', grupo: 'Agenda', label: 'Ortodontia', descricao: 'Acessar retornos ortodonticos.', tipo: 'menu' },
  { key: 'menu.caixa', grupo: 'Financeiro', label: 'Caixa diario', descricao: 'Visualizar recebimentos e saidas do dia.', tipo: 'menu' },
  { key: 'menu.contas_receber', grupo: 'Financeiro', label: 'Contas a receber', descricao: 'Visualizar titulos e saldos de pacientes.', tipo: 'menu' },
  { key: 'financeiro.recebimentos.registrar', grupo: 'Financeiro', label: 'Registrar recebimentos', descricao: 'Baixar titulos na data corrente.', tipo: 'acao', sensivel: true },
  { key: 'financeiro.recebimentos.retroativo.solicitar', grupo: 'Financeiro', label: 'Solicitar baixa retroativa', descricao: 'Enviar uma baixa retroativa para dupla autorizacao.', tipo: 'acao', sensivel: true },
  { key: 'financeiro.recebimentos.estornar', grupo: 'Financeiro', label: 'Estornar recebimentos', descricao: 'Estornar recebimentos da data corrente.', tipo: 'acao', sensivel: true },
  { key: 'menu.conciliacao', grupo: 'Financeiro', label: 'Conciliacao bancaria', descricao: 'Visualizar movimentos e extratos.', tipo: 'menu' },
  { key: 'financeiro.conciliacao.importar', grupo: 'Financeiro', label: 'Importar OFX', descricao: 'Importar extratos bancarios.', tipo: 'acao', sensivel: true },
  { key: 'financeiro.conciliacao.conciliar', grupo: 'Financeiro', label: 'Conciliar movimentos', descricao: 'Relacionar movimentos do sistema ao extrato.', tipo: 'acao', sensivel: true },
  { key: 'financeiro.conciliacao.desfazer.solicitar', grupo: 'Financeiro', label: 'Solicitar desconciliacao', descricao: 'Solicitar autorizacao para desfazer uma conciliacao.', tipo: 'acao', sensivel: true },
  { key: 'menu.apuracao', grupo: 'Financeiro', label: 'Apuracao profissional', descricao: 'Visualizar producao e comissoes.', tipo: 'menu' },
  { key: 'financeiro.pagamentos.registrar', grupo: 'Financeiro', label: 'Pagar profissionais', descricao: 'Liquidar comissoes na data corrente.', tipo: 'acao', sensivel: true },
  { key: 'financeiro.pagamentos.retroativo.solicitar', grupo: 'Financeiro', label: 'Solicitar pagamento retroativo', descricao: 'Enviar pagamento retroativo para autorizacao.', tipo: 'acao', sensivel: true },
  { key: 'menu.projecao', grupo: 'Financeiro', label: 'Receita futura', descricao: 'Visualizar projecao de agenda e receita.', tipo: 'menu' },
  { key: 'projecao.notificar', grupo: 'Financeiro', label: 'Notificar agenda futura', descricao: 'Enviar lembretes por aplicativo ou WhatsApp a partir da projecao.', tipo: 'acao' },
  { key: 'menu.despesas', grupo: 'Financeiro', label: 'Despesas', descricao: 'Visualizar despesas da empresa.', tipo: 'menu' },
  { key: 'financeiro.despesas.editar', grupo: 'Financeiro', label: 'Operar despesas', descricao: 'Criar, alterar, pagar e cancelar despesas.', tipo: 'acao', sensivel: true },
  { key: 'financeiro.despesas.retroativo.solicitar', grupo: 'Financeiro', label: 'Solicitar pagamento retroativo de despesa', descricao: 'Enviar baixa retroativa de despesa para autorizacao.', tipo: 'acao', sensivel: true },
  { key: 'menu.bancos', grupo: 'Financeiro', label: 'Contas bancarias', descricao: 'Visualizar contas bancarias.', tipo: 'menu' },
  { key: 'financeiro.bancos.editar', grupo: 'Financeiro', label: 'Editar contas bancarias', descricao: 'Criar e alterar contas bancarias.', tipo: 'acao', sensivel: true },
  { key: 'menu.custo_basal', grupo: 'Financeiro', label: 'Custo basal', descricao: 'Visualizar custos operacionais.', tipo: 'menu' },
  { key: 'menu.dre', grupo: 'Financeiro', label: 'DRE simplificada', descricao: 'Visualizar demonstrativo de resultado.', tipo: 'menu' },
  { key: 'menu.resultados', grupo: 'Resultados', label: 'Desempenho', descricao: 'Visualizar resultados da operacao.', tipo: 'menu' },
  { key: 'menu.comercial', grupo: 'Comercial', label: 'Comercial', descricao: 'Acessar pasta vermelha e orcamentos.', tipo: 'menu' },
  { key: 'comercial.editar', grupo: 'Comercial', label: 'Operar comercial', descricao: 'Criar orcamentos, descontos e comunicacoes.', tipo: 'acao' },
  { key: 'menu.configuracoes', grupo: 'Administracao', label: 'Configuracoes', descricao: 'Acessar configuracoes da empresa.', tipo: 'menu' },
  { key: 'configuracoes.integracoes.editar', grupo: 'Administracao', label: 'Editar integracoes', descricao: 'Alterar credenciais de WhatsApp e e-mail.', tipo: 'acao', sensivel: true },
  { key: 'menu.usuarios', grupo: 'Administracao', label: 'Usuarios e acessos', descricao: 'Acessar usuarios, perfis e autorizacoes.', tipo: 'menu' },
  { key: 'usuarios.visualizar', grupo: 'Administracao', label: 'Visualizar usuarios', descricao: 'Consultar usuarios e seus perfis.', tipo: 'acao' },
  { key: 'usuarios.gerenciar', grupo: 'Administracao', label: 'Gerenciar usuarios', descricao: 'Criar, editar, bloquear e redefinir acessos.', tipo: 'acao', sensivel: true },
  { key: 'perfis.gerenciar', grupo: 'Administracao', label: 'Gerenciar perfis', descricao: 'Criar perfis e distribuir permissoes.', tipo: 'acao', sensivel: true },
  { key: 'aprovacoes.financeiras.aprovar', grupo: 'Administracao', label: 'Autorizar operacoes financeiras', descricao: 'Aprovar ou rejeitar solicitacoes de outro usuario.', tipo: 'acao', sensivel: true },
  { key: 'auditoria.visualizar', grupo: 'Administracao', label: 'Visualizar auditoria', descricao: 'Consultar trilhas de alteracoes e decisoes.', tipo: 'acao', sensivel: true },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key) as PermissionKey[];

export const SENSITIVE_GRANT_KEYS = new Set<PermissionKey>([
  'perfis.gerenciar',
  'usuarios.gerenciar',
  'aprovacoes.financeiras.aprovar',
  'configuracoes.integracoes.editar',
  'auditoria.visualizar',
]);

export const DEFAULT_PROFILE_PERMISSIONS: Record<'administrador' | 'atendimento' | 'clinico' | 'financeiro', PermissionKey[]> = {
  administrador: ALL_PERMISSION_KEYS,
  atendimento: [
    'menu.inicio', 'menu.pacientes', 'pacientes.editar', 'menu.procedimentos', 'menu.agenda', 'agenda.editar',
    'menu.ortodontia', 'menu.caixa', 'menu.contas_receber', 'financeiro.recebimentos.registrar',
    'financeiro.recebimentos.retroativo.solicitar', 'menu.projecao', 'projecao.notificar',
    'menu.comercial', 'comercial.editar',
  ],
  clinico: [
    'menu.inicio', 'menu.pacientes', 'pacientes.clinico.editar', 'menu.procedimentos', 'menu.agenda', 'agenda.editar',
    'menu.ortodontia', 'menu.resultados',
  ],
  financeiro: [
    'menu.inicio', 'menu.painel_estrategico', 'menu.caixa', 'menu.contas_receber',
    'financeiro.recebimentos.registrar', 'financeiro.recebimentos.retroativo.solicitar',
    'financeiro.recebimentos.estornar', 'menu.conciliacao', 'financeiro.conciliacao.importar',
    'financeiro.conciliacao.conciliar', 'financeiro.conciliacao.desfazer.solicitar', 'menu.apuracao',
    'financeiro.pagamentos.registrar', 'financeiro.pagamentos.retroativo.solicitar', 'menu.projecao',
    'menu.despesas', 'financeiro.despesas.editar', 'financeiro.despesas.retroativo.solicitar', 'menu.bancos', 'financeiro.bancos.editar',
    'menu.custo_basal', 'menu.dre', 'menu.resultados',
  ],
};

export function fallbackPermissions(perfil: AuthContext['perfil']): PermissionKey[] {
  if (perfil === 'portal_admin' || perfil === 'gestor') return ALL_PERMISSION_KEYS;
  if (perfil === 'atendente') return DEFAULT_PROFILE_PERMISSIONS.atendimento;
  if (perfil === 'dentista') return DEFAULT_PROFILE_PERMISSIONS.clinico;
  return [];
}

export function isPermissionKey(value: string): value is PermissionKey {
  return ALL_PERMISSION_KEYS.includes(value as PermissionKey);
}
