import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';

import { env } from '../config/env';
import { pool, transaction } from './pool';

type SeedContext = {
  empresaId: string;
  usuarioId: string;
  unidadeId: string;
  today: string;
};

type PatientSeed = {
  id: string;
  nome: string;
  nascimento: string;
  sexo: 'masculino' | 'feminino' | 'outro';
  celular: string;
  email: string;
  cidade: string;
  profissao: string;
};

type ProfessionalSeed = {
  id: string;
  nome: string;
  conselho: string;
  cor: string;
  especialidade: string;
  percentual: number;
  chavePix: string;
};

type ProcedureSeed = {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  duracao: number;
  valor: number;
  custo: number;
};

function demoId(group: number, index: number): string {
  const first = `d${group.toString(16)}${index.toString(16).padStart(6, '0')}`;
  const last = `${group.toString(16).padStart(2, '0')}${index.toString(16).padStart(10, '0')}`;
  return `${first}-0000-4000-8000-${last}`;
}

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function nextBusinessDay(value: string, businessDays: number): string {
  let result = value;
  let remaining = businessDays;

  while (remaining > 0) {
    result = addDays(result, 1);
    const weekday = parseDate(result).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }

  return result;
}

function atTime(date: string, time: string): string {
  return `${date}T${time}:00-03:00`;
}

async function resolveContext(client: PoolClient): Promise<SeedContext> {
  const requestedCompany = process.env.DEMO_EMPRESA_ID?.trim() || null;
  const result = await client.query<{
    empresa_id: string;
    usuario_id: string;
    nome_fantasia: string;
    today: string;
  }>(
    `
      select e.id as empresa_id, u.id as usuario_id, e.nome_fantasia,
             timezone('America/Sao_Paulo', now())::date::text as today
        from odonto.empresas e
        join odonto.usuario_empresas ue on ue.empresa_id = e.id and ue.ativo = true
        join odonto.usuarios u on u.id = ue.usuario_id and u.ativo = true
       where lower(u.login::text) = 'master'
         and ue.master = true
         and ($1::uuid is null or e.id = $1::uuid)
       order by e.nome_fantasia
       limit 1
    `,
    [requestedCompany],
  );

  const membership = result.rows[0];
  if (!membership) {
    throw new Error('Nenhuma empresa ativa vinculada ao login master foi encontrada.');
  }

  const unidadeId = demoId(8, 1);
  await client.query(
    `
      insert into odonto.unidades (
        id, empresa_id, nome, email, telefone, cep, logradouro, numero,
        bairro, cidade, estado, complemento, ativo
      ) values ($1, $2, 'Unidade Centro - Demonstracao', 'unidade.demo@example.com',
        '(34) 3333-4400', '38400-100', 'Avenida Afonso Pena', '880',
        'Centro', 'Uberlandia', 'MG', '2o andar', true)
      on conflict (id) do update set
        nome = excluded.nome, email = excluded.email, telefone = excluded.telefone,
        cep = excluded.cep, logradouro = excluded.logradouro, numero = excluded.numero,
        bairro = excluded.bairro, cidade = excluded.cidade, estado = excluded.estado,
        complemento = excluded.complemento, ativo = true
    `,
    [unidadeId, membership.empresa_id],
  );

  console.log(`Tenant: ${membership.nome_fantasia} (${membership.empresa_id})`);
  return {
    empresaId: membership.empresa_id,
    usuarioId: membership.usuario_id,
    unidadeId,
    today: membership.today,
  };
}

const patients: PatientSeed[] = [
  ['Marina Oliveira', '1991-04-12', 'feminino', '(34) 99999-1001', 'marina.demo@example.com', 'Uberlandia', 'Arquiteta'],
  ['Carlos Eduardo Mendes', '1984-09-03', 'masculino', '(34) 99999-1002', 'carlos.demo@example.com', 'Uberlandia', 'Empresario'],
  ['Ana Clara Ribeiro', '1998-01-25', 'feminino', '(34) 99999-1003', 'ana.demo@example.com', 'Araguari', 'Professora'],
  ['Joao Pedro Martins', '1977-11-18', 'masculino', '(34) 99999-1004', 'joao.demo@example.com', 'Uberlandia', 'Engenheiro'],
  ['Beatriz Almeida Costa', '2002-06-09', 'feminino', '(34) 99999-1005', 'beatriz.demo@example.com', 'Uberlandia', 'Estudante'],
  ['Rafael Nogueira Lima', '1989-03-30', 'masculino', '(34) 99999-1006', 'rafael.demo@example.com', 'Ituiutaba', 'Contador'],
  ['Luciana Ferreira Alves', '1972-08-14', 'feminino', '(34) 99999-1007', 'luciana.demo@example.com', 'Uberlandia', 'Comerciante'],
  ['Gustavo Henrique Souza', '1995-12-02', 'masculino', '(34) 99999-1008', 'gustavo.demo@example.com', 'Uberlandia', 'Analista de sistemas'],
  ['Patricia Gomes Rocha', '1981-05-21', 'feminino', '(34) 99999-1009', 'patricia.demo@example.com', 'Uberlandia', 'Administradora'],
  ['Eduardo Pires Carvalho', '1968-07-17', 'masculino', '(34) 99999-1010', 'eduardo.demo@example.com', 'Araguari', 'Produtor rural'],
  ['Fernanda Castro Moraes', '1993-10-08', 'feminino', '(34) 99999-1011', 'fernanda.demo@example.com', 'Uberlandia', 'Fisioterapeuta'],
  ['Lucas Barbosa Freitas', '1986-02-27', 'masculino', '(34) 99999-1012', 'lucas.demo@example.com', 'Uberlandia', 'Representante comercial'],
].map(([nome, nascimento, sexo, celular, email, cidade, profissao], index) => ({
  id: demoId(1, index + 1), nome, nascimento, sexo, celular, email, cidade, profissao,
})) as PatientSeed[];

