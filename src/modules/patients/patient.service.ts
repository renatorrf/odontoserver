import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { env } from '../../config/env';
import { query, transaction } from '../../database/pool';
import { AuthContext } from '../../types/public';
import { conflict, notFound } from '../../utils/http-error';
import { hasAnyValue, onlyDigits, optionalDate, optionalText } from '../../utils/normalize';
import { CreatePatientInput, PatientListQuery, UpdatePatientInput } from './patient.schemas';

interface PatientRow {
  id: string;
  numero_prontuario: string | null;
  nome: string;
  apelido: string | null;
  nascimento: string | null;
  sexo: string;
  cpf: string | null;
  rg: string | null;
  status: string;
  cadastrado_em: string;
  celular: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  cadastro_incompleto: boolean;
}

interface FullPatientRow extends PatientRow {
  estado_civil: string | null;
  escolaridade: string | null;
  como_conheceu: string | null;
  observacoes: string | null;
  fone_fixo: string | null;
  celular_pais: string | null;
  usar_celular_contato: boolean | null;
  celular_contato_de: string | null;
  outros_telefones: string | null;
  nao_possui_email: boolean | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  complemento: string | null;
  profissao: string | null;
  local_trabalho: string | null;
  tempo_trabalho: string | null;
  nome_plano: string | null;
  numero_plano: string | null;
  nome_pai: string | null;
  cpf_pai: string | null;
  rg_pai: string | null;
  profissao_pai: string | null;
  nome_mae: string | null;
  cpf_mae: string | null;
  rg_mae: string | null;
  profissao_mae: string | null;
  representante_nome: string | null;
  representante_cpf: string | null;
  representante_rg: string | null;
  representante_nascimento: string | null;
  representante_telefone: string | null;
}

function trimState(value: unknown): string | null {
  const text = optionalText(value)?.toUpperCase() ?? null;
  return text ? text.slice(0, 2) : null;
}

function emailFromInput(input: CreatePatientInput | UpdatePatientInput): string | null {
  if (input.contato.naoPossuiEmail) {
    return null;
  }

  return optionalText(input.contato.email)?.toLowerCase() ?? null;
}

async function ensurePatientPortalAccount(
  client: PoolClient,
  auth: AuthContext,
  input: CreatePatientInput | UpdatePatientInput,
): Promise<string | null> {
  const cpf = onlyDigits(input.cpf);

  if (!cpf) {
    return null;
  }

  const existingUser = await client.query<{ id: string }>(
    `
      select id
      from odonto.usuarios
      where cpf_normalizado = $1 or login::text = $1
      limit 1
    `,
    [cpf],
  );

  const email = emailFromInput(input);
  let usuarioId = existingUser.rows[0]?.id ?? null;

  if (!usuarioId) {
    const senhaHash = await bcrypt.hash(env.patientDefaultPassword, env.bcryptRounds);
    const userResult = await client.query<{ id: string }>(
      `
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
      `,
      [
        input.nome,
        cpf,
        email,
        optionalText(input.cpf),
        cpf,
        optionalText(input.contato.celular),
        senhaHash,
      ],
    );

    usuarioId = userResult.rows[0].id;
  } else {
    await client.query(
      `
        update odonto.usuarios
        set nome = $2,
            email = coalesce(email, $3),
            cpf = coalesce(cpf, $4),
            cpf_normalizado = coalesce(cpf_normalizado, $5),
            telefone = coalesce($6, telefone)
        where id = $1
      `,
      [usuarioId, input.nome, email, optionalText(input.cpf), cpf, optionalText(input.contato.celular)],
    );
  }

  const linkResult = await client.query<{ id: string; perfil: AuthContext['perfil'] }>(
    `
      select id, perfil
      from odonto.usuario_empresas
      where usuario_id = $1
        and empresa_id = $2
      limit 1
    `,
    [usuarioId, auth.empresaId],
  );
  const link = linkResult.rows[0];

  if (link && link.perfil !== 'paciente') {
    throw conflict('CPF ja vinculado a outro perfil nesta empresa.');
  }

  if (link) {
    await client.query('update odonto.usuario_empresas set ativo = true where id = $1', [link.id]);
  } else {
    await client.query(
      `
        insert into odonto.usuario_empresas (
          usuario_id,
          empresa_id,
          perfil,
          master,
          ativo
        )
        values ($1, $2, 'paciente', false, true)
      `,
      [usuarioId, auth.empresaId],
    );
  }

  return usuarioId;
}

