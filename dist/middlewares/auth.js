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
const pool_1 = require("../database/pool");
async function authenticate(req, _res, next) {
    const authorization = req.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) {
        next((0, http_error_1.unauthorized)('Token nao informado.'));
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
        if (!payload.jti)
            throw (0, http_error_1.unauthorized)('Sessao invalida ou expirada.');
        const active = await (0, pool_1.query)(`select u.id as usuario_id, e.id as empresa_id, ue.id as usuario_empresa_id, ue.perfil,
               ue.master, u.nome, u.login::text, u.senha_temporaria
          from odonto.login_sessions ls
          join odonto.usuarios u on u.id = ls.usuario_id and u.ativo
          join odonto.usuario_empresas ue on ue.id = ls.usuario_empresa_id
            and ue.usuario_id = u.id and ue.empresa_id = ls.empresa_id and ue.ativo
          join odonto.empresas e on e.id = ue.empresa_id and e.ativo
         where ls.jwt_id = $1 and ls.usuario_id = $2 and ls.empresa_id = $3
           and ls.ativo and ls.expires_at > now()
         limit 1`, [payload.jti, payload.usuarioId, payload.empresaId]);
        if (!active.rowCount)
            throw (0, http_error_1.unauthorized)('Sessao revogada, bloqueada ou expirada.');
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
        void (0, pool_1.query)(`update odonto.login_sessions set last_seen_at = now()
      where jwt_id = $1 and last_seen_at < now() - interval '5 minutes'`, [payload.jti]).catch(() => undefined);
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