const professionals: ProfessionalSeed[] = [
  { id: demoId(2, 1), nome: 'Dra. Danielle Pereira Borges', conselho: 'DEMO-53921', cor: '#0E8F81', especialidade: 'Clinica geral', percentual: 30, chavePix: 'danielle.demo@example.com' },
  { id: demoId(2, 2), nome: 'Dr. Felipe Rodrigues Netto', conselho: 'DEMO-48217', cor: '#2563A6', especialidade: 'Implantodontia', percentual: 35, chavePix: '34999992002' },
  { id: demoId(2, 3), nome: 'Dra. Jennyfer Oliveira Rosa', conselho: 'DEMO-61508', cor: '#C44C66', especialidade: 'Ortodontia', percentual: 28, chavePix: 'jennyfer.demo@example.com' },
  { id: demoId(2, 4), nome: 'Dr. Victor Demuro', conselho: 'DEMO-70432', cor: '#A66A2C', especialidade: 'Endodontia', percentual: 32, chavePix: '34999992004' },
];

const procedures: ProcedureSeed[] = [
  { id: demoId(3, 1), codigo: 'DEMO-001', nome: 'Avaliacao odontologica completa', categoria: 'Consulta', duracao: 45, valor: 180, custo: 22 },
  { id: demoId(3, 2), codigo: 'DEMO-002', nome: 'Profilaxia e prevencao', categoria: 'Prevencao', duracao: 60, valor: 260, custo: 48 },
  { id: demoId(3, 3), codigo: 'DEMO-003', nome: 'Clareamento dental em consultorio', categoria: 'Estetica', duracao: 90, valor: 1200, custo: 310 },
  { id: demoId(3, 4), codigo: 'DEMO-004', nome: 'Restauracao em resina composta', categoria: 'Dentistica', duracao: 60, valor: 420, custo: 95 },
  { id: demoId(3, 5), codigo: 'DEMO-005', nome: 'Tratamento endodontico', categoria: 'Endodontia', duracao: 120, valor: 1450, custo: 280 },
  { id: demoId(3, 6), codigo: 'DEMO-006', nome: 'Coroa em porcelana', categoria: 'Protese', duracao: 90, valor: 2100, custo: 720 },
  { id: demoId(3, 7), codigo: 'DEMO-007', nome: 'Manutencao ortodontica', categoria: 'Ortodontia', duracao: 30, valor: 220, custo: 35 },
  { id: demoId(3, 8), codigo: 'DEMO-008', nome: 'Extracao dentaria simples', categoria: 'Cirurgia', duracao: 60, valor: 550, custo: 105 },
  { id: demoId(3, 9), codigo: 'DEMO-009', nome: 'Implante unitario demonstracao', categoria: 'Implantodontia', duracao: 120, valor: 3200, custo: 1180 },
  { id: demoId(3, 10), codigo: 'DEMO-010', nome: 'Placa para bruxismo', categoria: 'Protese', duracao: 45, valor: 680, custo: 190 },
];

async function seedPatients(client: PoolClient, context: SeedContext): Promise<void> {
  const passwordHash = await bcrypt.hash('odonto1234', env.bcryptRounds);
  const patientUserId = demoId(12, 1);

  await client.query(
    `insert into odonto.usuarios (
       id, nome, login, email, cpf, cpf_normalizado, telefone, senha_hash, senha_temporaria, ativo
     ) values ($1, $2, '99999999001', $3, '999.999.990-01', '99999999001', $4, $5, true, true)
     on conflict (id) do update set nome = excluded.nome, email = excluded.email,
       telefone = excluded.telefone, senha_hash = excluded.senha_hash,
       senha_temporaria = true, ativo = true`,
    [patientUserId, patients[0].nome, patients[0].email, patients[0].celular, passwordHash],
  );
  await client.query(
    `insert into odonto.usuario_empresas (id, usuario_id, empresa_id, perfil, master, ativo)
     values ($1, $2, $3, 'paciente', false, true)
     on conflict (usuario_id, empresa_id) do update set perfil = 'paciente', ativo = true`,
    [demoId(12, 2), patientUserId, context.empresaId],
  );

  for (const [index, patient] of patients.entries()) {
    const prontuario = `DEMO-${String(index + 1).padStart(4, '0')}`;
    await client.query(
      `insert into odonto.pacientes (
         id, empresa_id, unidade_origem_id, usuario_id, numero_prontuario, nome,
         nascimento, sexo, estado_civil, como_conheceu, observacoes, status,
         cadastro_incompleto, created_by, updated_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,'Solteiro(a)','Indicacao de paciente',
         'Registro sintetico para apresentacao do sistema.', 'ativo', false, $9, $9)
       on conflict (id) do update set unidade_origem_id = excluded.unidade_origem_id,
         usuario_id = excluded.usuario_id, numero_prontuario = excluded.numero_prontuario,
         nome = excluded.nome, nascimento = excluded.nascimento, sexo = excluded.sexo,
         observacoes = excluded.observacoes, status = 'ativo', cadastro_incompleto = false,
         updated_by = excluded.updated_by`,
      [patient.id, context.empresaId, context.unidadeId, index === 0 ? patientUserId : null,
        prontuario, patient.nome, patient.nascimento, patient.sexo, context.usuarioId],
    );
    await client.query(
      `insert into odonto.paciente_contatos (
         paciente_id, celular_pais, celular, usar_celular_contato, email, nao_possui_email
       ) values ($1,'BR',$2,true,$3,false)
       on conflict (paciente_id) do update set celular = excluded.celular,
         usar_celular_contato = true, email = excluded.email, nao_possui_email = false`,
      [patient.id, patient.celular, patient.email],
    );
    await client.query(
      `insert into odonto.paciente_enderecos (
         id, paciente_id, tipo, principal, cep, cidade, estado, logradouro, numero, bairro
       ) values ($1,$2,'principal',true,'38400-100',$3,'MG','Avenida Brasil',$4,'Centro')
       on conflict (id) do update set cidade = excluded.cidade, estado = excluded.estado,
         logradouro = excluded.logradouro, numero = excluded.numero, bairro = excluded.bairro`,
      [demoId(15, index + 1), patient.id, patient.cidade, String(100 + index * 17)],
    );
    await client.query(
      `insert into odonto.paciente_dados_complementares (paciente_id, profissao, local_trabalho)
       values ($1,$2,'Empresa demonstracao')
       on conflict (paciente_id) do update set profissao = excluded.profissao,
         local_trabalho = excluded.local_trabalho`,
      [patient.id, patient.profissao],
    );
  }
}

