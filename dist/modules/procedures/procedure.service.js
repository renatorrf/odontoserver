"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCatalogProcedures = listCatalogProcedures;
exports.getCatalogProcedure = getCatalogProcedure;
exports.createCatalogProcedure = createCatalogProcedure;
exports.updateCatalogProcedure = updateCatalogProcedure;
exports.updateCatalogProcedureStatus = updateCatalogProcedureStatus;
exports.listProcedures = listProcedures;
exports.createProcedure = createProcedure;
const pool_1 = require("../../database/pool");
const http_error_1 = require("../../utils/http-error");
const normalize_1 = require("../../utils/normalize");
function mapCatalogProcedure(row) {
    return {
        id: row.id,
        codigo: row.codigo,
        nome: row.nome,
        descricao: row.descricao,
        categoria: row.categoria,
        duracaoMinutos: row.duracao_minutos,
        valor: Number(row.valor),
        custoVariavel: Number(row.custo_variavel),
        ativo: row.ativo,
        criadoEm: row.created_at,
        atualizadoEm: row.updated_at,
    };
}
function isUniqueViolation(error) {
    return error.code === '23505';
}
async function listCatalogProcedures(auth, input) {
    const search = (0, normalize_1.optionalText)(input.search);
    const result = await (0, pool_1.query)(`
      select id, codigo, nome, descricao, categoria, duracao_minutos, valor, custo_variavel, ativo, created_at, updated_at
        from odonto.catalogo_procedimentos
       where empresa_id = $1
         and ($2::text is null or nome ilike '%' || $2 || '%' or codigo ilike '%' || $2 || '%' or categoria ilike '%' || $2 || '%')
         and ($3 = 'todos' or ($3 = 'ativos' and ativo = true) or ($3 = 'inativos' and ativo = false))
       order by ativo desc, nome
    `, [auth.empresaId, search, input.status]);
    return result.rows.map(mapCatalogProcedure);
}
async function getCatalogProcedure(auth, id) {
    const result = await (0, pool_1.query)(`
      select id, codigo, nome, descricao, categoria, duracao_minutos, valor, custo_variavel, ativo, created_at, updated_at
        from odonto.catalogo_procedimentos
       where id = $1 and empresa_id = $2
       limit 1
    `, [id, auth.empresaId]);
    if (!result.rowCount) {
        throw (0, http_error_1.notFound)('Procedimento nao encontrado.');
    }
    return mapCatalogProcedure(result.rows[0]);
}
async function createCatalogProcedure(auth, input) {
    try {
        const result = await (0, pool_1.query)(`
        insert into odonto.catalogo_procedimentos (
          empresa_id, codigo, nome, descricao, categoria, duracao_minutos, valor, custo_variavel, ativo, created_by, updated_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        returning id
      `, [
            auth.empresaId,
            (0, normalize_1.optionalText)(input.codigo)?.toUpperCase() ?? null,
            input.nome,
            (0, normalize_1.optionalText)(input.descricao),
            (0, normalize_1.optionalText)(input.categoria),
            input.duracaoMinutos,
            input.valor,
            input.custoVariavel,
            input.ativo,
            auth.usuarioId,
        ]);
        return getCatalogProcedure(auth, result.rows[0].id);
    }
    catch (error) {
        if (isUniqueViolation(error)) {
            throw (0, http_error_1.conflict)('Ja existe um procedimento com este nome ou codigo.');
        }
        throw error;
    }
}
async function updateCatalogProcedure(auth, id, input) {
    try {
        const result = await (0, pool_1.query)(`
        update odonto.catalogo_procedimentos set
          codigo = $3,
          nome = $4,
          descricao = $5,
          categoria = $6,
          duracao_minutos = $7,
          valor = $8,
          custo_variavel = $9,
          ativo = $10,
          updated_by = $11
        where id = $1 and empresa_id = $2
      `, [
            id,
            auth.empresaId,
            (0, normalize_1.optionalText)(input.codigo)?.toUpperCase() ?? null,
            input.nome,
            (0, normalize_1.optionalText)(input.descricao),
            (0, normalize_1.optionalText)(input.categoria),
            input.duracaoMinutos,
            input.valor,
            input.custoVariavel,
            input.ativo,
            auth.usuarioId,
        ]);
        if (!result.rowCount) {
            throw (0, http_error_1.notFound)('Procedimento nao encontrado.');
        }
        return getCatalogProcedure(auth, id);
    }
    catch (error) {
        if (isUniqueViolation(error)) {
            throw (0, http_error_1.conflict)('Ja existe um procedimento com este nome ou codigo.');
        }
        throw error;
    }
}
async function updateCatalogProcedureStatus(auth, id, input) {
    const result = await (0, pool_1.query)(`update odonto.catalogo_procedimentos set ativo = $3, updated_by = $4 where id = $1 and empresa_id = $2`, [id, auth.empresaId, input.ativo, auth.usuarioId]);
    if (!result.rowCount) {
        throw (0, http_error_1.notFound)('Procedimento nao encontrado.');
    }
}
async function listProcedures(auth, params) {
    const patientResult = await (0, pool_1.query)('select id from odonto.pacientes where id = $1 and empresa_id = $2 limit 1', [
        params.pacienteId,
        auth.empresaId,
    ]);
    if (!patientResult.rows.length) {
        throw (0, http_error_1.notFound)('Paciente nao encontrado.');
    }
    const result = await (0, pool_1.query)(`
      select
        id,
        data_procedimento,
        descricao,
        dente,
        profissional_nome,
        valor,
        observacoes
      from odonto.procedimentos_realizados
      where empresa_id = $1
        and paciente_id = $2
      order by data_procedimento desc, created_at desc
    `, [auth.empresaId, params.pacienteId]);
    return result.rows.map((row) => ({
        id: row.id,
        dataProcedimento: row.data_procedimento,
        descricao: row.descricao,
        dente: row.dente,
        profissionalNome: row.profissional_nome,
        valor: row.valor,
        observacoes: row.observacoes,
    }));
}
async function createProcedure(auth, input) {
    return (0, pool_1.transaction)(async (client) => {
        const patientResult = await client.query('select id from odonto.pacientes where id = $1 and empresa_id = $2 limit 1', [input.pacienteId, auth.empresaId]);
        if (!patientResult.rows.length) {
            throw (0, http_error_1.notFound)('Paciente nao encontrado.');
        }
        let professionalName = (0, normalize_1.optionalText)(input.profissionalNome);
        if (input.profissionalId) {
            const professionalResult = await client.query('select nome from odonto.profissionais where id = $1 and empresa_id = $2 limit 1', [input.profissionalId, auth.empresaId]);
            if (!professionalResult.rowCount) {
                throw (0, http_error_1.notFound)('Profissional nao encontrado.');
            }
            professionalName = professionalResult.rows[0].nome;
        }
        if (input.catalogoProcedimentoId) {
            const catalogResult = await client.query('select 1 from odonto.catalogo_procedimentos where id = $1 and empresa_id = $2 limit 1', [input.catalogoProcedimentoId, auth.empresaId]);
            if (!catalogResult.rowCount) {
                throw (0, http_error_1.notFound)('Procedimento do catalogo nao encontrado.');
            }
        }
        const result = await client.query(`
        insert into odonto.procedimentos_realizados (
          empresa_id,
          paciente_id,
          profissional_id,
          catalogo_procedimento_id,
          data_procedimento,
          descricao,
          dente,
          profissional_nome,
          valor,
          observacoes,
          created_by
        )
        values ($1, $2, $3, $4, coalesce($5::date, current_date), $6, $7, $8, $9, $10, $11)
        returning id, descricao, data_procedimento
      `, [
            auth.empresaId,
            input.pacienteId,
            input.profissionalId ?? null,
            input.catalogoProcedimentoId ?? null,
            (0, normalize_1.optionalDate)(input.dataProcedimento),
            input.descricao,
            (0, normalize_1.optionalText)(input.dente),
            professionalName,
            input.valor ?? null,
            (0, normalize_1.optionalText)(input.observacoes),
            auth.usuarioId,
        ]);
        return {
            id: result.rows[0].id,
            descricao: result.rows[0].descricao,
            dataProcedimento: result.rows[0].data_procedimento,
        };
    });
}
