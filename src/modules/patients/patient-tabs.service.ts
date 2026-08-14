import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { conflict, notFound } from '../../utils/http-error';
import { optionalText } from '../../utils/normalize';
import { anamnesisQuestions } from './anamnesis.config';
import {
  PatientAnamnesisInput,
  PatientAppointmentsQuery,
  PatientDocumentMetadata,
  PatientDocumentUpdate,
  PatientFinancialEntryInput,
} from './patient-tabs.schemas';

const documentMimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

interface DatabaseClient {
  query(text: string, values?: any[]): Promise<{ rowCount: number | null }>;
}

async function assertPatient(client: DatabaseClient, auth: AuthContext, patientId: string): Promise<void> {
  const result = await client.query(
    'select 1 from odonto.pacientes where id = $1 and empresa_id = $2 limit 1',
    [patientId, auth.empresaId],
  );
  if (!result.rowCount) {
    throw notFound('Paciente nao encontrado.');
  }
}

async function assertQuote(client: DatabaseClient, auth: AuthContext, patientId: string, quoteId: string): Promise<void> {
  const result = await client.query(
    'select 1 from odonto.orcamentos where id = $1 and paciente_id = $2 and empresa_id = $3 limit 1',
    [quoteId, patientId, auth.empresaId],
  );
  if (!result.rowCount) {
    throw notFound('Orcamento do paciente nao encontrado.');
  }
}

export async function getPatientTabSummary(auth: AuthContext, patientId: string) {
  const result = await query<{
    orcamentos: string;
    financeiro: string;
    documentos: string;
    anamneses: string;
    agendamentos: string;
    alerta_anamnese: boolean;
  }>(
    `
      select
        (select count(*) from odonto.orcamentos o where o.empresa_id = p.empresa_id and o.paciente_id = p.id)::text as orcamentos,
        (select count(*) from odonto.paciente_financeiro_lancamentos f where f.empresa_id = p.empresa_id and f.paciente_id = p.id and f.status <> 'cancelado')::text as financeiro,
        (select count(*) from odonto.paciente_documentos d where d.empresa_id = p.empresa_id and d.paciente_id = p.id and d.deleted_at is null)::text as documentos,
        (select count(*) from odonto.paciente_anamneses a where a.empresa_id = p.empresa_id and a.paciente_id = p.id)::text as anamneses,
        (select count(*) from odonto.agenda_eventos ae where ae.empresa_id = p.empresa_id and ae.paciente_id = p.id)::text as agendamentos,
        exists (
          select 1
            from odonto.paciente_anamneses a
            join odonto.paciente_anamnese_respostas ar on ar.anamnese_id = a.id and ar.empresa_id = a.empresa_id
           where a.empresa_id = p.empresa_id and a.paciente_id = p.id
             and a.versao = (select max(v.versao) from odonto.paciente_anamneses v where v.empresa_id = p.empresa_id and v.paciente_id = p.id)
             and ar.resposta = 'sim'
             and ar.pergunta_codigo = any($3::text[])
        ) as alerta_anamnese
      from odonto.pacientes p
      where p.id = $1 and p.empresa_id = $2
    `,
    [patientId, auth.empresaId, anamnesisQuestions.filter((item) => item.alerta).map((item) => item.codigo)],
  );
  if (!result.rowCount) {
    throw notFound('Paciente nao encontrado.');
  }
  const row = result.rows[0];
  return {
    contadores: {
      orcamentos: Number(row.orcamentos),
      financeiro: Number(row.financeiro),
      documentos: Number(row.documentos),
      anamneses: Number(row.anamneses),
      agendamentos: Number(row.agendamentos),
    },
    alertaAnamnese: row.alerta_anamnese,
  };
}

