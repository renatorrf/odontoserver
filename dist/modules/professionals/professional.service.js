"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProfessionals = listProfessionals;
exports.getProfessional = getProfessional;
exports.createProfessional = createProfessional;
exports.updateProfessional = updateProfessional;
exports.inactivateProfessional = inactivateProfessional;
exports.saveCommission = saveCommission;
const pool_1 = require("../../database/pool");
const http_error_1 = require("../../utils/http-error");
const normalize_1 = require("../../utils/normalize");
function state(value) {
    const text = (0, normalize_1.optionalText)(value)?.toUpperCase() ?? null;
    return text ? text.slice(0, 2) : null;
}
function mapCommission(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        validoDesde: row.valido_desde,
        validoAte: row.valido_ate,
        duracaoIndeterminada: row.duracao_indeterminada,
        requerAprovacao: row.requer_aprovacao,
        tipo: row.tipo,
        momento: row.momento,
        percentualGeral: row.percentual_geral == null ? null : Number(row.percentual_geral),
        percentualPlano: row.percentual_plano == null ? null : Number(row.percentual_plano),
        valorFixo: row.valor_fixo == null ? null : Number(row.valor_fixo),
        descontarImpostos: row.descontar_impostos,
        descontarTaxasPagamento: row.descontar_taxas_pagamento,
        gerarPlanoProprioExecucao: row.gerar_plano_proprio_execucao,
    };
}
async function ensureProfessional(client, auth, id) {
    const result = await client.query('select 1 from odonto.profissionais where id = $1 and empresa_id = $2 limit 1', [
        id,
        auth.empresaId,
    ]);
    if (!result.rowCount) {
        throw (0, http_error_1.notFound)('Profissional nao encontrado.');
    }
}
async function syncSpecialties(client, auth, professionalId, specialties) {
    await client.query('delete from odonto.profissional_especialidades where profissional_id = $1 and empresa_id = $2', [
        professionalId,
        auth.empresaId,
    ]);
    const uniqueNames = [...new Map(specialties.map((name) => [name.trim().toLocaleLowerCase('pt-BR'), name.trim()])).values()];
    for (const name of uniqueNames) {
        await client.query(`
        insert into odonto.especialidades (empresa_id, nome)
        select $1, $2::varchar(100)
        where not exists (
          select 1 from odonto.especialidades where empresa_id = $1 and lower(nome) = lower($2::text)
        )
      `, [auth.empresaId, name]);
        await client.query(`
        insert into odonto.profissional_especialidades (empresa_id, profissional_id, especialidade_id)
        select $1, $2, e.id
          from odonto.especialidades e
         where e.empresa_id = $1 and lower(e.nome) = lower($3)
        on conflict do nothing
      `, [auth.empresaId, professionalId, name]);
    }
}
async function syncAvailability(client, auth, professionalId, input) {
    await client.query('delete from odonto.profissional_disponibilidades where profissional_id = $1 and empresa_id = $2', [professionalId, auth.empresaId]);
    if (!input.agendaHabilitada) {
        return;
    }
    for (const availability of input.disponibilidades) {
        await client.query(`
        insert into odonto.profissional_disponibilidades (
          empresa_id,
          profissional_id,
          dia_semana,
          hora_inicio,
          hora_fim,
          intervalo_minutos
        ) values ($1, $2, $3, $4, $5, $6)
      `, [
            auth.empresaId,
            professionalId,
            availability.diaSemana,
            availability.horaInicio,
            availability.horaFim,
            availability.intervaloMinutos,
        ]);
    }
}
function professionalValues(input) {
    return [
        input.nome,
        (0, normalize_1.optionalDate)(input.nascimento),
        input.sexo,
        (0, normalize_1.optionalText)(input.estadoCivil),
        (0, normalize_1.optionalText)(input.cpf),
        (0, normalize_1.onlyDigits)(input.cpf),
        (0, normalize_1.optionalText)(input.rg),
        input.conselhoTipo.toUpperCase(),
        state(input.conselhoUf),
        (0, normalize_1.optionalText)(input.conselhoNumero),
        input.corAgenda.toUpperCase(),
        (0, normalize_1.optionalText)(input.contato.email)?.toLowerCase() ?? null,
        (0, normalize_1.optionalText)(input.contato.celular),
        (0, normalize_1.optionalText)(input.contato.foneFixo),
        (0, normalize_1.optionalText)(input.chavePix),
        (0, normalize_1.optionalText)(input.endereco.cep),
        (0, normalize_1.optionalText)(input.endereco.cidade),
        state(input.endereco.estado),
        (0, normalize_1.optionalText)(input.endereco.logradouro),
        (0, normalize_1.optionalText)(input.endereco.numero),
        (0, normalize_1.optionalText)(input.endereco.bairro),
        (0, normalize_1.optionalText)(input.endereco.complemento),
        (0, normalize_1.optionalText)(input.observacoes),
        input.agendaHabilitada,
        input.visualizacaoAgenda,
    ];
}
async function listProfessionals(auth, input) {
    const search = (0, normalize_1.optionalText)(input.search);
    const normalized = (0, normalize_1.onlyDigits)(search);
    const result = await (0, pool_1.query)(`
      select
        p.*,
        coalesce(
          array_agg(e.nome order by e.nome) filter (where e.id is not null),
          array[]::varchar[]
        ) as especialidades
      from odonto.profissionais p
      left join odonto.profissional_especialidades pe on pe.profissional_id = p.id and pe.empresa_id = p.empresa_id
      left join odonto.especialidades e on e.id = pe.especialidade_id
      where p.empresa_id = $1
        and (
          $2::text is null
          or p.nome ilike '%' || $2 || '%'
          or p.cpf_normalizado = $3
          or p.conselho_numero ilike '%' || $2 || '%'
        )
      group by p.id
      order by case when p.status = 'ativo' then 0 else 1 end, p.nome
      limit 50
    `, [auth.empresaId, search, normalized]);
    return result.rows.map((row) => ({
        id: row.id,
        nome: row.nome,
        cpf: row.cpf,
        conselho: [row.conselho_tipo, row.conselho_uf, row.conselho_numero].filter(Boolean).join(' '),
        especialidades: row.especialidades,
        status: row.status,
        corAgenda: row.cor_agenda,
        agendaHabilitada: row.agenda_habilitada,
    }));
}
async function getProfessional(auth, id) {
    const [professionalResult, specialtiesResult, availabilityResult, commissionResult] = await Promise.all([
        (0, pool_1.query)('select * from odonto.profissionais where id = $1 and empresa_id = $2 limit 1', [
            id,
            auth.empresaId,
        ]),
        (0, pool_1.query)(`
        select e.nome
          from odonto.profissional_especialidades pe
          join odonto.especialidades e on e.id = pe.especialidade_id
         where pe.profissional_id = $1 and pe.empresa_id = $2
         order by e.nome
      `, [id, auth.empresaId]),
        (0, pool_1.query)(`
        select dia_semana, hora_inicio::text, hora_fim::text, intervalo_minutos
          from odonto.profissional_disponibilidades
         where profissional_id = $1 and empresa_id = $2 and ativo = true
         order by dia_semana, hora_inicio
      `, [id, auth.empresaId]),
        (0, pool_1.query)(`
        select *
          from odonto.profissional_comissoes
         where profissional_id = $1 and empresa_id = $2 and ativo = true
         order by valido_desde desc, created_at desc
         limit 1
      `, [id, auth.empresaId]),
    ]);
    const row = professionalResult.rows[0];
    if (!row) {
        throw (0, http_error_1.notFound)('Profissional nao encontrado.');
    }
    return {
        id: row.id,
        nome: row.nome,
        nascimento: row.nascimento,
        sexo: row.sexo,
        estadoCivil: row.estado_civil,
        cpf: row.cpf,
        rg: row.rg,
        conselhoTipo: row.conselho_tipo,
        conselhoUf: row.conselho_uf,
        conselhoNumero: row.conselho_numero,
        corAgenda: row.cor_agenda,
        especialidades: specialtiesResult.rows.map((item) => item.nome),
        contato: { email: row.email, celular: row.celular, foneFixo: row.fone_fixo },
        chavePix: row.chave_pix,
        endereco: {
            cep: row.cep,
            cidade: row.cidade,
            estado: row.estado,
            logradouro: row.logradouro,
            numero: row.numero,
            bairro: row.bairro,
            complemento: row.complemento,
        },
        observacoes: row.observacoes,
        status: row.status,
        agendaHabilitada: row.agenda_habilitada,
        visualizacaoAgenda: row.visualizacao_agenda,
        disponibilidades: availabilityResult.rows.map((item) => ({
            diaSemana: item.dia_semana,
            horaInicio: item.hora_inicio.slice(0, 5),
            horaFim: item.hora_fim.slice(0, 5),
            intervaloMinutos: item.intervalo_minutos,
        })),
        comissao: mapCommission(commissionResult.rows[0]),
        criadoEm: row.created_at,
    };
}
async function createProfessional(auth, input) {
    try {
        const id = await (0, pool_1.transaction)(async (client) => {
            const result = await client.query(`
          insert into odonto.profissionais (
            empresa_id, nome, nascimento, sexo, estado_civil, cpf, cpf_normalizado, rg,
            conselho_tipo, conselho_uf, conselho_numero, cor_agenda, email, celular, fone_fixo,
            chave_pix, cep, cidade, estado, logradouro, numero, bairro, complemento, observacoes,
            agenda_habilitada, visualizacao_agenda, created_by, updated_by
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $27
          ) returning id
        `, [auth.empresaId, ...professionalValues(input), auth.usuarioId]);
            const professionalId = result.rows[0].id;
            await syncSpecialties(client, auth, professionalId, input.especialidades);
            await syncAvailability(client, auth, professionalId, input);
            return professionalId;
        });
        return getProfessional(auth, id);
    }
    catch (error) {
        if (error.code === '23505') {
            throw (0, http_error_1.conflict)('CPF ou registro profissional ja cadastrado nesta empresa.');
        }
        throw error;
    }
}
async function updateProfessional(auth, id, input) {
    try {
        await (0, pool_1.transaction)(async (client) => {
            await ensureProfessional(client, auth, id);
            await client.query(`
          update odonto.profissionais set
            nome = $3, nascimento = $4, sexo = $5, estado_civil = $6, cpf = $7,
            cpf_normalizado = $8, rg = $9, conselho_tipo = $10, conselho_uf = $11,
            conselho_numero = $12, cor_agenda = $13, email = $14, celular = $15,
            fone_fixo = $16, chave_pix = $17, cep = $18, cidade = $19, estado = $20, logradouro = $21,
            numero = $22, bairro = $23, complemento = $24, observacoes = $25,
            agenda_habilitada = $26, visualizacao_agenda = $27, updated_by = $28
          where id = $1 and empresa_id = $2
        `, [id, auth.empresaId, ...professionalValues(input), auth.usuarioId]);
            await syncSpecialties(client, auth, id, input.especialidades);
            await syncAvailability(client, auth, id, input);
        });
        return getProfessional(auth, id);
    }
    catch (error) {
        if (error.code === '23505') {
            throw (0, http_error_1.conflict)('CPF ou registro profissional ja cadastrado nesta empresa.');
        }
        throw error;
    }
}
async function inactivateProfessional(auth, id) {
    const result = await (0, pool_1.query)(`
      update odonto.profissionais
         set status = 'inativo', agenda_habilitada = false, updated_by = $3
       where id = $1 and empresa_id = $2
    `, [id, auth.empresaId, auth.usuarioId]);
    if (!result.rowCount) {
        throw (0, http_error_1.notFound)('Profissional nao encontrado.');
    }
}
async function saveCommission(auth, id, input) {
    const commissionId = await (0, pool_1.transaction)(async (client) => {
        await ensureProfessional(client, auth, id);
        await client.query('update odonto.profissional_comissoes set ativo = false where profissional_id = $1 and empresa_id = $2 and ativo = true', [id, auth.empresaId]);
        const result = await client.query(`
        insert into odonto.profissional_comissoes (
          empresa_id, profissional_id, valido_desde, valido_ate, duracao_indeterminada,
          requer_aprovacao, tipo, momento, percentual_geral, percentual_plano, valor_fixo,
          descontar_impostos, descontar_taxas_pagamento, gerar_plano_proprio_execucao, created_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        returning id
      `, [
            auth.empresaId,
            id,
            input.validoDesde,
            input.duracaoIndeterminada ? null : (0, normalize_1.optionalDate)(input.validoAte),
            input.duracaoIndeterminada,
            input.requerAprovacao,
            input.tipo,
            input.momento,
            input.tipo === 'porcentagem' ? input.percentualGeral ?? 0 : null,
            input.tipo === 'porcentagem' ? input.percentualPlano ?? 0 : null,
            input.tipo === 'valor_fixo' ? input.valorFixo ?? 0 : null,
            input.descontarImpostos,
            input.descontarTaxasPagamento,
            input.gerarPlanoProprioExecucao,
            auth.usuarioId,
        ]);
        return result.rows[0].id;
    });
    const result = await (0, pool_1.query)('select * from odonto.profissional_comissoes where id = $1 and empresa_id = $2 limit 1', [commissionId, auth.empresaId]);
    return mapCommission(result.rows[0]);
}