async function seedProfessionals(client: PoolClient, context: SeedContext): Promise<void> {
  for (const [index, professional] of professionals.entries()) {
    await client.query(
      `insert into odonto.profissionais (
         id, empresa_id, unidade_id, nome, conselho_tipo, conselho_uf, conselho_numero,
         cor_agenda, email, celular, cidade, estado, chave_pix, observacoes, status,
         agenda_habilitada, visualizacao_agenda, created_by, updated_by
       ) values ($1,$2,$3,$4,'CRO','MG',$5,$6,$7,$8,'Uberlandia','MG',$9,
         'Profissional sintetico para demonstracao.', 'ativo', true, 'clinica', $10, $10)
       on conflict (id) do update set unidade_id = excluded.unidade_id, nome = excluded.nome,
         conselho_numero = excluded.conselho_numero, cor_agenda = excluded.cor_agenda,
         email = excluded.email, celular = excluded.celular, chave_pix = excluded.chave_pix,
         status = 'ativo', agenda_habilitada = true, updated_by = excluded.updated_by`,
      [professional.id, context.empresaId, context.unidadeId, professional.nome,
        professional.conselho, professional.cor, `profissional${index + 1}.demo@example.com`,
        `(34) 99999-20${String(index + 1).padStart(2, '0')}`, professional.chavePix, context.usuarioId],
    );

    const suggestedSpecialtyId = demoId(10, index + 1);
    await client.query(
      `insert into odonto.especialidades (id, empresa_id, nome, ativo)
       select $1,$2,$3::varchar,true
        where not exists (
          select 1 from odonto.especialidades
           where empresa_id = $2 and lower(nome) = lower($3::text)
        )`,
      [suggestedSpecialtyId, context.empresaId, professional.especialidade],
    );
    const specialtyResult = await client.query<{ id: string }>(
      `select id from odonto.especialidades
        where empresa_id = $1 and lower(nome) = lower($2)
        order by created_at limit 1`,
      [context.empresaId, professional.especialidade],
    );
    const specialtyId = specialtyResult.rows[0].id;
    await client.query(
      `insert into odonto.profissional_especialidades (empresa_id, profissional_id, especialidade_id)
       values ($1,$2,$3) on conflict (profissional_id, especialidade_id) do nothing`,
      [context.empresaId, professional.id, specialtyId],
    );

    for (let weekday = 1; weekday <= 6; weekday += 1) {
      await client.query(
        `insert into odonto.profissional_disponibilidades (
           id, empresa_id, profissional_id, dia_semana, hora_inicio, hora_fim, intervalo_minutos, ativo
         ) values ($1,$2,$3,$4,$5,$6,30,true)
         on conflict (id) do update set hora_inicio = excluded.hora_inicio,
           hora_fim = excluded.hora_fim, intervalo_minutos = 30, ativo = true`,
        [demoId(10, 100 + index * 10 + weekday), context.empresaId, professional.id, weekday,
          weekday === 6 ? '08:00' : '08:00', weekday === 6 ? '13:00' : '19:00'],
      );
    }

    await client.query(
      `insert into odonto.profissional_comissoes (
         id, empresa_id, profissional_id, valido_desde, duracao_indeterminada,
         requer_aprovacao, tipo, momento, percentual_geral, percentual_plano,
         descontar_impostos, descontar_taxas_pagamento, ativo, created_by
       ) values ($1,$2,$3,$4,true,false,'porcentagem','recebimento_pagamento',$5,$6,true,false,true,$7)
       on conflict (id) do update set valido_desde = excluded.valido_desde,
         percentual_geral = excluded.percentual_geral, percentual_plano = excluded.percentual_plano,
         ativo = true`,
      [demoId(10, 200 + index + 1), context.empresaId, professional.id,
        addDays(context.today, -365), professional.percentual, professional.percentual - 5, context.usuarioId],
    );
  }
}

async function seedProcedureCatalog(client: PoolClient, context: SeedContext): Promise<void> {
  for (const procedure of procedures) {
    await client.query(
      `insert into odonto.catalogo_procedimentos (
         id, empresa_id, codigo, nome, descricao, categoria, duracao_minutos,
         valor, custo_variavel, ativo, created_by, updated_by
       ) values ($1,$2,$3,$4,'Procedimento sintetico para demonstracao.',$5,$6,$7,$8,true,$9,$9)
       on conflict (id) do update set codigo = excluded.codigo, nome = excluded.nome,
         categoria = excluded.categoria, duracao_minutos = excluded.duracao_minutos,
         valor = excluded.valor, custo_variavel = excluded.custo_variavel,
         ativo = true, updated_by = excluded.updated_by`,
      [procedure.id, context.empresaId, procedure.codigo, procedure.nome, procedure.categoria,
        procedure.duracao, procedure.valor, procedure.custo, context.usuarioId],
    );
  }
}

type QuoteSeed = {
  id: string;
  patientIndex: number | null;
  professionalIndex: number | null;
  status: string;
  origem: string;
  procedureIndexes: number[];
  desconto: number;
  motivo?: string;
};