export async function listPatientQuotes(auth: AuthContext, patientId: string) {
  await assertPatient({ query }, auth, patientId);
  const result = await query<{
    id: string;
    numero: string;
    status: string;
    created_at: string;
    updated_at: string;
    profissional_id: string | null;
    profissional_nome: string | null;
    desconto_valor: string;
    observacoes: string | null;
    subtotal: string;
    total: string;
    valor_pago: string;
    proximo_agendamento: string | null;
    itens: Array<{
      id: string;
      catalogoProcedimentoId: string | null;
      descricao: string;
      quantidade: number;
      valorUnitario: string;
      valorTotal: string;
      status: string;
    }>;
  }>(
    `
      select o.id, upper(substr(o.id::text, 1, 8)) as numero, o.status::text,
             o.created_at, o.updated_at, o.profissional_id, p.nome as profissional_nome,
             o.desconto_valor::text, o.observacoes,
             coalesce(items.subtotal, 0)::text as subtotal,
             greatest(coalesce(items.subtotal, 0) - o.desconto_valor, 0)::text as total,
             coalesce(finance.valor_pago, 0)::text as valor_pago,
             next_event.inicio_em::text as proximo_agendamento,
             coalesce(items.itens, '[]'::json) as itens
        from odonto.orcamentos o
        left join odonto.profissionais p on p.id = o.profissional_id and p.empresa_id = o.empresa_id
        left join lateral (
          select sum(oi.valor_total) as subtotal,
                 json_agg(json_build_object(
                   'id', oi.id,
                   'catalogoProcedimentoId', oi.catalogo_procedimento_id,
                   'descricao', oi.descricao,
                   'quantidade', oi.quantidade,
                   'valorUnitario', oi.valor_unitario,
                   'valorTotal', oi.valor_total,
                   'status', oi.status::text
                 ) order by oi.ordem, oi.created_at) as itens
            from odonto.orcamento_itens oi where oi.orcamento_id = o.id
        ) items on true
        left join lateral (
          select sum(pg.valor) filter (where pg.estornado_em is null) as valor_pago
            from odonto.paciente_financeiro_lancamentos fl
            left join odonto.paciente_financeiro_pagamentos pg
              on pg.lancamento_id = fl.id and pg.empresa_id = fl.empresa_id
           where fl.empresa_id = o.empresa_id and fl.orcamento_id = o.id
        ) finance on true
        left join lateral (
          select ae.inicio_em
            from odonto.agenda_eventos ae
           where ae.empresa_id = o.empresa_id and ae.orcamento_id = o.id
             and ae.status not in ('cancelado', 'faltou') and ae.inicio_em >= now()
           order by ae.inicio_em limit 1
        ) next_event on true
       where o.empresa_id = $1 and o.paciente_id = $2
       order by o.updated_at desc
    `,
    [auth.empresaId, patientId],
  );
  return result.rows.map((row) => {
    const total = Number(row.total);
    const paid = Number(row.valor_pago);
    return {
      id: row.id,
      numero: row.numero,
      status: row.status,
      data: row.created_at,
      atualizadoEm: row.updated_at,
      profissionalId: row.profissional_id,
      profissionalNome: row.profissional_nome,
      descontoValor: Number(row.desconto_valor),
      observacoes: row.observacoes,
      subtotal: Number(row.subtotal),
      total,
      valorPago: paid,
      saldoRestante: Math.max(0, total - paid),
      quantidadeProcedimentos: row.itens.reduce((sum, item) => sum + item.quantidade, 0),
      proximoAgendamento: row.proximo_agendamento,
      itens: row.itens.map((item) => ({
        ...item,
        valorUnitario: Number(item.valorUnitario),
        valorTotal: Number(item.valorTotal),
      })),
    };
  });
}

export async function updateQuoteItemStatus(
  auth: AuthContext,
  patientId: string,
  quoteId: string,
  itemId: string,
  status: string,
) {
  const result = await query(
    `update odonto.orcamento_itens oi set status = $5::odonto.procedimento_planejamento_status
      from odonto.orcamentos o
      where oi.id = $1 and oi.orcamento_id = o.id and o.id = $2
        and o.paciente_id = $3 and o.empresa_id = $4`,
    [itemId, quoteId, patientId, auth.empresaId, status],
  );
  if (!result.rowCount) {
    throw notFound('Procedimento do orcamento nao encontrado.');
  }
}