async function upsertContato(client: PoolClient, pacienteId: string, input: CreatePatientInput | UpdatePatientInput): Promise<void> {
  const contato = input.contato;

  await client.query(
    `
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
    `,
    [
      pacienteId,
      optionalText(contato.foneFixo),
      optionalText(contato.celularPais),
      optionalText(contato.celular),
      contato.usarCelularContato,
      optionalText(contato.celularContatoDe),
      optionalText(contato.outrosTelefones),
      emailFromInput(input),
      contato.naoPossuiEmail,
    ],
  );
}

async function replaceEndereco(client: PoolClient, pacienteId: string, input: CreatePatientInput | UpdatePatientInput): Promise<void> {
  const endereco = input.endereco;

  await client.query('delete from odonto.paciente_enderecos where paciente_id = $1 and principal = true', [pacienteId]);

  if (!hasAnyValue(endereco)) {
    return;
  }

  await client.query(
    `
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
    `,
    [
      pacienteId,
      optionalText(endereco.cep),
      optionalText(endereco.cidade),
      trimState(endereco.estado),
      optionalText(endereco.logradouro),
      optionalText(endereco.numero),
      optionalText(endereco.bairro),
      optionalText(endereco.complemento),
    ],
  );
}

async function upsertComplementares(
  client: PoolClient,
  pacienteId: string,
  input: CreatePatientInput | UpdatePatientInput,
): Promise<void> {
  const complementares = input.complementares;

  if (!hasAnyValue(complementares)) {
    await client.query('delete from odonto.paciente_dados_complementares where paciente_id = $1', [pacienteId]);
    return;
  }

  await client.query(
    `
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
    `,
    [
      pacienteId,
      optionalText(complementares.profissao),
      optionalText(complementares.localTrabalho),
      optionalText(complementares.tempoTrabalho),
      optionalText(complementares.nomePlano),
      optionalText(complementares.numeroPlano),
    ],
  );
}

async function upsertFiliacao(client: PoolClient, pacienteId: string, input: CreatePatientInput | UpdatePatientInput): Promise<void> {
  const filiacao = input.filiacao;

  if (!hasAnyValue(filiacao)) {
    await client.query('delete from odonto.paciente_filiacao where paciente_id = $1', [pacienteId]);
    return;
  }

  await client.query(
    `
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
    `,
    [
      pacienteId,
      optionalText(filiacao.nomePai),
      optionalText(filiacao.cpfPai),
      onlyDigits(filiacao.cpfPai),
      optionalText(filiacao.rgPai),
      optionalText(filiacao.profissaoPai),
      optionalText(filiacao.nomeMae),
      optionalText(filiacao.cpfMae),
      onlyDigits(filiacao.cpfMae),
      optionalText(filiacao.rgMae),
      optionalText(filiacao.profissaoMae),
    ],
  );
}

async function replaceRepresentanteLegal(
  client: PoolClient,
  pacienteId: string,
  input: CreatePatientInput | UpdatePatientInput,
): Promise<void> {
  const representante = input.representanteLegal;

  await client.query('delete from odonto.paciente_representantes_legais where paciente_id = $1 and principal = true', [
    pacienteId,
  ]);

  if (!optionalText(representante.nome)) {
    return;
  }

  await client.query(
    `
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
    `,
    [
      pacienteId,
      optionalText(representante.nome),
      optionalText(representante.cpf),
      onlyDigits(representante.cpf),
      optionalText(representante.rg),
      optionalDate(representante.nascimento),
      optionalText(representante.telefone),
    ],
  );
}