const quotes: QuoteSeed[] = [
  { id: demoId(4, 1), patientIndex: 0, professionalIndex: 0, status: 'aprovado', origem: 'consulta', procedureIndexes: [1, 3], desconto: 80 },
  { id: demoId(4, 2), patientIndex: 1, professionalIndex: 1, status: 'aprovado', origem: 'rapido', procedureIndexes: [8], desconto: 200 },
  { id: demoId(4, 3), patientIndex: 2, professionalIndex: 2, status: 'aguardando_aprovacao', origem: 'rapido', procedureIndexes: [6], desconto: 0 },
  { id: demoId(4, 4), patientIndex: null, professionalIndex: null, status: 'nao_aprovado', origem: 'rapido', procedureIndexes: [2], desconto: 100, motivo: 'Cliente solicitou avaliar o investimento.' },
  { id: demoId(4, 5), patientIndex: 8, professionalIndex: 0, status: 'nao_aprovado', origem: 'pasta_vermelha', procedureIndexes: [2, 9], desconto: 120, motivo: 'Nao houve retorno apos o envio.' },
  { id: demoId(4, 6), patientIndex: 3, professionalIndex: 3, status: 'concluido', origem: 'consulta', procedureIndexes: [4], desconto: 50 },
];

async function seedQuotes(client: PoolClient, context: SeedContext): Promise<void> {
  for (const [quoteIndex, quote] of quotes.entries()) {
    const patient = quote.patientIndex === null ? null : patients[quote.patientIndex];
    const professional = quote.professionalIndex === null ? null : professionals[quote.professionalIndex];
    const name = patient?.nome ?? 'Camila Andrade - oportunidade';
    const whatsapp = patient?.celular ?? '(34) 99999-1099';
    await client.query(
      `insert into odonto.orcamentos (
         id, empresa_id, paciente_id, profissional_id, nome_contato, whatsapp,
         origem, status, validade, desconto_valor, desconto_tipo, observacoes,
         motivo_nao_aprovacao, enviado_em, aprovado_em, nao_aprovado_em,
         created_by, updated_by, created_at
       ) values ($1,$2,$3,$4,$5,$6,$7::odonto.orcamento_origem,$8::odonto.orcamento_status,
         $9,$10,'valor','Orcamento sintetico para apresentacao.',$11,
         case when $8 in ('enviado','aprovado','aguardando_aprovacao','concluido') then now() - interval '2 days' end,
         case when $8 in ('aprovado','concluido') then now() - interval '1 day' end,
         case when $8 = 'nao_aprovado' then now() - interval '35 days' end,
         $12,$12, now() - ($13::text || ' days')::interval)
       on conflict (id) do update set paciente_id = excluded.paciente_id,
         profissional_id = excluded.profissional_id, nome_contato = excluded.nome_contato,
         whatsapp = excluded.whatsapp, origem = excluded.origem, status = excluded.status,
         validade = excluded.validade, desconto_valor = excluded.desconto_valor,
         observacoes = excluded.observacoes, motivo_nao_aprovacao = excluded.motivo_nao_aprovacao,
         updated_by = excluded.updated_by, created_at = excluded.created_at`,
      [quote.id, context.empresaId, patient?.id ?? null, professional?.id ?? null, name, whatsapp,
        quote.origem, quote.status, addDays(context.today, 15), quote.desconto, quote.motivo ?? null,
        context.usuarioId, quote.status === 'nao_aprovado' ? 35 + quoteIndex * 12 : 3 + quoteIndex],
    );
    await client.query('delete from odonto.orcamento_itens where orcamento_id = $1', [quote.id]);

    for (const [itemIndex, procedureIndex] of quote.procedureIndexes.entries()) {
      const procedure = procedures[procedureIndex];
      await client.query(
        `insert into odonto.orcamento_itens (
           id, orcamento_id, catalogo_procedimento_id, descricao, quantidade,
           valor_unitario, valor_total, ordem, duracao_minutos, status,
           desconto_valor, desconto_justificativa
         ) values ($1,$2,$3,$4,1,$5,$5,$6,$7,$8,0,null)`,
        [demoId(14, quoteIndex * 10 + itemIndex + 1), quote.id, procedure.id,
          procedure.nome, procedure.valor, itemIndex, procedure.duracao,
          quote.status === 'concluido' ? 'concluido' : quote.status === 'aprovado' ? 'autorizado' : 'planejado'],
      );
    }
  }
}

type EventSeed = {
  id: string;
  date: string;
  time: string;
  patientIndex: number | null;
  professionalIndex: number;
  procedureIndex: number | null;
  status: string;
  quoteIndex?: number;
  tipo?: 'consulta' | 'compromisso';
};

function buildEvents(today: string): EventSeed[] {
  return [
    { id: demoId(5, 1), date: today, time: '08:00', patientIndex: 0, professionalIndex: 0, procedureIndex: 1, status: 'confirmado', quoteIndex: 0 },
    { id: demoId(5, 2), date: today, time: '09:30', patientIndex: 1, professionalIndex: 1, procedureIndex: 8, status: 'agendado', quoteIndex: 1 },
    { id: demoId(5, 3), date: today, time: '11:00', patientIndex: 2, professionalIndex: 2, procedureIndex: 6, status: 'em_espera' },
    { id: demoId(5, 4), date: today, time: '14:00', patientIndex: 3, professionalIndex: 3, procedureIndex: 4, status: 'em_atendimento', quoteIndex: 5 },
    { id: demoId(5, 5), date: today, time: '16:30', patientIndex: 4, professionalIndex: 0, procedureIndex: 3, status: 'atrasado' },
    { id: demoId(5, 6), date: today, time: '18:00', patientIndex: null, professionalIndex: 1, procedureIndex: null, status: 'agendado', tipo: 'compromisso' },
    { id: demoId(5, 7), date: nextBusinessDay(today, 1), time: '08:30', patientIndex: 5, professionalIndex: 0, procedureIndex: 2, status: 'confirmado' },
    { id: demoId(5, 8), date: nextBusinessDay(today, 1), time: '10:00', patientIndex: 6, professionalIndex: 2, procedureIndex: 6, status: 'agendado' },
    { id: demoId(5, 9), date: nextBusinessDay(today, 2), time: '09:00', patientIndex: 7, professionalIndex: 3, procedureIndex: 7, status: 'confirmado' },
    { id: demoId(5, 10), date: nextBusinessDay(today, 3), time: '14:00', patientIndex: 0, professionalIndex: 1, procedureIndex: 5, status: 'agendado' },
    { id: demoId(5, 11), date: nextBusinessDay(today, 5), time: '15:30', patientIndex: 1, professionalIndex: 2, procedureIndex: 6, status: 'agendado' },
    { id: demoId(5, 12), date: nextBusinessDay(today, 8), time: '10:30', patientIndex: 2, professionalIndex: 0, procedureIndex: 9, status: 'confirmado' },
    { id: demoId(5, 13), date: addDays(today, -2), time: '09:00', patientIndex: 5, professionalIndex: 0, procedureIndex: 1, status: 'atendido' },
    { id: demoId(5, 14), date: addDays(today, -3), time: '14:30', patientIndex: 6, professionalIndex: 1, procedureIndex: 8, status: 'faltou' },
    { id: demoId(5, 15), date: addDays(today, -4), time: '16:00', patientIndex: 7, professionalIndex: 2, procedureIndex: 6, status: 'cancelado' },
  ];
}