export async function duplicatePatientQuote(auth: AuthContext, patientId: string, quoteId: string) {
  return transaction(async (client) => {
    await assertQuote(client, auth, patientId, quoteId);
    const quote = await client.query<{ id: string }>(
      `insert into odonto.orcamentos (
        empresa_id, paciente_id, profissional_id, nome_contato, whatsapp, origem, status,
        validade, desconto_valor, observacoes, created_by, updated_by
      ) select empresa_id, paciente_id, profissional_id, nome_contato, whatsapp, origem, 'rascunho',
               validade, desconto_valor, observacoes, $3, $3
          from odonto.orcamentos where id = $1 and empresa_id = $2 returning id`,
      [quoteId, auth.empresaId, auth.usuarioId],
    );
    const newId = quote.rows[0].id;
    await client.query(
      `insert into odonto.orcamento_itens (
        orcamento_id, catalogo_procedimento_id, descricao, quantidade, valor_unitario,
        valor_total, ordem, duracao_minutos, status
      ) select $2, catalogo_procedimento_id, descricao, quantidade, valor_unitario,
               valor_total, ordem, duracao_minutos, 'planejado'
          from odonto.orcamento_itens where orcamento_id = $1`,
      [quoteId, newId],
    );
    return { id: newId };
  });
}

