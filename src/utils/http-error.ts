export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = 'Acesso nao autorizado.'): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = 'Operacao nao permitida.'): HttpError {
  return new HttpError(403, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}

export function notFound(message = 'Registro nao encontrado.'): HttpError {
  return new HttpError(404, message);
}