async function seedSchedule(client: PoolClient, context: SeedContext): Promise<EventSeed[]> {
  const events = buildEvents(context.today);
  for (const [index, event] of events.entries()) {
    const professional = professionals[event.professionalIndex];
    const patient = event.patientIndex === null ? null : patients[event.patientIndex];
    const procedure = event.procedureIndex === null ? null : procedures[event.procedureIndex];
    const duration = procedure?.duracao ?? 60;
    const start = atTime(event.date, event.time);
    const quoteId = event.tipo === 'compromisso' ? null : demoId(4, 100 + index + 1);
    const title = event.tipo === 'compromisso' ? 'Reuniao de alinhamento clinico' : patient?.nome ?? 'Consulta';

    if (quoteId && patient && procedure) {
      await client.query(
        `insert into odonto.orcamentos (
           id, empresa_id, paciente_id, profissional_id, nome_contato, whatsapp,
           origem, status, validade, desconto_valor, desconto_tipo, observacoes,
           aprovado_em, created_by, updated_by
         ) values ($1,$2,$3,$4,$5,$6,'consulta','aprovado',$7,0,'valor',
           'Orcamento gerado pela agenda demonstrativa.',now(),$8,$8)
         on conflict (id) do update set paciente_id = excluded.paciente_id,
           profissional_id = excluded.profissional_id, nome_contato = excluded.nome_contato,
           whatsapp = excluded.whatsapp, origem = excluded.origem, status = excluded.status,
           validade = excluded.validade, observacoes = excluded.observacoes,
           updated_by = excluded.updated_by`,
        [quoteId, context.empresaId, patient.id, professional.id, patient.nome, patient.celular,
          addDays(event.date, 15), context.usuarioId],
      );
    }

    await client.query(
      `insert into odonto.agenda_eventos (
         id, empresa_id, unidade_id, profissional_id, paciente_id, tipo, titulo,
         categoria, observacoes, inicio_em, fim_em, dia_inteiro, primeira_consulta,
         status, orcamento_id, lembrete_duas_horas_habilitado, notificar_aplicativo,
         notificar_whatsapp, confirmado_em, inicio_atendimento_em, justificativa_status,
         observacoes_procedimentos, created_by, updated_by
       ) values ($1,$2,$3,$4,$5,$6::odonto.agenda_evento_tipo,$7,$8,'Registro sintetico para apresentacao.',$9,
         $9::timestamptz + ($10::text || ' minutes')::interval,false,$11,$12::odonto.agenda_evento_status,
         $13,true,true,true,
         case when $12 = 'confirmado' then now() end,
         case when $12 = 'em_atendimento' then now() - interval '10 minutes' end,
         case when $12 in ('faltou','cancelado') then 'Justificativa registrada para demonstracao.' end,
         case when $6::text = 'consulta' then 'Evolucao e observacoes clinicas demonstrativas.' end,$14,$14)
       on conflict (id) do update set profissional_id = excluded.profissional_id,
         paciente_id = excluded.paciente_id, tipo = excluded.tipo, titulo = excluded.titulo,
         categoria = excluded.categoria, inicio_em = excluded.inicio_em, fim_em = excluded.fim_em,
         status = excluded.status, orcamento_id = excluded.orcamento_id,
         confirmado_em = excluded.confirmado_em, inicio_atendimento_em = excluded.inicio_atendimento_em,
         justificativa_status = excluded.justificativa_status, updated_by = excluded.updated_by`,
      [event.id, context.empresaId, context.unidadeId, professional.id, patient?.id ?? null,
        event.tipo ?? 'consulta', title, procedure?.categoria ?? 'Administrativo', start, duration,
        index % 4 === 0, event.status, quoteId, context.usuarioId],
    );
    await client.query('delete from odonto.agenda_evento_procedimentos where agenda_evento_id = $1', [event.id]);
    if (procedure) {
      await client.query(
        `insert into odonto.agenda_evento_procedimentos (
           id, empresa_id, agenda_evento_id, catalogo_procedimento_id, descricao,
           valor, quantidade, duracao_minutos, status
         ) values ($1,$2,$3,$4,$5,$6,1,$7,$8)`,
        [demoId(13, index + 1), context.empresaId, event.id, procedure.id, procedure.nome,
          procedure.valor, procedure.duracao,
          ['atendido', 'concluido'].includes(event.status) ? 'concluido' : 'autorizado'],
      );
    }
    if (quoteId && patient && procedure) {
      await client.query('delete from odonto.orcamento_itens where orcamento_id = $1', [quoteId]);
      await client.query(
        `insert into odonto.orcamento_itens (
           id, orcamento_id, catalogo_procedimento_id, descricao, quantidade,
           valor_unitario, valor_total, ordem, duracao_minutos, status
         ) values ($1,$2,$3,$4,1,$5,$5,0,$6,$7)`,
        [demoId(14, 100 + index + 1), quoteId, procedure.id, procedure.nome, procedure.valor,
          procedure.duracao, ['atendido', 'concluido'].includes(event.status) ? 'concluido' : 'autorizado'],
      );
      await client.query(
        `insert into odonto.paciente_financeiro_lancamentos (
           id, empresa_id, paciente_id, orcamento_id, descricao, vencimento,
           valor, numero_parcela, total_parcelas, status, created_by, updated_by
         ) values ($1,$2,$3,$4,'Orcamento #' || upper(substr($4::uuid::text,1,8)),
           $5,$6,1,1,'pendente',$7,$7)
         on conflict (id) do update set paciente_id = excluded.paciente_id,
           orcamento_id = excluded.orcamento_id, descricao = excluded.descricao,
           vencimento = excluded.vencimento, valor = excluded.valor,
           status = case
             when odonto.paciente_financeiro_lancamentos.status = 'pago' then 'pago'::odonto.paciente_financeiro_status
             else 'pendente'::odonto.paciente_financeiro_status
           end, updated_by = excluded.updated_by`,
        [demoId(11, 100 + index + 1), context.empresaId, patient.id, quoteId,
          event.date, procedure.valor, context.usuarioId],
      );
    }
    await client.query(
      `insert into odonto.agenda_evento_status_historico (
         id, empresa_id, agenda_evento_id, status_anterior, status_novo, justificativa, created_by
       ) values ($1,$2,$3,null,$4,$5,$6)
       on conflict (id) do update set status_novo = excluded.status_novo,
         justificativa = excluded.justificativa`,
      [demoId(13, 100 + index + 1), context.empresaId, event.id, event.status,
        ['faltou', 'cancelado'].includes(event.status) ? 'Justificativa registrada para demonstracao.' : null,
        context.usuarioId],
    );
  }
  return events;
}