export async function listPatientFinancial(auth: AuthContext, patientId: string) {
  await assertPatient({ query }, auth, patientId);
  const result = await query<{
    id: string;
    orcamento_id: string | null;
    orcamento_numero: string | null;
    descricao: string;
    vencimento: string;
    valor: string;
    numero_parcela: number;
    total_parcelas: number;
    status: string;
    valor_pago: string;
    data_pagamento: string | null;
    forma_pagamento: string | null;
    parcelas_cartao: number | null;
    desconto: string;
    acrescimo: string;
    pagamentos: Array<Record<string, unknown>>;
  }>(
    `
      select fl.id, fl.orcamento_id, upper(substr(fl.orcamento_id::text, 1, 8)) as orcamento_numero,
             fl.descricao, fl.vencimento, fl.valor::text, fl.numero_parcela, fl.total_parcelas,
             case
               when fl.status in ('cancelado', 'estornado') then fl.status::text
               when coalesce(pay.valor_pago, 0) + coalesce(pay.desconto, 0) >= fl.valor + coalesce(pay.acrescimo, 0) then 'pago'
               when coalesce(pay.valor_pago, 0) > 0 then 'parcialmente_pago'
               when fl.vencimento < current_date then 'vencido'
               else 'pendente'
             end as status,
             coalesce(pay.valor_pago, 0)::text as valor_pago,
             pay.data_pagamento::text,
             pay.forma_pagamento,
             pay.parcelas_cartao, coalesce(pay.desconto, 0)::text as desconto,
             coalesce(pay.acrescimo, 0)::text as acrescimo, coalesce(pay.pagamentos, '[]'::json) as pagamentos
        from odonto.paciente_financeiro_lancamentos fl
        left join lateral (
          select sum(pg.valor) filter (where pg.estornado_em is null) as valor_pago,
                 max(pg.pago_em) filter (where pg.estornado_em is null) as data_pagamento,
                 (array_agg(pg.forma_pagamento::text order by pg.pago_em desc)
                   filter (where pg.estornado_em is null))[1] as forma_pagamento,
                 (array_agg(pg.parcelas_cartao order by pg.pago_em desc)
                   filter (where pg.estornado_em is null))[1] as parcelas_cartao
                 ,sum(pg.desconto) filter (where pg.estornado_em is null) as desconto
                 ,sum(pg.acrescimo) filter (where pg.estornado_em is null) as acrescimo
                 ,json_agg(json_build_object('id', pg.id, 'valor', pg.valor, 'desconto', pg.desconto,
                   'acrescimo', pg.acrescimo, 'formaPagamento', pg.forma_pagamento::text,
                   'parcelasCartao', pg.parcelas_cartao, 'pagoEm', pg.pago_em, 'referencia', pg.referencia,
                   'observacoes', pg.observacoes, 'responsavelNome', u.nome, 'estornadoEm', pg.estornado_em,
                   'estornadoPor', eu.nome, 'justificativaEstorno', pg.justificativa_estorno,
                   'referenciaEstorno', pg.referencia_estorno, 'tipoEstorno', pg.tipo_estorno,
                   'statusEstornoProvedor', pg.status_estorno_provedor) order by pg.pago_em desc)
                   filter (where pg.id is not null) as pagamentos
            from odonto.paciente_financeiro_pagamentos pg
            left join odonto.usuarios u on u.id = pg.created_by
            left join odonto.usuarios eu on eu.id = pg.estornado_por
           where pg.empresa_id = fl.empresa_id and pg.lancamento_id = fl.id
        ) pay on true
       where fl.empresa_id = $1 and fl.paciente_id = $2
       order by fl.vencimento desc, fl.numero_parcela desc
    `,
    [auth.empresaId, patientId],
  );
  const items = result.rows.map((row) => ({
    id: row.id,
    orcamentoId: row.orcamento_id,
    orcamentoNumero: row.orcamento_numero,
    descricao: row.descricao,
    vencimento: row.vencimento,
    valor: Number(row.valor),
    numeroParcela: row.numero_parcela,
    totalParcelas: row.total_parcelas,
    status: row.status,
    valorPago: Number(row.valor_pago),
    dataPagamento: row.data_pagamento,
    formaPagamento: row.forma_pagamento,
    parcelasCartao: row.parcelas_cartao,
    desconto: Number(row.desconto),
    acrescimo: Number(row.acrescimo),
    pagamentos: row.pagamentos,
    saldoRestante: Math.max(0, Number(row.valor) + Number(row.acrescimo) - Number(row.desconto) - Number(row.valor_pago)),
  }));
  return {
    items,
    resumo: {
      total: items.reduce((sum, item) => sum + item.valor, 0),
      pago: items.reduce((sum, item) => sum + item.valorPago, 0),
      saldo: items.reduce((sum, item) => sum + item.saldoRestante, 0),
    },
  };
}

export async function createPatientFinancialEntry(
  auth: AuthContext,
  patientId: string,
  input: PatientFinancialEntryInput,
) {
  return transaction(async (client) => {
    await assertPatient(client, auth, patientId);
    if (input.orcamentoId) {
      await assertQuote(client, auth, patientId, input.orcamentoId);
    }
    const result = await client.query<{ id: string }>(
      `insert into odonto.paciente_financeiro_lancamentos (
        empresa_id, paciente_id, orcamento_id, descricao, vencimento, valor,
        numero_parcela, total_parcelas, created_by, updated_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning id`,
      [auth.empresaId, patientId, input.orcamentoId ?? null, input.descricao,
        input.vencimento, input.valor, input.numeroParcela, input.totalParcelas, auth.usuarioId],
    );
    return result.rows[0];
  });
}

function mapDocument(row: {
  id: string;
  categoria: string;
  descricao: string | null;
  data_documento: string | null;
  nome_original: string;
  mime_type: string;
  tamanho_bytes: string;
  orcamento_id: string | null;
  procedimento_realizado_id: string | null;
  responsavel_nome: string | null;
  created_at: string;
}) {
  return {
    id: row.id,
    categoria: row.categoria,
    descricao: row.descricao,
    dataDocumento: row.data_documento,
    nomeOriginal: row.nome_original,
    mimeType: row.mime_type,
    tamanhoBytes: Number(row.tamanho_bytes),
    orcamentoId: row.orcamento_id,
    procedimentoRealizadoId: row.procedimento_realizado_id,
    responsavelNome: row.responsavel_nome,
    cadastradoEm: row.created_at,
  };
}

