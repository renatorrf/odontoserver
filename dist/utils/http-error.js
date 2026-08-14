"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.badRequest = badRequest;
exports.unauthorized = unauthorized;
exports.forbidden = forbidden;
exports.conflict = conflict;
exports.notFound = notFound;
class HttpError extends Error {
    statusCode;
    details;
    constructor(statusCode, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.HttpError = HttpError;
function badRequest(message, details) {
    return new HttpError(400, message, details);
}
function unauthorized(message = 'Acesso nao autorizado.') {
    return new HttpError(401, message);
}
function forbidden(message = 'Operacao nao permitida.') {
    return new HttpError(403, message);
}
function conflict(message) {
    return new HttpError(409, message);
}
function notFound(message = 'Registro nao encontrado.') {
    return new HttpError(404, message);
}
