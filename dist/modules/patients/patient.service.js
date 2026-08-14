"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPatients = listPatients;
exports.getPatient = getPatient;
exports.createPatient = createPatient;
exports.createOrLinkMinimalPatient = createOrLinkMinimalPatient;
exports.updatePatient = updatePatient;
exports.inactivatePatient = inactivatePatient;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const env_1 = require("../../config/env");
const pool_1 = require("../../database/pool");
const http_error_1 = require("../../utils/http-error");
const normalize_1 = require("../../utils/normalize");
function trimState(value) {
    const text = (0, normalize_1.optionalText)(value)?.toUpperCase() ?? null;
    return text ? text.slice(0, 2) : null;
}
function emailFromInput(input) {
    if (input.contato.naoPossuiEmail) {
        return null;
    }
    return (0, normalize_1.optionalText)(input.contato.email)?.toLowerCase() ?? null;
}
async function ensurePatientPortalAccount(client, auth, input) {
    const cpf = (0, normalize_1.onlyDigits)(input.cpf);
    if (!cpf) {
        return null;
    }
    const existingUser = await client.query(`
      select id
      from odonto.usuarios
      where cpf_normalizado = $1 or login::text = $1
      limit 1
    `, [cpf]);
    const email = emailFromInput(input);
    let usuarioId = existingUser.rows[0]?.id ?? null;
    if (!usuarioId) {
        const senhaHash = await bcryptjs_1.default.hash(env_1.env.patientDefaultPassword, env_1.env.bcryptRounds);
        const userResult = await client.query(`
        insert into odonto.usuarios (
          nome,
          login,
          email,
          cpf,
          cpf_normalizado,
          telefone,
          senha_hash,
          senha_temporaria
        )
        values ($1, $2, $3, $4, $5, $6, $7, true)
        returning id
      `, [
            input.nome,
            cpf,
            email,
            (0, normalize_1.optionalText)(input.cpf),
            cpf,
            (0, normalize_1.optionalText)(input.contato.celular),
            senhaHash,
        ]);
        usuarioId = userResult.rows[0].id;
    }
    else {
        await client.query(`
        update odonto.usuarios
        set nome = $2,
            email = coalesce(email, $3),
            cpf = coalesce(cpf, $4),
            cpf_normalizado = coalesce(cpf_normalizado, $5),
            telefone = coalesce($6, telefone)
        where id = $1
      `, [usuarioId, input.nome, email, (0, normalize_1.optionalText)(input.cpf), cpf, (0, normalize_1.optionalText)(input.contato.celular)]);
    }
    const linkResult = await client.query(`
      select id, perfil
      from odonto.usuario_empresas
      where usuario_id = $1
        and empresa_id = $2
      limit 1
    `, [usuarioId, auth.empresaId]);
    const link = linkResult.rows[0];
    if (link && link.perfil !== 'paciente') {
        throw (0, http_error_1.conflict)('CPF ja vinculado a outro perfil nesta empresa.');
    }
    if (link) {
        await client.query('update odonto.usuario_empresas set ativo = true where id = $1', [link.id]);
    }
    else {
        await client.query(`
        insert into odonto.usuario_empresas (
          usuario_id,
          empresa_id,
          perfil,
          master,
          ativo
        )
        values ($1, $2, 'paciente', false, true)
      `, [usuarioId, auth.empresaId]);
    }
    return usuarioId;
}
async function upsertContato(client, pacienteId, input) {
    const contato = input.contato;
    await client.query(`
      insert into odonto.paciente_contatos (
        paciente_id,
        fone_fixo,
        celular_pais,
        celular,
        usar_celular_contato,
        celular_contato_de,
        outros_telefones,
        email,
        nao_possui_email
      )
      values ($1, $2, coalesce($3, 'BR'), $4, $5, $6, $7, $8, $9)
      on conflict (paciente_id) do update set
        fone_fixo = excluded.fone_fixo,
        celular_pais = excluded.celular_pais,
        celular = excluded.celular,
        usar_celular_contato = excluded.usar_celular_contato,
        celular_contato_de = excluded.celular_contato_de,
        outros_telefones = excluded.outros_telefones,
        email = excluded.email,
        nao_possui_email = excluded.nao_possui_email
    `, [
        pacienteId,
        (0, normalize_1.optionalText)(contato.foneFixo),
        (0, normalize_1.optionalText)(contato.celularPais),
        (0, normalize_1.optionalText)(contato.celular),
        contato.usarCelularContato,
        (0, normalize_1.optionalText)(contato.celularContatoDe),
        (0, normalize_1.optionalText)(contato.outrosTelefones),
        emailFromInput(input),
        contato.naoPossuiEmail,
    ]);
}
async function replaceEndereco(client, pacienteId, input) {
    const endereco = input.endereco;
    await client.query('delete from odonto.paciente_enderecos where paciente_id = $1 and principal = true', [pacienteId]);
    if (!(0, normalize_1.hasAnyValue)(endereco)) {
        return;
    }
    await client.query(`
      insert into odonto.paciente_enderecos (
        paciente_id,
        cep,
        cidade,
        estado,
        logradouro,
        numero,
        bairro,
        complemento
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
        pacienteId,
        (0, normalize_1.optionalText)(endereco.cep),
        (0, normalize_1.optionalText)(endereco.cidade),
        trimState(endereco.estado),
        (0, normalize_1.optionalText)(endereco.logradouro),
        (0, normalize_1.optionalText)(endereco.numero),
        (0, normalize_1.optionalText)(endereco.bairro),
        (0, normalize_1.optionalText)(endereco.complemento),
    ]);
}
async function upsertComplementares(client, pacienteId, input) {
    const complementares = input.complementares;
    if (!(0, normalize_1.hasAnyValue)(complementares)) {
        await client.query('delete from odonto.paciente_dados_complementares where paciente_id = $1', [pacienteId]);
        return;
    }
    await client.query(`
      insert into odonto.paciente_dados_complementares (
        paciente_id,
        profissao,
        local_trabalho,
        tempo_trabalho,
        nome_plano,
        numero_plano
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (paciente_id) do update set
        profissao = excluded.profissao,
        local_trabalho = excluded.local_trabalho,
        tempo_trabalho = excluded.tempo_trabalho,
        nome_plano = excluded.nome_plano,
        numero_plano = excluded.numero_plano
    `, [
        pacienteId,
        (0, normalize_1.optionalText)(complementares.profissao),
        (0, normalize_1.optionalText)(complementares.localTrabalho),
        (0, normalize_1.optionalText)(complementares.tempoTrabalho),
        (0, normalize_1.optionalText)(complementares.nomePlano),
        (0, normalize_1.optionalText)(complementares.numeroPlano),
    ]);
}
async function upsertFiliacao(client, pacienteId, input) {
    const filiacao = input.filiacao;
    if (!(0, normalize_1.hasAnyValue)(filiacao)) {
        await client.query('delete from odonto.paciente_filiacao where paciente_id = $1', [pacienteId]);
        return;
    }
    await client.query(`
      insert into odonto.paciente_filiacao (
        paciente_id,
        nome_pai,
        cpf_pai,
        cpf_pai_normalizado,
        rg_pai,
        profissao_pai,
        nome_mae,
        cpf_mae,
        cpf_mae_normalizado,
        rg_mae,
        profissao_mae
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict (paciente_id) do update set
        nome_pai = excluded.nome_pai,
        cpf_pai = excluded.cpf_pai,
        cpf_pai_normalizado = excluded.cpf_pai_normalizado,
        rg_pai = excluded.rg_pai,
        profissao_pai = excluded.profissao_pai,
        nome_mae = excluded.nome_mae,
        cpf_mae = excluded.cpf_mae,
        cpf_mae_normalizado = excluded.cpf_mae_normalizado,
        rg_mae = excluded.rg_mae,
        profissao_mae = excluded.profissao_mae
    `, [
        pacienteId,
        (0, normalize_1.optionalText)(filiacao.nomePai),
        (0, normalize_1.optionalText)(filiacao.cpfPai),
        (0, normalize_1.onlyDigits)(filiacao.cpfPai),
        (0, normalize_1.optionalText)(filiacao.rgPai),
        (0, normalize_1.optionalText)(filiacao.profissaoPai),
        (0, normalize_1.optionalText)(filiacao.nomeMae),
        (0, normalize_1.optionalText)(filiacao.cpfMae),
        (0, normalize_1.onlyDigits)(filiacao.cpfMae),
        (0, normalize_1.optionalText)(filiacao.rgMae),
        (0, normalize_1.optionalText)(filiacao.profissaoMae),
    ]);
}
async function replaceRepresentanteLegal(client, pacienteId, input) {
    const representante = input.representanteLegal;
    await client.query('delete from odonto.paciente_representantes_legais where paciente_id = $1 and principal = true', [
        pacienteId,
    ]);
    if (!(0, normalize_1.optionalText)(representante.nome)) {
        return;
    }
    await client.query(`
      insert into odonto.paciente_representantes_legais (
        paciente_id,
        nome,
        cpf,
        cpf_normalizado,
        rg,
        nascimento,
        telefone
      )
      values ($1, $2, $3, $4, $5, $6, $7)
    `, [
        pacienteId,
        (0, normalize_1.optionalText)(representante.nome),
        (0, normalize_1.optionalText)(representante.cpf),
        (0, normalize_1.onlyDigits)(representante.cpf),
        (0, normalize_1.optionalText)(representante.rg),
        (0, normalize_1.optionalDate)(representante.nascimento),
        (0, normalize_1.optionalText)(representante.telefone),
    ]);
}
function mapFullPatient(row) {
    return {
        id: row.id,
        numeroProntuario: row.numero_prontuario,
        nome: row.nome,
        apelido: row.apelido,
        nascimento: row.nascimento,
        sexo: row.sexo,
        cpf: row.cpf,
        rg: row.rg,
        estadoCivil: row.estado_civil,
        escolaridade: row.escolaridade,
        comoConheceu: row.como_conheceu,
        observacoes: row.observacoes,
        status: row.status,
        cadastradoEm: row.cadastrado_em,
        cadastroIncompleto: row.cadastro_incompleto,
        contato: {
            foneFixo: row.fone_fixo,
            celularPais: row.celular_pais,
            celular: row.celular,
            usarCelularContato: Boolean(row.usar_celular_contato),
            celularContatoDe: row.celular_contato_de,
            outrosTelefones: row.outros_telefones,
            email: row.email,
            naoPossuiEmail: Boolean(row.nao_possui_email),
        },
        endereco: {
            cep: row.cep,
            cidade: row.cidade,
            estado: row.estado,
            logradouro: row.logradouro,
            numero: row.numero,
            bairro: row.bairro,
            complemento: row.complemento,
        },
        complementares: {
            profissao: row.profissao,
            localTrabalho: row.local_trabalho,
            tempoTrabalho: row.tempo_trabalho,
            nomePlano: row.nome_plano,
            numeroPlano: row.numero_plano,
        },
        filiacao: {
            nomePai: row.nome_pai,
            cpfPai: row.cpf_pai,
            rgPai: row.rg_pai,
            profissaoPai: row.profissao_pai,
            nomeMae: row.nome_mae,
            cpfMae: row.cpf_mae,
            rgMae: row.rg_mae,
            profissaoMae: row.profissao_mae,
        },
        representanteLegal: {
            nome: row.representante_nome,
            cpf: row.representante_cpf,
            rg: row.representante_rg,
            nascimento: row.representante_nascimento,
            telefone: row.representante_telefone,
        },
    };
}
async function assertPatientExists(client, auth, patientId) {
    const result = await client.query('select id from odonto.pacientes where id = $1 and empresa_id = $2 limit 1', [
        patientId,
        auth.empresaId,
    ]);
    if (!result.rows.length) {
        throw (0, http_error_1.notFound)('Paciente nao encontrado.');
    }
}
async function listPatients(auth, params) {
    const search = (0, normalize_1.optionalText)(params.search);
    const result = await (0, pool_1.query)(`
      select
        p.id,
        p.numero_prontuario,
        p.nome,
        p.apelido,
        p.nascimento,
        p.sexo,
        p.cpf,
        p.rg,
        p.status,
        p.cadastrado_em,
        c.celular,
        c.email,
        e.cidade,
        e.estado
        ,p.cadastro_incompleto
      from odonto.pacientes p
      left join odonto.paciente_contatos c on c.paciente_id = p.id
      left join odonto.paciente_enderecos e on e.paciente_id = p.id and e.principal = true
      where p.empresa_id = $1
        and (
          $2::text is null
          or lower(p.nome) like lower('%' || $2 || '%')
          or p.cpf_normalizado like regexp_replace($2, '\\D', '', 'g') || '%'
          or p.numero_prontuario = $2
        )
      order by p.cadastrado_em desc
      limit 80
    `, [auth.empresaId, search]);
    return result.rows;
}
async function getPatient(auth, patientId) {
    const result = await (0, pool_1.query)(`
      select
        p.id,
        p.numero_prontuario,
        p.nome,
        p.apelido,
        p.nascimento,
        p.sexo,
        p.cpf,
        p.rg,
        p.estado_civil,
        p.escolaridade,
        p.como_conheceu,
        p.observacoes,
        p.status,
        p.cadastrado_em,
        p.cadastro_incompleto,
        c.fone_fixo,
        c.celular_pais,
        c.celular,
        c.usar_celular_contato,
        c.celular_contato_de,
        c.outros_telefones,
        c.email,
        c.nao_possui_email,
        e.cep,
        e.cidade,
        e.estado,
        e.logradouro,
        e.numero,
        e.bairro,
        e.complemento,
        dc.profissao,
        dc.local_trabalho,
        dc.tempo_trabalho,
        dc.nome_plano,
        dc.numero_plano,
        f.nome_pai,
        f.cpf_pai,
        f.rg_pai,
        f.profissao_pai,
        f.nome_mae,
        f.cpf_mae,
        f.rg_mae,
        f.profissao_mae,
        rl.nome as representante_nome,
        rl.cpf as representante_cpf,
        rl.rg as representante_rg,
        rl.nascimento as representante_nascimento,
        rl.telefone as representante_telefone
      from odonto.pacientes p
      left join odonto.paciente_contatos c on c.paciente_id = p.id
      left join odonto.paciente_enderecos e on e.paciente_id = p.id and e.principal = true
      left join odonto.paciente_dados_complementares dc on dc.paciente_id = p.id
      left join odonto.paciente_filiacao f on f.paciente_id = p.id
      left join odonto.paciente_representantes_legais rl on rl.paciente_id = p.id and rl.principal = true
      where p.id = $1
        and p.empresa_id = $2
      limit 1
    `, [patientId, auth.empresaId]);
    const row = result.rows[0];
    if (!row) {
        throw (0, http_error_1.notFound)('Paciente nao encontrado.');
    }
    return mapFullPatient(row);
}
async function createPatient(auth, input) {
    return (0, pool_1.transaction)(async (client) => {
        const usuarioId = await ensurePatientPortalAccount(client, auth, input);
        const pacienteResult = await client.query(`
        insert into odonto.pacientes (
          empresa_id,
          usuario_id,
          numero_prontuario,
          nome,
          apelido,
          nascimento,
          sexo,
          cpf,
          cpf_normalizado,
          rg,
          estado_civil,
          escolaridade,
          como_conheceu,
          observacoes,
          created_by,
          updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        returning id, nome
      `, [
            auth.empresaId,
            usuarioId,
            (0, normalize_1.optionalText)(input.numeroProntuario),
            input.nome,
            (0, normalize_1.optionalText)(input.apelido),
            (0, normalize_1.optionalDate)(input.nascimento),
            input.sexo,
            (0, normalize_1.optionalText)(input.cpf),
            (0, normalize_1.onlyDigits)(input.cpf),
            (0, normalize_1.optionalText)(input.rg),
            (0, normalize_1.optionalText)(input.estadoCivil),
            (0, normalize_1.optionalText)(input.escolaridade),
            (0, normalize_1.optionalText)(input.comoConheceu),
            (0, normalize_1.optionalText)(input.observacoes),
            auth.usuarioId,
        ]);
        const paciente = pacienteResult.rows[0];
        await upsertContato(client, paciente.id, input);
        await replaceEndereco(client, paciente.id, input);
        await upsertComplementares(client, paciente.id, input);
        await upsertFiliacao(client, paciente.id, input);
        await replaceRepresentanteLegal(client, paciente.id, input);
        await client.query(`
        insert into odonto.audit_logs (
          empresa_id,
          usuario_id,
          entidade,
          entidade_id,
          acao,
          payload
        )
        values ($1, $2, 'pacientes', $3, 'create', $4::jsonb)
      `, [auth.empresaId, auth.usuarioId, paciente.id, JSON.stringify({ nome: paciente.nome })]);
        return paciente;
    }).catch((error) => {
        if (error.code === '23505') {
            throw (0, http_error_1.conflict)('Paciente ja cadastrado para esta empresa com este CPF ou prontuario.');
        }
        throw error;
    });
}
async function createOrLinkMinimalPatient(client, auth, input) {
    const cpf = (0, normalize_1.onlyDigits)(input.cpf);
    if (!cpf || cpf.length !== 11) {
        throw (0, http_error_1.conflict)('Informe um CPF valido para cadastrar o paciente.');
    }
    const minimalInput = {
        nome: input.nome,
        cpf: input.cpf,
        sexo: 'nao_informado',
        observacoes: 'Cadastro inicial criado durante a aprovacao de orcamento.',
        contato: {
            celularPais: 'BR',
            celular: input.celular,
            usarCelularContato: false,
            naoPossuiEmail: true,
        },
        endereco: {},
        complementares: {},
        filiacao: {},
        representanteLegal: {},
    };
    const usuarioId = await ensurePatientPortalAccount(client, auth, minimalInput);
    if (input.pacienteId) {
        const duplicateCpf = await client.query(`select 1 from odonto.pacientes
        where empresa_id = $1 and cpf_normalizado = $2 and id <> $3::uuid limit 1`, [auth.empresaId, cpf, input.pacienteId]);
        if (duplicateCpf.rowCount) {
            throw (0, http_error_1.conflict)('CPF ja cadastrado para outro paciente nesta empresa.');
        }
    }
    const existing = await client.query(`select id, nome, cadastro_incompleto, cpf_normalizado
       from odonto.pacientes
      where empresa_id = $1 and (cpf_normalizado = $2 or id = $3::uuid)
      order by case when id = $3::uuid then 0 else 1 end
      limit 1
      for update`, [auth.empresaId, cpf, input.pacienteId ?? null]);
    let patient = existing.rows[0];
    if (patient) {
        if (input.pacienteId && patient.id !== input.pacienteId) {
            throw (0, http_error_1.conflict)('CPF ja cadastrado para outro paciente nesta empresa.');
        }
        if (patient.cpf_normalizado && patient.cpf_normalizado !== cpf) {
            throw (0, http_error_1.conflict)('O CPF informado nao corresponde ao paciente vinculado.');
        }
        await client.query(`update odonto.pacientes
          set usuario_id = coalesce(usuario_id, $3), cpf = coalesce(cpf, $4),
              cpf_normalizado = coalesce(cpf_normalizado, $5), status = 'ativo', updated_by = $6
        where id = $1 and empresa_id = $2`, [patient.id, auth.empresaId, usuarioId, input.cpf, cpf, auth.usuarioId]);
    }
    else {
        const created = await client.query(`insert into odonto.pacientes (
        empresa_id, usuario_id, nome, sexo, cpf, cpf_normalizado, observacoes,
        cadastro_incompleto, created_by, updated_by
      ) values ($1, $2, $3, 'nao_informado', $4, $5,
        'Cadastro inicial criado durante a aprovacao de orcamento.', true, $6, $6)
      returning id, nome, cadastro_incompleto, cpf_normalizado`, [auth.empresaId, usuarioId, input.nome, input.cpf, cpf, auth.usuarioId]);
        patient = created.rows[0];
    }
    await client.query(`insert into odonto.paciente_contatos (
      paciente_id, celular_pais, celular, usar_celular_contato, nao_possui_email
    ) values ($1, 'BR', $2, false, true)
    on conflict (paciente_id) do update set
      celular = coalesce(odonto.paciente_contatos.celular, excluded.celular)`, [patient.id, (0, normalize_1.optionalText)(input.celular)]);
    await client.query(`insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
     values ($1, $2, 'pacientes', $3, $4, $5::jsonb)`, [auth.empresaId, auth.usuarioId, patient.id, existing.rowCount ? 'link_quote' : 'create_minimal', JSON.stringify({ cpf, origem: 'orcamento' })]);
    return { id: patient.id, nome: patient.nome, cadastroIncompleto: patient.cadastro_incompleto };
}
async function updatePatient(auth, patientId, input) {
    return (0, pool_1.transaction)(async (client) => {
        await assertPatientExists(client, auth, patientId);
        const usuarioId = await ensurePatientPortalAccount(client, auth, input);
        const pacienteResult = await client.query(`
        update odonto.pacientes
        set usuario_id = coalesce($3, usuario_id),
            numero_prontuario = $4,
            nome = $5,
            apelido = $6,
            nascimento = $7,
            sexo = $8,
            cpf = $9,
            cpf_normalizado = $10,
            rg = $11,
            estado_civil = $12,
            escolaridade = $13,
            como_conheceu = $14,
            observacoes = $15,
            cadastro_incompleto = false,
            updated_by = $16
        where id = $1
          and empresa_id = $2
        returning id, nome
      `, [
            patientId,
            auth.empresaId,
            usuarioId,
            (0, normalize_1.optionalText)(input.numeroProntuario),
            input.nome,
            (0, normalize_1.optionalText)(input.apelido),
            (0, normalize_1.optionalDate)(input.nascimento),
            input.sexo,
            (0, normalize_1.optionalText)(input.cpf),
            (0, normalize_1.onlyDigits)(input.cpf),
            (0, normalize_1.optionalText)(input.rg),
            (0, normalize_1.optionalText)(input.estadoCivil),
            (0, normalize_1.optionalText)(input.escolaridade),
            (0, normalize_1.optionalText)(input.comoConheceu),
            (0, normalize_1.optionalText)(input.observacoes),
            auth.usuarioId,
        ]);
        const paciente = pacienteResult.rows[0];
        await upsertContato(client, paciente.id, input);
        await replaceEndereco(client, paciente.id, input);
        await upsertComplementares(client, paciente.id, input);
        await upsertFiliacao(client, paciente.id, input);
        await replaceRepresentanteLegal(client, paciente.id, input);
        await client.query(`
        insert into odonto.audit_logs (
          empresa_id,
          usuario_id,
          entidade,
          entidade_id,
          acao,
          payload
        )
        values ($1, $2, 'pacientes', $3, 'update', $4::jsonb)
      `, [auth.empresaId, auth.usuarioId, paciente.id, JSON.stringify({ nome: paciente.nome })]);
        return paciente;
    }).catch((error) => {
        if (error.code === '23505') {
            throw (0, http_error_1.conflict)('Paciente ja cadastrado para esta empresa com este CPF ou prontuario.');
        }
        throw error;
    });
}
async function inactivatePatient(auth, patientId) {
    await (0, pool_1.transaction)(async (client) => {
        const result = await client.query(`
        update odonto.pacientes
        set status = 'inativo',
            updated_by = $3
        where id = $1
          and empresa_id = $2
        returning usuario_id
      `, [patientId, auth.empresaId, auth.usuarioId]);
        const patient = result.rows[0];
        if (!patient) {
            throw (0, http_error_1.notFound)('Paciente nao encontrado.');
        }
        if (patient.usuario_id) {
            await client.query(`
          update odonto.usuario_empresas
          set ativo = false
          where usuario_id = $1
            and empresa_id = $2
            and perfil = 'paciente'
        `, [patient.usuario_id, auth.empresaId]);
        }
        await client.query(`
        insert into odonto.audit_logs (
          empresa_id,
          usuario_id,
          entidade,
          entidade_id,
          acao
        )
        values ($1, $2, 'pacientes', $3, 'inactivate')
      `, [auth.empresaId, auth.usuarioId, patientId]);
    });
}