export async function listPatientDocuments(auth: AuthContext, patientId: string) {
  await assertPatient({ query }, auth, patientId);
  const result = await query<Parameters<typeof mapDocument>[0]>(
    `select d.id, d.categoria::text, d.descricao, d.data_documento, d.nome_original,
            d.mime_type, d.tamanho_bytes::text, d.orcamento_id, d.procedimento_realizado_id,
            u.nome as responsavel_nome, d.created_at
       from odonto.paciente_documentos d
       left join odonto.usuarios u on u.id = d.created_by
      where d.empresa_id = $1 and d.paciente_id = $2 and d.deleted_at is null
      order by coalesce(d.data_documento, d.created_at::date) desc, d.created_at desc`,
    [auth.empresaId, patientId],
  );
  return result.rows.map(mapDocument);
}

export async function savePatientDocument(
  auth: AuthContext,
  patientId: string,
  file: Express.Multer.File,
  metadata: PatientDocumentMetadata,
) {
  if (!file) {
    throw conflict('Selecione um arquivo.');
  }
  const extension = documentMimeExtensions[file.mimetype];
  if (!extension) {
    throw conflict('Formato nao permitido. Envie JPG, PNG, WEBP ou PDF.');
  }
  await assertPatient({ query }, auth, patientId);
  if (metadata.orcamentoId) {
    await assertQuote({ query }, auth, patientId, metadata.orcamentoId);
  }
  if (metadata.procedimentoRealizadoId) {
    const procedure = await query(
      `select 1 from odonto.procedimentos_realizados
        where id = $1 and paciente_id = $2 and empresa_id = $3 limit 1`,
      [metadata.procedimentoRealizadoId, patientId, auth.empresaId],
    );
    if (!procedure.rowCount) {
      throw notFound('Procedimento do paciente nao encontrado.');
    }
  }
  const storageKey = `${auth.empresaId}/${patientId}/${randomUUID()}${extension}`;
  const fullPath = path.resolve(env.patientFilesDir, storageKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, file.buffer);
  try {
    const result = await query<{ id: string }>(
      `insert into odonto.paciente_documentos (
        empresa_id, paciente_id, orcamento_id, procedimento_realizado_id, categoria,
        descricao, data_documento, nome_original, mime_type, tamanho_bytes, storage_key, created_by
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [auth.empresaId, patientId, metadata.orcamentoId ?? null, metadata.procedimentoRealizadoId ?? null,
        metadata.categoria, optionalText(metadata.descricao), metadata.dataDocumento ?? null,
        file.originalname.slice(0, 255), file.mimetype, file.size, storageKey, auth.usuarioId],
    );
    return result.rows[0];
  } catch (error) {
    await fs.unlink(fullPath).catch(() => undefined);
    throw error;
  }
}

export async function updatePatientDocument(
  auth: AuthContext,
  patientId: string,
  documentId: string,
  input: PatientDocumentUpdate,
) {
  const result = await query(
    `update odonto.paciente_documentos set categoria = $4, descricao = $5, data_documento = $6
      where id = $1 and paciente_id = $2 and empresa_id = $3 and deleted_at is null`,
    [documentId, patientId, auth.empresaId, input.categoria, optionalText(input.descricao), input.dataDocumento ?? null],
  );
  if (!result.rowCount) {
    throw notFound('Documento nao encontrado.');
  }
}

export async function deletePatientDocument(auth: AuthContext, patientId: string, documentId: string) {
  const result = await query(
    `update odonto.paciente_documentos set deleted_at = now(), deleted_by = $4
      where id = $1 and paciente_id = $2 and empresa_id = $3 and deleted_at is null`,
    [documentId, patientId, auth.empresaId, auth.usuarioId],
  );
  if (!result.rowCount) {
    throw notFound('Documento nao encontrado.');
  }
}

export async function getPatientDocumentFile(auth: AuthContext, patientId: string, documentId: string) {
  const result = await query<{ storage_key: string; nome_original: string; mime_type: string }>(
    `select storage_key, nome_original, mime_type from odonto.paciente_documentos
      where id = $1 and paciente_id = $2 and empresa_id = $3 and deleted_at is null limit 1`,
    [documentId, patientId, auth.empresaId],
  );
  if (!result.rowCount) {
    throw notFound('Documento nao encontrado.');
  }
  const row = result.rows[0];
  const root = path.resolve(env.patientFilesDir);
  const fullPath = path.resolve(root, row.storage_key);
  if (!fullPath.startsWith(`${root}${path.sep}`)) {
    throw notFound('Arquivo nao encontrado.');
  }
  await fs.access(fullPath).catch(() => { throw notFound('Arquivo nao encontrado.'); });
  return { fullPath, fileName: row.nome_original, mimeType: row.mime_type };
}

export async function listPatientAnamneses(auth: AuthContext, patientId: string) {
  await assertPatient({ query }, auth, patientId);
  const result = await query<{
    id: string;
    versao: number;
    observacoes: string | null;
    aceite_paciente: boolean;
    assinatura_nome: string | null;
    preenchida_em: string;
    responsavel_nome: string | null;
    respostas: Array<{ codigo: string; resposta: string; detalhes: string | null }>;
  }>(
    `select a.id, a.versao, a.observacoes, a.aceite_paciente, a.assinatura_nome,
            a.preenchida_em, u.nome as responsavel_nome,
            coalesce(json_agg(json_build_object(
              'codigo', ar.pergunta_codigo, 'resposta', ar.resposta::text, 'detalhes', ar.detalhes
            ) order by ar.pergunta_codigo) filter (where ar.id is not null), '[]'::json) as respostas
       from odonto.paciente_anamneses a
       left join odonto.usuarios u on u.id = a.preenchida_por
       left join odonto.paciente_anamnese_respostas ar
         on ar.anamnese_id = a.id and ar.empresa_id = a.empresa_id
      where a.empresa_id = $1 and a.paciente_id = $2
      group by a.id, u.nome order by a.versao desc`,
    [auth.empresaId, patientId],
  );
  return {
    perguntas: anamnesisQuestions,
    versoes: result.rows.map((row) => ({
      id: row.id,
      versao: row.versao,
      observacoes: row.observacoes,
      aceitePaciente: row.aceite_paciente,
      assinaturaNome: row.assinatura_nome,
      preenchidaEm: row.preenchida_em,
      responsavelNome: row.responsavel_nome,
      respostas: row.respostas,
    })),
  };
}

export async function createPatientAnamnesis(auth: AuthContext, patientId: string, input: PatientAnamnesisInput) {
  return transaction(async (client) => {
    await assertPatient(client, auth, patientId);
    const versionResult = await client.query<{ versao: number }>(
      `select coalesce(max(versao), 0) + 1 as versao
         from odonto.paciente_anamneses where empresa_id = $1 and paciente_id = $2`,
      [auth.empresaId, patientId],
    );
    const version = Number(versionResult.rows[0].versao);
    const anamnesis = await client.query<{ id: string }>(
      `insert into odonto.paciente_anamneses (
        empresa_id, paciente_id, versao, observacoes, aceite_paciente,
        assinatura_nome, preenchida_por
      ) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [auth.empresaId, patientId, version, optionalText(input.observacoes), input.aceitePaciente,
        optionalText(input.assinaturaNome), auth.usuarioId],
    );
    for (const answer of input.respostas) {
      await client.query(
        `insert into odonto.paciente_anamnese_respostas (
          empresa_id, anamnese_id, pergunta_codigo, resposta, detalhes
        ) values ($1, $2, $3, $4, $5)`,
        [auth.empresaId, anamnesis.rows[0].id, answer.codigo, answer.resposta, optionalText(answer.detalhes)],
      );
    }
    await client.query(
      `insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
       values ($1, $2, 'paciente_anamneses', $3, 'create_version', $4::jsonb)`,
      [auth.empresaId, auth.usuarioId, anamnesis.rows[0].id, JSON.stringify({ pacienteId: patientId, versao: version })],
    );
    return { id: anamnesis.rows[0].id, versao: version };
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') {
      throw conflict('A anamnese foi atualizada por outro usuario. Tente novamente.');
    }
    throw error;
  });
}