async function seedPerformedAndFinance(client: PoolClient, context: SeedContext): Promise<void> {
  const currentDay = Number(context.today.slice(8, 10));
  const performed = Array.from({ length: 72 }, (_, index) => {
    const procedure = procedures[index % 8];
    const professional = professionals[index % professionals.length];
    const patient = patients[index % 8];
    const offset = Math.min(currentDay - 1, (index * 2) % Math.max(currentDay, 1));
    return { id: demoId(6, index + 1), patient, professional, procedure, date: addDays(context.today, -offset) };
  });

  const inactiveHistory = [
    { patient: patients[8], professional: professionals[0], procedure: procedures[1], days: 35 },
    { patient: patients[9], professional: professionals[1], procedure: procedures[8], days: 65 },
    { patient: patients[10], professional: professionals[2], procedure: procedures[6], days: 95 },
    { patient: patients[11], professional: professionals[3], procedure: procedures[4], days: 48 },
  ];

  for (const [index, item] of [...performed, ...inactiveHistory.map((item, oldIndex) => ({
    id: demoId(6, 100 + oldIndex + 1), ...item, date: addDays(context.today, -item.days),
  }))].entries()) {
    await client.query(
      `insert into odonto.procedimentos_realizados (
         id, empresa_id, paciente_id, data_procedimento, descricao, profissional_nome,
         profissional_id, catalogo_procedimento_id, valor, observacoes, created_by
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Registro sintetico para apresentacao.',$10)
       on conflict (id) do update set data_procedimento = excluded.data_procedimento,
         descricao = excluded.descricao, profissional_nome = excluded.profissional_nome,
         profissional_id = excluded.profissional_id, catalogo_procedimento_id = excluded.catalogo_procedimento_id,
         valor = excluded.valor, observacoes = excluded.observacoes`,
      [item.id, context.empresaId, item.patient.id, item.date, item.procedure.nome,
        item.professional.nome, item.professional.id, item.procedure.id, item.procedure.valor,
        context.usuarioId],
    );

    if (index < 45) {
      const commission = item.procedure.valor * item.professional.percentual / 100;
      const paid = index % 3 === 0;
      await client.query(
        `insert into odonto.financeiro_lancamentos (
           id, empresa_id, procedimento_realizado_id, profissional_id,
           comissao_configuracao_id, valor_procedimento, comissao_tipo,
           percentual_comissao, valor_comissao, status_pagamento, faturado_em,
           faturado_por, pago_em, pago_por, forma_pagamento, referencia_pagamento,
           observacoes_pagamento
         ) values ($1,$2,$3,$4,$5,$6,'porcentagem',$7,$8,$9::odonto.pagamento_profissional_status,
           $10::date::timestamptz + interval '18 hours',$11::uuid,
           case when $9::text = 'pago' then $10::date::timestamptz + interval '20 hours' end,
           case when $9::text = 'pago' then $11::uuid end,
           case when $9::text = 'pago' then 'pix'::odonto.forma_pagamento end,
           case when $9::text = 'pago' then 'PIX-DEMO-' || $12 end,
           'Apuracao sintetica para apresentacao.')
         on conflict (procedimento_realizado_id) do update set
           valor_procedimento = excluded.valor_procedimento,
           percentual_comissao = excluded.percentual_comissao,
           valor_comissao = excluded.valor_comissao, status_pagamento = excluded.status_pagamento,
           pago_em = excluded.pago_em, pago_por = excluded.pago_por,
           forma_pagamento = excluded.forma_pagamento,
           referencia_pagamento = excluded.referencia_pagamento`,
        [demoId(7, index + 1), context.empresaId, item.id, item.professional.id,
          demoId(10, 200 + professionals.indexOf(item.professional) + 1), item.procedure.valor,
          item.professional.percentual, commission.toFixed(2), paid ? 'pago' : 'pendente',
          item.date, context.usuarioId, String(index + 1).padStart(3, '0')],
      );
    }
  }
}