function mapFullPatient(row: FullPatientRow) {
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

async function assertPatientExists(client: PoolClient, auth: AuthContext, patientId: string): Promise<void> {
  const result = await client.query('select id from odonto.pacientes where id = $1 and empresa_id = $2 limit 1', [
    patientId,
    auth.empresaId,
  ]);

  if (!result.rows.length) {
    throw notFound('Paciente nao encontrado.');
  }
}

export async function listPatients(auth: AuthContext, params: PatientListQuery): Promise<PatientRow[]> {
  const search = optionalText(params.search);
  const result = await query<PatientRow>(
    `
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
    `,
    [auth.empresaId, search],
  );

  return result.rows;
}

export async function getPatient(auth: AuthContext, patientId: string) {
  const result = await query<FullPatientRow>(
    `
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
    `,
    [patientId, auth.empresaId],
  );
  const row = result.rows[0];

  if (!row) {
    throw notFound('Paciente nao encontrado.');
  }

  return mapFullPatient(row);
}

export async function createPatient(auth: AuthContext, input: CreatePatientInput): Promise<{ id: string; nome: string }> {
  return transaction(async (client) => {
    const usuarioId = await ensurePatientPortalAccount(client, auth, input);
    const pacienteResult = await client.query(
      `
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
      `,
      [
        auth.empresaId,
        usuarioId,
        optionalText(input.numeroProntuario),
        input.nome,
        optionalText(input.apelido),
        optionalDate(input.nascimento),
        input.sexo,
        optionalText(input.cpf),
        onlyDigits(input.cpf),
        optionalText(input.rg),
        optionalText(input.estadoCivil),
        optionalText(input.escolaridade),
        optionalText(input.comoConheceu),
        optionalText(input.observacoes),
        auth.usuarioId,
      ],
    );

    const paciente = pacienteResult.rows[0];

    await upsertContato(client, paciente.id, input);
    await replaceEndereco(client, paciente.id, input);
    await upsertComplementares(client, paciente.id, input);
    await upsertFiliacao(client, paciente.id, input);
    await replaceRepresentanteLegal(client, paciente.id, input);

    await client.query(
      `
        insert into odonto.audit_logs (
          empresa_id,
          usuario_id,
          entidade,
          entidade_id,
          acao,
          payload
        )
        values ($1, $2, 'pacientes', $3, 'create', $4::jsonb)
      `,
      [auth.empresaId, auth.usuarioId, paciente.id, JSON.stringify({ nome: paciente.nome })],
    );

    return paciente;
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') {
      throw conflict('Paciente ja cadastrado para esta empresa com este CPF ou prontuario.');
    }

    throw error;
  });
}

export async function createOrLinkMinimalPatient(
  client: PoolClient,
  auth: AuthContext,
  input: { nome: string; cpf: string; celular: string; pacienteId?: string | null },
): Promise<{ id: string; nome: string; cadastroIncompleto: boolean }> {
  const cpf = onlyDigits(input.cpf);
  if (!cpf || cpf.length !== 11) {
    throw conflict('Informe um CPF valido para cadastrar o paciente.');
  }

  const minimalInput: CreatePatientInput = {
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
    const duplicateCpf = await client.query(
      `select 1 from odonto.pacientes
        where empresa_id = $1 and cpf_normalizado = $2 and id <> $3::uuid limit 1`,
      [auth.empresaId, cpf, input.pacienteId],
    );
    if (duplicateCpf.rowCount) {
      throw conflict('CPF ja cadastrado para outro paciente nesta empresa.');
    }
  }
  const existing = await client.query<{ id: string; nome: string; cadastro_incompleto: boolean; cpf_normalizado: string | null }>(
    `select id, nome, cadastro_incompleto, cpf_normalizado
       from odonto.pacientes
      where empresa_id = $1 and (cpf_normalizado = $2 or id = $3::uuid)
      order by case when id = $3::uuid then 0 else 1 end
      limit 1
      for update`,
    [auth.empresaId, cpf, input.pacienteId ?? null],
  );
  let patient = existing.rows[0];

  if (patient) {
    if (input.pacienteId && patient.id !== input.pacienteId) {
      throw conflict('CPF ja cadastrado para outro paciente nesta empresa.');
    }
    if (patient.cpf_normalizado && patient.cpf_normalizado !== cpf) {
      throw conflict('O CPF informado nao corresponde ao paciente vinculado.');
    }
    await client.query(
      `update odonto.pacientes
          set usuario_id = coalesce(usuario_id, $3), cpf = coalesce(cpf, $4),
              cpf_normalizado = coalesce(cpf_normalizado, $5), status = 'ativo', updated_by = $6
        where id = $1 and empresa_id = $2`,
      [patient.id, auth.empresaId, usuarioId, input.cpf, cpf, auth.usuarioId],
    );
  } else {
    const created = await client.query<{ id: string; nome: string; cadastro_incompleto: boolean; cpf_normalizado: string | null }>(
      `insert into odonto.pacientes (
        empresa_id, usuario_id, nome, sexo, cpf, cpf_normalizado, observacoes,
        cadastro_incompleto, created_by, updated_by
      ) values ($1, $2, $3, 'nao_informado', $4, $5,
        'Cadastro inicial criado durante a aprovacao de orcamento.', true, $6, $6)
      returning id, nome, cadastro_incompleto, cpf_normalizado`,
      [auth.empresaId, usuarioId, input.nome, input.cpf, cpf, auth.usuarioId],
    );
    patient = created.rows[0];
  }

  await client.query(
    `insert into odonto.paciente_contatos (
      paciente_id, celular_pais, celular, usar_celular_contato, nao_possui_email
    ) values ($1, 'BR', $2, false, true)
    on conflict (paciente_id) do update set
      celular = coalesce(odonto.paciente_contatos.celular, excluded.celular)`,
    [patient.id, optionalText(input.celular)],
  );
  await client.query(
    `insert into odonto.audit_logs (empresa_id, usuario_id, entidade, entidade_id, acao, payload)
     values ($1, $2, 'pacientes', $3, $4, $5::jsonb)`,
    [auth.empresaId, auth.usuarioId, patient.id, existing.rowCount ? 'link_quote' : 'create_minimal', JSON.stringify({ cpf, origem: 'orcamento' })],
  );
  return { id: patient.id, nome: patient.nome, cadastroIncompleto: patient.cadastro_incompleto };
}

