import { NextFunction, Request, Response } from 'express';
import { hasAccessPermission } from '../modules/access/access-control.service';
import { PermissionKey } from '../modules/access/permission-catalog';
import { forbidden, unauthorized } from '../utils/http-error';

export function requirePermission(...permissions: PermissionKey[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw unauthorized();
      for (const permission of permissions) {
        if (await hasAccessPermission(req.auth, permission)) {
          next();
          return;
        }
      }
      next(forbidden('Seu perfil nao possui permissao para esta operacao.'));
    } catch (error) {
      next(error);
    }
  };
}

export function requireWritePermission(permission: PermissionKey) {
  const check = requirePermission(permission);
  return (req: Request, res: Response, next: NextFunction): void | Promise<void> => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    return check(req, res, next);
  };
}