async function seedManagement(client: PoolClient, context: SeedContext): Promise<string> {
  const bankId = demoId(8, 10);
  await client.query(
    `insert into odonto.bancos (
       id, empresa_id, nome, codigo_banco, agencia, conta, tipo_conta,
       titular, documento_titular, chave_pix, ativo, created_by, updated_by
     ) values ($1,$2,'Banco principal demonstracao','260','0001','123456-7','corrente',
       'Clinica Odonto','00.000.000/0001-00','financeiro.demo@example.com',true,$3,$3)
     on conflict (id) do update set nome = excluded.nome, agencia = excluded.agencia,
       conta = excluded.conta, chave_pix = excluded.chave_pix, ativo = true, updated_by = excluded.updated_by`,
    [bankId, context.empresaId, context.usuarioId],
  );

  await client.query(
    `insert into odonto.custo_operacional_config (
       empresa_id, quantidade_cadeiras, horas_produtivas_cadeira_mes, updated_by
     ) values ($1,3,176,$2)
     on conflict (empresa_id) do update set quantidade_cadeiras = 3,
       horas_produtivas_cadeira_mes = 176, updated_by = excluded.updated_by`,
    [context.empresaId, context.usuarioId],
  );

  const seriesId = demoId(8, 20);
  const monthStart = `${context.today.slice(0, 8)}01`;
  await client.query(
    `insert into odonto.despesa_series (
       id, empresa_id, descricao, categoria, fornecedor, centro_custo, valor,
       recorrencia, inicio_em, ativa, observacoes, created_by, updated_by
     ) values ($1,$2,'Aluguel da unidade','aluguel','Imobiliaria Centro','Clinica',6800,
       'mensal',$3,true,'Serie sintetica para apresentacao.',$4,$4)
     on conflict (id) do update set valor = excluded.valor, ativa = true, updated_by = excluded.updated_by`,
    [seriesId, context.empresaId, monthStart, context.usuarioId],
  );

  const expenses = [
    ['Aluguel da unidade', 'aluguel', 'Imobiliaria Centro', 6800, 'paga', 5, seriesId, 1],
    ['Folha da equipe clinica', 'pessoal', 'Equipe interna', 12400, 'paga', 6, null, null],
    ['Materiais odontologicos', 'operacional', 'Dental Supply', 3850, 'paga', 9, null, null],
    ['Energia e agua', 'operacional', 'Concessionarias', 1260, 'pendente', 18, null, null],
    ['Marketing e relacionamento', 'marketing', 'Agencia local', 1800, 'paga', 12, null, null],
    ['Manutencao de equipamentos', 'manutencao', 'Tecnica Odonto', 950, 'pendente', 24, null, null],
    ['Scanner intraoral', 'investimento', 'Equipamentos Brasil', 4200, 'pendente', 27, null, null],
    ['Software e conectividade', 'tecnologia', 'Servicos digitais', 690, 'paga', 10, null, null],
  ] as const;

  for (const [index, expense] of expenses.entries()) {
    const [description, category, supplier, value, status, day, expenseSeries, occurrence] = expense;
    const due = `${context.today.slice(0, 8)}${String(Math.min(day, 28)).padStart(2, '0')}`;
    await client.query(
      `insert into odonto.despesas (
         id, empresa_id, serie_id, banco_id, descricao, categoria, fornecedor,
         centro_custo, competencia, vencimento, valor, status, forma_pagamento,
         referencia_pagamento, observacoes, paga_em, paga_por, numero_ocorrencia,
         created_by, updated_by
       ) values ($1,$2,$3,$4,$5,$6,$7,'Clinica',$8,$9,$10,$11::odonto.despesa_status,
         case when $11::text = 'paga' then 'pix'::odonto.forma_pagamento end,
         case when $11::text = 'paga' then 'PAG-DEMO-' || $12 end,
         'Despesa sintetica para apresentacao.',
         case when $11::text = 'paga' then $9::date end,
         case when $11::text = 'paga' then $13::uuid end,$14,$13::uuid,$13::uuid)
       on conflict (id) do update set valor = excluded.valor, status = excluded.status,
         vencimento = excluded.vencimento, forma_pagamento = excluded.forma_pagamento,
         paga_em = excluded.paga_em, paga_por = excluded.paga_por,
         referencia_pagamento = excluded.referencia_pagamento, updated_by = excluded.updated_by`,
      [demoId(8, 30 + index + 1), context.empresaId, expenseSeries, bankId, description,
        category, supplier, monthStart, due, value, status, String(index + 1).padStart(3, '0'),
        context.usuarioId, occurrence],
    );
  }
  return bankId;
}

async function seedReceivables(client: PoolClient, context: SeedContext, bankId: string): Promise<void> {
  const receivableQuotes = [
    { quoteIndex: 0, value: 600, status: 'parcialmente_pago', payment: 250, method: 'pix', installments: null },
    { quoteIndex: 1, value: 3000, status: 'pago', payment: 3000, method: 'cartao_credito', installments: 6 },
    { quoteIndex: 2, value: 220, status: 'pendente', payment: 0, method: 'pix', installments: null },
    { quoteIndex: 5, value: 1400, status: 'pago', payment: 1400, method: 'dinheiro', installments: null },
  ];

  for (const [index, item] of receivableQuotes.entries()) {
    const quote = quotes[item.quoteIndex];
    const patient = patients[quote.patientIndex as number];
    const launchId = demoId(11, index + 1);
    await client.query(
      `insert into odonto.paciente_financeiro_lancamentos (
         id, empresa_id, paciente_id, orcamento_id, descricao, vencimento,
         valor, numero_parcela, total_parcelas, status, created_by, updated_by
       ) values ($1,$2,$3,$4,$5,$6,$7,1,1,$8::odonto.paciente_financeiro_status,$9,$9)
       on conflict (id) do update set vencimento = excluded.vencimento, valor = excluded.valor,
         status = excluded.status, updated_by = excluded.updated_by`,
      [launchId, context.empresaId, patient.id, quote.id,
        `Orcamento DEMO-${String(item.quoteIndex + 1).padStart(3, '0')}`,
        addDays(context.today, index === 2 ? 10 : -index), item.value, item.status, context.usuarioId],
    );
    if (item.payment > 0) {
      await client.query(
        `insert into odonto.paciente_financeiro_pagamentos (
           id, empresa_id, lancamento_id, valor, forma_pagamento, parcelas_cartao,
           pago_em, referencia, banco_id, observacoes, idempotency_key,
           desconto, acrescimo, created_by
         ) values ($1,$2,$3,$4,$5::odonto.paciente_forma_pagamento,$6,
           now() - ($7::text || ' days')::interval,$8,$9,
           'Recebimento sintetico para apresentacao.',$10,0,0,$11)
         on conflict (id) do update set valor = excluded.valor,
           forma_pagamento = excluded.forma_pagamento, parcelas_cartao = excluded.parcelas_cartao,
           banco_id = excluded.banco_id, observacoes = excluded.observacoes`,
        [demoId(11, 20 + index + 1), context.empresaId, launchId, item.payment,
          item.method, item.installments, index + 1, `REC-DEMO-${index + 1}`, bankId,
          demoId(11, 40 + index + 1), context.usuarioId],
      );
    }
  }
}

