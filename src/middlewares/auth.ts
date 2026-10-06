import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../utils/http-error';
import { query } from '../database/pool';

type Perfil = NonNullable<Request['auth']>['perfil'];

interface AuthPayload extends jwt.JwtPayload {
  usuarioId: string;
  empresaId: string;
  usuarioEmpresaId: string;
  perfil: Perfil;
  master: boolean;
  nome: string;
  login: string;
  senhaTemporaria?: boolean;
  pacienteId?: string | null;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authorization = req.headers.authorization ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    next(unauthorized('Token nao informado.'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    if (!payload.jti) throw unauthorized('Sessao invalida ou expirada.');
    const active = await query<{
      usuario_id: string; empresa_id: string; usuario_empresa_id: string; perfil: Perfil;
      master: boolean; nome: string; login: string; senha_temporaria: boolean;
    }>(`select u.id as usuario_id, e.id as empresa_id, ue.id as usuario_empresa_id, ue.perfil,
               ue.master, u.nome, u.login::text, u.senha_temporaria
          from odonto.login_sessions ls
          join odonto.usuarios u on u.id = ls.usuario_id and u.ativo
          join odonto.usuario_empresas ue on ue.id = ls.usuario_empresa_id
            and ue.usuario_id = u.id and ue.empresa_id = ls.empresa_id and ue.ativo
          join odonto.empresas e on e.id = ue.empresa_id and e.ativo
         where ls.jwt_id = $1 and ls.usuario_id = $2 and ls.empresa_id = $3
           and ls.ativo and ls.expires_at > now()
         limit 1`, [payload.jti, payload.usuarioId, payload.empresaId]);
    if (!active.rowCount) throw unauthorized('Sessao revogada, bloqueada ou expirada.');
    const current = active.rows[0];

    req.auth = {
      usuarioId: current.usuario_id,
      empresaId: current.empresa_id,
      usuarioEmpresaId: current.usuario_empresa_id,
      perfil: current.perfil,
      master: current.master,
      nome: current.nome,
      login: current.login,
      senhaTemporaria: current.senha_temporaria,
      pacienteId: payload.pacienteId ?? null,
    };

    void query(`update odonto.login_sessions set last_seen_at = now()
      where jwt_id = $1 and last_seen_at < now() - interval '5 minutes'`, [payload.jti]).catch(() => undefined);

    next();
  } catch {
    next(unauthorized('Token invalido ou expirado.'));
  }
}

export function requirePerfil(perfis: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const perfil = req.auth?.perfil;

    if (!perfil || !perfis.includes(perfil)) {
      next(forbidden());
      return;
    }

    next();
  };
}
