import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../utils/http-error';

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

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    next(unauthorized('Token nao informado.'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;

    req.auth = {
      usuarioId: payload.usuarioId,
      empresaId: payload.empresaId,
      usuarioEmpresaId: payload.usuarioEmpresaId,
      perfil: payload.perfil,
      master: payload.master,
      nome: payload.nome,
      login: payload.login,
      senhaTemporaria: payload.senhaTemporaria,
      pacienteId: payload.pacienteId ?? null,
    };

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