async function seedEngagement(client: PoolClient, context: SeedContext, events: EventSeed[]): Promise<void> {
  const alerts = [
    { patient: 4, professional: 0, reason: 'Retorno de avaliacao preventiva', days: 7 },
    { patient: 6, professional: 2, reason: 'Acompanhamento ortodontico', days: 14 },
    { patient: 9, professional: 1, reason: 'Reavaliacao de implante', days: 3 },
  ];
  for (const [index, alert] of alerts.entries()) {
    await client.query(
      `insert into odonto.alertas_retorno (
         id, empresa_id, paciente_id, profissional_id, motivo, retornar_em,
         observacoes, status, created_by, updated_by
       ) values ($1,$2,$3,$4,$5,$6,'Alerta sintetico para apresentacao.','pendente',$7,$7)
       on conflict (id) do update set retornar_em = excluded.retornar_em,
         motivo = excluded.motivo, status = 'pendente', updated_by = excluded.updated_by`,
      [demoId(9, index + 1), context.empresaId, patients[alert.patient].id,
        professionals[alert.professional].id, alert.reason, addDays(context.today, alert.days), context.usuarioId],
    );
  }

  const notificationEvents = events.filter((event) => event.patientIndex !== null).slice(0, 8);
  for (const [index, event] of notificationEvents.entries()) {
    const patient = patients[event.patientIndex as number];
    for (const [channelIndex, channel] of ['aplicativo', 'whatsapp'].entries()) {
      const sent = (index + channelIndex) % 3 !== 0;
      await client.query(
        `insert into odonto.notificacoes (
           id, empresa_id, paciente_id, agenda_evento_id, canal, tipo, titulo,
           mensagem, destinatario, status_envio, enviada_em, lida_em, created_by
         ) values ($1,$2,$3,$4,$5::odonto.notificacao_canal,'lembrete_agendamento',
           'Lembrete da sua consulta','Sua consulta esta agendada. Consulte os detalhes no portal.',
           $6,$7::odonto.notificacao_envio_status,
           case when $7 = 'enviada' then now() - interval '1 hour' end,
           case when $5 = 'aplicativo' and $7 = 'enviada' then now() - interval '30 minutes' end,$8)
         on conflict (id) do update set status_envio = excluded.status_envio,
           enviada_em = excluded.enviada_em, lida_em = excluded.lida_em`,
        [demoId(9, 20 + index * 2 + channelIndex), context.empresaId, patient.id, event.id,
          channel, channel === 'whatsapp' ? patient.celular : patient.email,
          sent ? 'enviada' : 'pendente', context.usuarioId],
      );
    }
  }

  await client.query(
    `insert into odonto.comercial_contatos (
       id, empresa_id, paciente_id, catalogo_procedimento_id, mensagem, canais,
       aplicativo_status, whatsapp_status, created_by, created_at
     ) values ($1,$2,$3,$4,'Ola! Podemos ajudar com sua proxima etapa de cuidado odontologico?',
       array['aplicativo','whatsapp']::varchar[],'enviada','enviada',$5,now() - interval '42 days')
     on conflict (id) do update set mensagem = excluded.mensagem,
       aplicativo_status = excluded.aplicativo_status, whatsapp_status = excluded.whatsapp_status,
       created_at = excluded.created_at`,
    [demoId(9, 100), context.empresaId, patients[8].id, procedures[2].id, context.usuarioId],
  );
}

async function printSummary(client: PoolClient, context: SeedContext): Promise<void> {
  const result = await client.query<Record<string, string>>(
    `select
       (select count(*) from odonto.pacientes where empresa_id = $1) as pacientes,
       (select count(*) from odonto.profissionais where empresa_id = $1) as profissionais,
       (select count(*) from odonto.catalogo_procedimentos where empresa_id = $1) as catalogo,
       (select count(*) from odonto.agenda_eventos where empresa_id = $1) as agenda,
       (select count(*) from odonto.procedimentos_realizados where empresa_id = $1) as realizados,
       (select count(*) from odonto.orcamentos where empresa_id = $1) as orcamentos,
       (select count(*) from odonto.despesas where empresa_id = $1 and status <> 'cancelada') as despesas,
       (select count(*) from odonto.paciente_financeiro_lancamentos where empresa_id = $1 and status <> 'cancelado') as contas_receber,
       (select count(*) from odonto.notificacoes where empresa_id = $1) as notificacoes`,
    [context.empresaId],
  );
  console.table(result.rows);
}

async function run(): Promise<void> {
  await transaction(async (client) => {
    const context = await resolveContext(client);
    await seedPatients(client, context);
    await seedProfessionals(client, context);
    await seedProcedureCatalog(client, context);
    await seedQuotes(client, context);
    const events = await seedSchedule(client, context);
    await seedPerformedAndFinance(client, context);
    const bankId = await seedManagement(client, context);
    await seedReceivables(client, context, bankId);
    await seedEngagement(client, context, events);
    await printSummary(client, context);
  });
}

run()
  .catch((error) => {
    console.error('Falha ao carregar dados de demonstracao:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
