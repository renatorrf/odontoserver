import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { conflict, notFound } from '../../utils/http-error';
import { optionalDate, optionalText } from '../../utils/normalize';
import {
  CatalogProcedureInput,
  CatalogProcedureListQuery,
  CatalogProcedureStatusInput,
  CreateProcedureInput,
  ProcedureListQuery,
} from './procedure.schemas';

interface CatalogProcedureRow {
  id: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  duracao_minutos: number;
  valor: string;
  custo_variavel: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

function mapCatalogProcedure(row: CatalogProcedureRow) {
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

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

export async function listCatalogProcedures(auth: AuthContext, input: CatalogProcedureListQuery) {
  const search = optionalText(input.search);
  const result = await query<CatalogProcedureRow>(
    `
      select id, codigo, nome, descricao, categoria, duracao_minutos, valor, custo_variavel, ativo, created_at, updated_at
        from odonto.catalogo_procedimentos
       where empresa_id = $1
         and ($2::text is null or nome ilike '%' || $2 || '%' or codigo ilike '%' || $2 || '%' or categoria ilike '%' || $2 || '%')
         and ($3 = 'todos' or ($3 = 'ativos' and ativo = true) or ($3 = 'inativos' and ativo = false))
       order by ativo desc, nome
    `,
    [auth.empresaId, search, input.status],
  );
  return result.rows.map(mapCatalogProcedure);
}

export async function getCatalogProcedure(auth: AuthContext, id: string) {
  const result = await query<CatalogProcedureRow>(
    `
      select id, codigo, nome, descricao, categoria, duracao_minutos, valor, custo_variavel, ativo, created_at, updated_at
        from odonto.catalogo_procedimentos
       where id = $1 and empresa_id = $2
       limit 1
    `,
    [id, auth.empresaId],
  );
  if (!result.rowCount) {
    throw notFound('Procedimento nao encontrado.');
  }
  return mapCatalogProcedure(result.rows[0]);
}

export async function createCatalogProcedure(auth: AuthContext, input: CatalogProcedureInput) {
  try {
    const result = await query<{ id: string }>(
      `
        insert into odonto.catalogo_procedimentos (
          empresa_id, codigo, nome, descricao, categoria, duracao_minutos, valor, custo_variavel, ativo, created_by, updated_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        returning id
      `,
      [
        auth.empresaId,
        optionalText(input.codigo)?.toUpperCase() ?? null,
        input.nome,
        optionalText(input.descricao),
        optionalText(input.categoria),
        input.duracaoMinutos,
        input.valor,
        input.custoVariavel,
        input.ativo,
        auth.usuarioId,
      ],
    );
    return getCatalogProcedure(auth, result.rows[0].id);
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw conflict('Ja existe um procedimento com este nome ou codigo.');
    }
    throw error;
  }
}

export async function updateCatalogProcedure(auth: AuthContext, id: string, input: CatalogProcedureInput) {
  try {
    const result = await query(
      `
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
      `,
      [
        id,
        auth.empresaId,
        optionalText(input.codigo)?.toUpperCase() ?? null,
        input.nome,
        optionalText(input.descricao),
        optionalText(input.categoria),
        input.duracaoMinutos,
        input.valor,
        input.custoVariavel,
        input.ativo,
        auth.usuarioId,
      ],
    );
    if (!result.rowCount) {
      throw notFound('Procedimento nao encontrado.');
    }
    return getCatalogProcedure(auth, id);
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw conflict('Ja existe um procedimento com este nome ou codigo.');
    }
    throw error;
  }
}

export async function updateCatalogProcedureStatus(
  auth: AuthContext,
  id: string,
  input: CatalogProcedureStatusInput,
): Promise<void> {
  const result = await query(
    `update odonto.catalogo_procedimentos set ativo = $3, updated_by = $4 where id = $1 and empresa_id = $2`,
    [id, auth.empresaId, input.ativo, auth.usuarioId],
  );
  if (!result.rowCount) {
    throw notFound('Procedimento nao encontrado.');
  }
}

export async function listProcedures(auth: AuthContext, params: ProcedureListQuery) {
  const patientResult = await query('select id from odonto.pacientes where id = $1 and empresa_id = $2 limit 1', [
    params.pacienteId,
    auth.empresaId,
  ]);

  if (!patientResult.rows.length) {
    throw notFound('Paciente nao encontrado.');
  }

  const result = await query(
    `
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
    `,
    [auth.empresaId, params.pacienteId],
  );

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

export async function createProcedure(auth: AuthContext, input: CreateProcedureInput) {
  return transaction(async (client) => {
    const patientResult = await client.query(
      'select id from odonto.pacientes where id = $1 and empresa_id = $2 limit 1',
      [input.pacienteId, auth.empresaId],
    );

    if (!patientResult.rows.length) {
      throw notFound('Paciente nao encontrado.');
    }

    let professionalName = optionalText(input.profissionalNome);
    if (input.profissionalId) {
      const professionalResult = await client.query<{ nome: string }>(
        'select nome from odonto.profissionais where id = $1 and empresa_id = $2 limit 1',
        [input.profissionalId, auth.empresaId],
      );
      if (!professionalResult.rowCount) {
        throw notFound('Profissional nao encontrado.');
      }
      professionalName = professionalResult.rows[0].nome;
    }

    if (input.catalogoProcedimentoId) {
      const catalogResult = await client.query(
        'select 1 from odonto.catalogo_procedimentos where id = $1 and empresa_id = $2 limit 1',
        [input.catalogoProcedimentoId, auth.empresaId],
      );
      if (!catalogResult.rowCount) {
        throw notFound('Procedimento do catalogo nao encontrado.');
      }
    }

    const result = await client.query(
      `
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
      `,
      [
        auth.empresaId,
        input.pacienteId,
        input.profissionalId ?? null,
        input.catalogoProcedimentoId ?? null,
        optionalDate(input.dataProcedimento),
        input.descricao,
        optionalText(input.dente),
        professionalName,
        input.valor ?? null,
        optionalText(input.observacoes),
        auth.usuarioId,
      ],
    );

    return {
      id: result.rows[0].id,
      descricao: result.rows[0].descricao,
      dataProcedimento: result.rows[0].data_procedimento,
    };
  });
}
