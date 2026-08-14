"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapGestor = bootstrapGestor;
exports.login = login;
exports.loginPaciente = loginPaciente;
exports.changePassword = changePassword;
exports.requestPasswordReset = requestPasswordReset;
exports.resetPassword = resetPassword;
exports.createGestor = createGestor;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const node_crypto_1 = __importStar(require("node:crypto"));
const env_1 = require("../../config/env");
const pool_1 = require("../../database/pool");
const email_service_1 = require("../../services/email.service");
const http_error_1 = require("../../utils/http-error");
const normalize_1 = require("../../utils/normalize");
function normalizeLogin(login) {
    return login.trim().toLowerCase();
}
function hashResetToken(token) {
    return node_crypto_1.default.createHash('sha256').update(token, 'utf8').digest('hex');
}
function mapMembership(row) {
    return {
        usuarioId: row.usuario_id,
        usuarioEmpresaId: row.usuario_empresa_id,
        empresaId: row.empresa_id,
        perfil: row.perfil,
        master: row.master,
        nome: row.nome,
        login: row.login,
        senhaTemporaria: row.senha_temporaria,
        pacienteId: row.paciente_id,
    };
}
async function saveSession(client, auth, jwtId, expiresAt) {
    await client.query(`
      insert into odonto.login_sessions (
        usuario_id,
        empresa_id,
        usuario_empresa_id,
        jwt_id,
        ativo,
        expires_at
      )
      values ($1, $2, $3, $4, true, $5)
    `, [auth.usuarioId, auth.empresaId, auth.usuarioEmpresaId, jwtId, expiresAt]);
}
function signSession(row) {
    const jwtId = (0, node_crypto_1.randomUUID)();
    const auth = mapMembership(row);
    const token = jsonwebtoken_1.default.sign(auth, env_1.env.jwtSecret, {
        expiresIn: env_1.env.jwtExpiresIn,
        jwtid: jwtId,
        subject: auth.usuarioId,
    });
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded?.exp) {
        throw new Error('Token gerado sem expiracao.');
    }
    return {
        token,
        jwtId,
        expiresAt: new Date(decoded.exp * 1000),
    };
}
function toAuthenticatedSession(row, token, expiresAt) {
    return {
        token,
        expiresAt: expiresAt.toISOString(),
        user: {
            id: row.usuario_id,
            nome: row.nome,
            login: row.login,
            email: row.email,
            perfil: row.perfil,
            master: row.master,
            empresaId: row.empresa_id,
            empresaNome: row.nome_fantasia,
            senhaTemporaria: row.senha_temporaria,
            pacienteId: row.paciente_id,
        },
    };
}
async function createSession(row) {
    return (0, pool_1.transaction)(async (client) => {
        const session = signSession(row);
        const auth = mapMembership(row);
        await saveSession(client, auth, session.jwtId, session.expiresAt);
        await client.query('update odonto.usuarios set ultimo_acesso_em = now() where id = $1', [auth.usuarioId]);
        return toAuthenticatedSession(row, session.token, session.expiresAt);
    });
}
async function bootstrapGestor(input) {
    return (0, pool_1.transaction)(async (client) => {
        const empresaResult = await client.query(`
        insert into odonto.empresas (
          nome_fantasia,
          razao_social,
          cnpj,
          cnpj_normalizado,
          email,
          telefone
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id, nome_fantasia
      `, [
            input.empresa.nomeFantasia,
            (0, normalize_1.optionalText)(input.empresa.razaoSocial),
            (0, normalize_1.optionalText)(input.empresa.cnpj),
            (0, normalize_1.onlyDigits)(input.empresa.cnpj),
            (0, normalize_1.optionalText)(input.empresa.email)?.toLowerCase() ?? null,
            (0, normalize_1.optionalText)(input.empresa.telefone),
        ]);
        const empresa = empresaResult.rows[0];
        const senhaHash = await bcryptjs_1.default.hash(input.gestor.password, env_1.env.bcryptRounds);
        const usuarioResult = await client.query(`
        insert into odonto.usuarios (
          nome,
          login,
          email,
          cpf,
          cpf_normalizado,
          telefone,
          senha_hash
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id, nome, login, email, senha_temporaria
      `, [
            input.gestor.nome,
            normalizeLogin(input.gestor.login),
            (0, normalize_1.optionalText)(input.gestor.email)?.toLowerCase() ?? null,
            (0, normalize_1.optionalText)(input.gestor.cpf),
            (0, normalize_1.onlyDigits)(input.gestor.cpf),
            (0, normalize_1.optionalText)(input.gestor.telefone),
            senhaHash,
        ]);
        const usuario = usuarioResult.rows[0];
        const vinculoResult = await client.query(`
        insert into odonto.usuario_empresas (
          usuario_id,
          empresa_id,
          perfil,
          master
        )
        values ($1, $2, 'gestor', true)
        returning id, perfil, master
      `, [usuario.id, empresa.id]);
        const row = {
            usuario_id: usuario.id,
            usuario_empresa_id: vinculoResult.rows[0].id,
            empresa_id: empresa.id,
            paciente_id: null,
            nome: usuario.nome,
            login: usuario.login,
            email: usuario.email,
            senha_hash: senhaHash,
            senha_temporaria: Boolean(usuario.senha_temporaria),
            perfil: vinculoResult.rows[0].perfil,
            master: vinculoResult.rows[0].master,
            nome_fantasia: empresa.nome_fantasia,
        };
        const session = signSession(row);
        await saveSession(client, mapMembership(row), session.jwtId, session.expiresAt);
        return toAuthenticatedSession(row, session.token, session.expiresAt);
    }).catch((error) => {
        if (error.code === '23505') {
            throw (0, http_error_1.conflict)('Empresa, login, email ou CPF ja cadastrado.');
        }
        throw error;
    });
}
async function getMembershipsByLogin(login, empresaId, perfis) {
    const result = await (0, pool_1.query)(`
      select
        u.id as usuario_id,
        ue.id as usuario_empresa_id,
        e.id as empresa_id,
        null::uuid as paciente_id,
        u.nome,
        u.login,
        u.email,
        u.senha_hash,
        u.senha_temporaria,
        ue.perfil,
        ue.master,
        e.nome_fantasia
      from odonto.usuarios u
      inner join odonto.usuario_empresas ue on ue.usuario_id = u.id
      inner join odonto.empresas e on e.id = ue.empresa_id
      where lower(u.login::text) = lower($1)
        and u.ativo = true
        and ue.ativo = true
        and e.ativo = true
        and ue.perfil::text = any($3::text[])
        and ($2::uuid is null or e.id = $2::uuid)
      order by ue.master desc, e.nome_fantasia asc
    `, [normalizeLogin(login), empresaId ?? null, perfis]);
    return result.rows;
}
async function getPatientMemberships(input) {
    const cpf = (0, normalize_1.onlyDigits)(input.cpf);
    if (!cpf) {
        return [];
    }
    const result = await (0, pool_1.query)(`
      select
        u.id as usuario_id,
        ue.id as usuario_empresa_id,
        e.id as empresa_id,
        p.id as paciente_id,
        u.nome,
        u.login,
        coalesce(u.email, pc.email) as email,
        u.senha_hash,
        u.senha_temporaria,
        ue.perfil,
        ue.master,
        e.nome_fantasia
      from odonto.usuarios u
      inner join odonto.usuario_empresas ue on ue.usuario_id = u.id and ue.perfil = 'paciente'
      inner join odonto.empresas e on e.id = ue.empresa_id
      inner join odonto.pacientes p on p.usuario_id = u.id and p.empresa_id = e.id
      left join odonto.paciente_contatos pc on pc.paciente_id = p.id
      where (u.cpf_normalizado = $1 or u.login::text = $1)
        and u.ativo = true
        and ue.ativo = true
        and e.ativo = true
        and p.status = 'ativo'
        and ($2::uuid is null or e.id = $2::uuid)
      order by e.nome_fantasia asc
    `, [cpf, input.empresaId ?? null]);
    return result.rows;
}
async function resolveLogin(memberships, password, empresaId) {
    if (!memberships.length) {
        throw (0, http_error_1.unauthorized)('Usuario ou senha invalidos.');
    }
    const passwordOk = await bcryptjs_1.default.compare(password, memberships[0].senha_hash);
    if (!passwordOk) {
        throw (0, http_error_1.unauthorized)('Usuario ou senha invalidos.');
    }
    if (!empresaId && memberships.length > 1) {
        return {
            needsEmpresaSelection: true,
            empresas: memberships.map((row) => ({
                id: row.empresa_id,
                nome: row.nome_fantasia,
                perfil: row.perfil,
            })),
        };
    }
    return createSession(memberships[0]);
}
async function login(input) {
    const memberships = await getMembershipsByLogin(input.login, input.empresaId, [
        'portal_admin',
        'gestor',
        'dentista',
        'atendente',
    ]);
    return resolveLogin(memberships, input.password, input.empresaId);
}
async function loginPaciente(input) {
    const memberships = await getPatientMemberships(input);
    return resolveLogin(memberships, input.password, input.empresaId);
}
async function changePassword(auth, input) {
    const result = await (0, pool_1.query)('select senha_hash from odonto.usuarios where id = $1 limit 1', [
        auth.usuarioId,
    ]);
    const user = result.rows[0];
    if (!user) {
        throw (0, http_error_1.unauthorized)();
    }
    const passwordOk = await bcryptjs_1.default.compare(input.currentPassword, user.senha_hash);
    if (!passwordOk) {
        throw (0, http_error_1.unauthorized)('Senha atual invalida.');
    }
    const senhaHash = await bcryptjs_1.default.hash(input.newPassword, env_1.env.bcryptRounds);
    await (0, pool_1.query)(`
      update odonto.usuarios
      set senha_hash = $2,
          senha_temporaria = false,
          senha_alterada_em = now()
      where id = $1
    `, [auth.usuarioId, senhaHash]);
}
async function requestPasswordReset(input) {
    const email = (0, normalize_1.optionalText)(input.email)?.toLowerCase() ?? null;
    const cpf = (0, normalize_1.onlyDigits)(input.cpf);
    const loginValue = (0, normalize_1.optionalText)(input.login)?.toLowerCase() ?? null;
    const result = await (0, pool_1.query)(`
      select
        u.id as usuario_id,
        ue.empresa_id,
        u.nome,
        coalesce(u.email, pc.email) as email_destino
      from odonto.usuarios u
      left join odonto.usuario_empresas ue on ue.usuario_id = u.id and ue.ativo = true
      left join odonto.pacientes p on p.usuario_id = u.id and p.empresa_id = ue.empresa_id
      left join odonto.paciente_contatos pc on pc.paciente_id = p.id
      where u.ativo = true
        and (
          ($1::text is not null and lower(u.email::text) = $1)
          or ($2::text is not null and u.cpf_normalizado = $2)
          or ($3::text is not null and lower(u.login::text) = $3)
        )
      order by ue.created_at desc nulls last
      limit 1
    `, [email, cpf, loginValue]);
    const user = result.rows[0];
    if (!user?.email_destino) {
        return;
    }
    const token = node_crypto_1.default.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const resetUrl = `${env_1.env.passwordResetBaseUrl}?token=${encodeURIComponent(token)}`;
    await (0, pool_1.query)(`
      insert into odonto.password_reset_tokens (
        usuario_id,
        empresa_id,
        token_hash,
        expires_at
      )
      values ($1, $2, $3, now() + interval '30 minutes')
    `, [user.usuario_id, user.empresa_id, tokenHash]);
    await (0, email_service_1.sendMail)({
        to: user.email_destino,
        subject: 'Redefinicao de senha - Odonto PWA',
        text: `Ola, ${user.nome}. Acesse ${resetUrl} para redefinir sua senha. O link expira em 30 minutos.`,
        html: `
      <p>Ola, ${user.nome}.</p>
      <p>Use o link abaixo para redefinir sua senha. Ele expira em 30 minutos.</p>
      <p><a href="${resetUrl}">Redefinir senha</a></p>
    `,
    });
}
async function resetPassword(input) {
    const tokenHash = hashResetToken(input.token);
    const senhaHash = await bcryptjs_1.default.hash(input.newPassword, env_1.env.bcryptRounds);
    await (0, pool_1.transaction)(async (client) => {
        const result = await client.query(`
        select id, usuario_id
        from odonto.password_reset_tokens
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        limit 1
      `, [tokenHash]);
        const token = result.rows[0];
        if (!token) {
            throw (0, http_error_1.unauthorized)('Token invalido ou expirado.');
        }
        await client.query(`
        update odonto.usuarios
        set senha_hash = $2,
            senha_temporaria = false,
            senha_alterada_em = now()
        where id = $1
      `, [token.usuario_id, senhaHash]);
        await client.query('update odonto.password_reset_tokens set used_at = now() where id = $1', [token.id]);
    });
}
async function createGestor(auth, input) {
    if (auth.perfil !== 'portal_admin' && !(auth.perfil === 'gestor' && auth.master)) {
        throw (0, http_error_1.forbidden)('Apenas gestor master pode criar novos gestores.');
    }
    return (0, pool_1.transaction)(async (client) => {
        const senhaHash = await bcryptjs_1.default.hash(input.password, env_1.env.bcryptRounds);
        const usuarioResult = await client.query(`
        insert into odonto.usuarios (
          nome,
          login,
          email,
          cpf,
          cpf_normalizado,
          telefone,
          senha_hash
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id, nome, login
      `, [
            input.nome,
            normalizeLogin(input.login),
            (0, normalize_1.optionalText)(input.email)?.toLowerCase() ?? null,
            (0, normalize_1.optionalText)(input.cpf),
            (0, normalize_1.onlyDigits)(input.cpf),
            (0, normalize_1.optionalText)(input.telefone),
            senhaHash,
        ]);
        const usuario = usuarioResult.rows[0];
        const vinculoResult = await client.query(`
        insert into odonto.usuario_empresas (
          usuario_id,
          empresa_id,
          perfil,
          master
        )
        values ($1, $2, $3, $4)
        returning perfil
      `, [usuario.id, auth.empresaId, input.perfil, input.master]);
        return {
            id: usuario.id,
            nome: usuario.nome,
            login: usuario.login,
            perfil: vinculoResult.rows[0].perfil,
        };
    }).catch((error) => {
        if (error.code === '23505') {
            throw (0, http_error_1.conflict)('Login, email ou CPF ja cadastrado.');
        }
        throw error;
    });
}