export async function listPatientAppointments(
  auth: AuthContext,
  patientId: string,
  input: PatientAppointmentsQuery,
) {
  await assertPatient({ query }, auth, patientId);
  const result = await query<{
    id: string;
    inicio_em: string;
    fim_em: string;
    profissional_id: string | null;
    profissional_nome: string | null;
    especialidades: string | null;
    titulo: string;
    categoria: string | null;
    observacoes: string | null;
    status: string;
    confirmado_em: string | null;
    orcamento_id: string | null;
    orcamento_numero: string | null;
    procedimentos: string | null;
  }>(
    `select ae.id, ae.inicio_em, ae.fim_em, ae.profissional_id, p.nome as profissional_nome,
            specialties.especialidades, ae.titulo, ae.categoria, ae.observacoes, ae.status::text,
            ae.confirmado_em, ae.orcamento_id, upper(substr(ae.orcamento_id::text, 1, 8)) as orcamento_numero,
            procedures.procedimentos
       from odonto.agenda_eventos ae
       left join odonto.profissionais p on p.id = ae.profissional_id and p.empresa_id = ae.empresa_id
       left join lateral (
         select string_agg(e.nome, ', ' order by e.nome) as especialidades
           from odonto.profissional_especialidades pe
           join odonto.especialidades e on e.id = pe.especialidade_id and e.empresa_id = pe.empresa_id
          where pe.profissional_id = ae.profissional_id and pe.empresa_id = ae.empresa_id
       ) specialties on true
       left join lateral (
         select string_agg(aep.descricao, ', ' order by aep.descricao) as procedimentos
           from odonto.agenda_evento_procedimentos aep
          where aep.agenda_evento_id = ae.id and aep.empresa_id = ae.empresa_id
       ) procedures on true
      where ae.empresa_id = $1 and ae.paciente_id = $2
        and ($3::date is null or ae.inicio_em >= $3::date)
        and ($4::date is null or ae.inicio_em < ($4::date + interval '1 day'))
        and ($5::uuid is null or ae.profissional_id = $5::uuid)
        and ($6 = 'todos' or ae.status::text = $6)
        and ($7 = 'todos' or ($7 = 'futuros' and ae.inicio_em >= now()) or ($7 = 'anteriores' and ae.inicio_em < now()))
      order by ae.inicio_em desc`,
    [auth.empresaId, patientId, input.inicio ?? null, input.fim ?? null,
      input.profissionalId ?? null, input.status, input.periodo],
  );
  return result.rows.map((row) => ({
    id: row.id,
    inicioEm: row.inicio_em,
    fimEm: row.fim_em,
    duracaoMinutos: Math.max(1, Math.round((new Date(row.fim_em).getTime() - new Date(row.inicio_em).getTime()) / 60_000)),
    profissionalId: row.profissional_id,
    profissionalNome: row.profissional_nome,
    especialidades: row.especialidades,
    descricao: row.procedimentos || row.categoria || row.titulo,
    orcamentoId: row.orcamento_id,
    orcamentoNumero: row.orcamento_numero,
    status: row.status,
    observacoes: row.observacoes,
    confirmadoEm: row.confirmado_em,
  }));
}
