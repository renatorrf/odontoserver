"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requirePerfil = requirePerfil;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const http_error_1 = require("../utils/http-error");
function authenticate(req, _res, next) {
    const authorization = req.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) {
        next((0, http_error_1.unauthorized)('Token nao informado.'));
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
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
    }
    catch {
        next((0, http_error_1.unauthorized)('Token invalido ou expirado.'));
    }
}
function requirePerfil(perfis) {
    return (req, _res, next) => {
        const perfil = req.auth?.perfil;
        if (!perfil || !perfis.includes(perfil)) {
            next((0, http_error_1.forbidden)());
            return;
        }
        next();
    };
}