export async function updatePatient(
  auth: AuthContext,
  patientId: string,
  input: UpdatePatientInput,
): Promise<{ id: string; nome: string }> {
  return transaction(async (client) => {
    await assertPatientExists(client, auth, patientId);
    const usuarioId = await ensurePatientPortalAccount(client, auth, input);

    const pacienteResult = await client.query<{ id: string; nome: string }>(
      `
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
      `,
      [
        patientId,
        auth.empresaId,
        usuarioId,
        optionalText(input.numeroProntuario),
        input.nome,
        optionalText(input.apelido),
        optionalDate(input.nascimento),
        input.sexo,
        optionalText(input.cpf),
        onlyDigits(input.cpf),
        optionalText(input.rg),
        optionalText(input.estadoCivil),
        optionalText(input.escolaridade),
        optionalText(input.comoConheceu),
        optionalText(input.observacoes),
        auth.usuarioId,
      ],
    );

    const paciente = pacienteResult.rows[0];

    await upsertContato(client, paciente.id, input);
    await replaceEndereco(client, paciente.id, input);
    await upsertComplementares(client, paciente.id, input);
    await upsertFiliacao(client, paciente.id, input);
    await replaceRepresentanteLegal(client, paciente.id, input);

    await client.query(
      `
        insert into odonto.audit_logs (
          empresa_id,
          usuario_id,
          entidade,
          entidade_id,
          acao,
          payload
        )
        values ($1, $2, 'pacientes', $3, 'update', $4::jsonb)
      `,
      [auth.empresaId, auth.usuarioId, paciente.id, JSON.stringify({ nome: paciente.nome })],
    );

    return paciente;
  }).catch((error: { code?: string }) => {
    if (error.code === '23505') {
      throw conflict('Paciente ja cadastrado para esta empresa com este CPF ou prontuario.');
    }

    throw error;
  });
}

export async function inactivatePatient(auth: AuthContext, patientId: string): Promise<void> {
  await transaction(async (client) => {
    const result = await client.query<{ usuario_id: string | null }>(
      `
        update odonto.pacientes
        set status = 'inativo',
            updated_by = $3
        where id = $1
          and empresa_id = $2
        returning usuario_id
      `,
      [patientId, auth.empresaId, auth.usuarioId],
    );
    const patient = result.rows[0];

    if (!patient) {
      throw notFound('Paciente nao encontrado.');
    }

    if (patient.usuario_id) {
      await client.query(
        `
          update odonto.usuario_empresas
          set ativo = false
          where usuario_id = $1
            and empresa_id = $2
            and perfil = 'paciente'
        `,
        [patient.usuario_id, auth.empresaId],
      );
    }

    await client.query(
      `
        insert into odonto.audit_logs (
          empresa_id,
          usuario_id,
          entidade,
          entidade_id,
          acao
        )
        values ($1, $2, 'pacientes', $3, 'inactivate')
      `,
      [auth.empresaId, auth.usuarioId, patientId],
    );
  });
}
