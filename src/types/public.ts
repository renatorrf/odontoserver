export interface AuthContext {
  usuarioId: string;
  empresaId: string;
  usuarioEmpresaId: string;
  perfil: 'portal_admin' | 'gestor' | 'dentista' | 'atendente' | 'paciente';
  master: boolean;
  nome: string;
  login: string;
  senhaTemporaria?: boolean;
  pacienteId?: string | null;
}
