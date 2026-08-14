import { query, transaction } from '../../database/pool';
import { sendRetentionWhatsApp } from '../../services/whatsapp.service';
import { AuthContext } from '../../types/public';
import { notFound } from '../../utils/http-error';
import { RedFolderQuery, RetentionContactInput } from './commercial.schemas';

type NotificationStatus = 'pendente' | 'enviada' | 'falhou';

interface CandidateRow {
  paciente_id: string;
  paciente_nome: string;
  celular: string | null;
  celular_pais: string | null;
  email: string | null;
  ultimo_procedimento_em: string;
  ultimo_procedimento: string;
  ultima_interacao_em: string;
  ultimo_contato_em: string | null;
  dias_inativo: string;
  procedimentos_realizados: string;
  receita_total: string;
  consultas_realizadas: string;
}

interface LostQuoteRow {
  orcamento_id: string;
  paciente_id: string | null;
  nome_contato: string;
  whatsapp: string;
  nao_aprovado_em: string;
  ultimo_contato_em: string | null;
  dias_sem_interacao: string;
  quantidade_itens: string;
  subtotal: string;
  desconto_valor: string;
  total: string;
  procedimentos_realizados: string;
  consultas_realizadas: string;
  receita_total: string;
  itens: string;
}

interface ContactPatientRow {
  paciente_id: string;
  paciente_nome: string;
  celular: string | null;
  celular_pais: string | null;
  empresa_nome: string;
  procedimento_nome: string | null;
}

function normalizeWhatsAppNumber(country: string | null, phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) {
    return null;
  }
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  return (country ?? 'BR').toUpperCase() === 'BR' ? `55${digits}` : digits;
}

export async function listRedFolder(auth: AuthContext, input: RedFolderQuery) {
  const inactiveResult = input.tipo === 'orcamentos' ? { rows: [] as CandidateRow[] } : await query<CandidateRow>(
    `
      select
        pac.id as paciente_id,
        pac.nome as paciente_nome,
        pct.celular,
        pct.celular_pais,
        pct.email::text,
        proc.ultimo_procedimento_em,
        proc.ultimo_procedimento,
        greatest(
          proc.ultimo_procedimento_em,
          coalesce(contact.ultimo_contato_em, proc.ultimo_procedimento_em),
          coalesce(schedule.ultimo_agendamento_em, proc.ultimo_procedimento_em)
        )::text as ultima_interacao_em,
        contact.ultimo_contato_em::text,
        (
          current_date - greatest(
            proc.ultimo_procedimento_em,
            coalesce(contact.ultimo_contato_em, proc.ultimo_procedimento_em),
            coalesce(schedule.ultimo_agendamento_em, proc.ultimo_procedimento_em)
          )
        )::text as dias_inativo,
        proc.procedimentos_realizados::text,
        proc.receita_total::text,
        coalesce(history.consultas_realizadas, 0)::text as consultas_realizadas
      from odonto.pacientes pac
      inner join lateral (
        select
          max(pr.data_procedimento) as ultimo_procedimento_em,
          (array_agg(pr.descricao order by pr.data_procedimento desc, pr.created_at desc))[1] as ultimo_procedimento,
          count(*) as procedimentos_realizados,
          coalesce(sum(pr.valor), 0) as receita_total
        from odonto.procedimentos_realizados pr
        where pr.empresa_id = pac.empresa_id and pr.paciente_id = pac.id
      ) proc on proc.ultimo_procedimento_em is not null
      left join odonto.paciente_contatos pct on pct.paciente_id = pac.id
      left join lateral (
        select count(*) as consultas_realizadas
          from odonto.agenda_eventos history_event
         where history_event.empresa_id = pac.empresa_id
           and history_event.paciente_id = pac.id
           and history_event.tipo = 'consulta'
           and history_event.status = 'concluido'
      ) history on true
      left join lateral (
        select max(cc.created_at::date) as ultimo_contato_em
          from odonto.comercial_contatos cc
         where cc.empresa_id = pac.empresa_id and cc.paciente_id = pac.id
      ) contact on true
      left join lateral (
        select max(timezone('America/Sao_Paulo', ae.inicio_em)::date) as ultimo_agendamento_em
          from odonto.agenda_eventos ae
         where ae.empresa_id = pac.empresa_id and ae.paciente_id = pac.id and ae.status <> 'cancelado'
      ) schedule on true
      where pac.empresa_id = $1
        and pac.status = 'ativo'
        and greatest(
          proc.ultimo_procedimento_em,
          coalesce(contact.ultimo_contato_em, proc.ultimo_procedimento_em),
          coalesce(schedule.ultimo_agendamento_em, proc.ultimo_procedimento_em)
        ) <= current_date - $2::integer
        and not exists (
          select 1 from odonto.agenda_eventos future
           where future.empresa_id = pac.empresa_id and future.paciente_id = pac.id
             and future.status in ('agendado', 'confirmado') and future.inicio_em >= now()
        )
      order by greatest(
        proc.ultimo_procedimento_em,
        coalesce(contact.ultimo_contato_em, proc.ultimo_procedimento_em),
        coalesce(schedule.ultimo_agendamento_em, proc.ultimo_procedimento_em)
      ) asc, proc.receita_total desc, pac.nome
      limit 200
    `,
    [auth.empresaId, input.dias],
  );
  const inactiveOpportunities = inactiveResult.rows.map((row) => ({
    oportunidadeId: `paciente:${row.paciente_id}`,
    tipo: 'paciente_inativo' as const,
    perfil: 'paciente' as const,
    pacienteId: row.paciente_id,
    orcamentoId: null,
    nome: row.paciente_nome,
    celular: row.celular,
    email: row.email,
    whatsappDisponivel: Boolean(normalizeWhatsAppNumber(row.celular_pais, row.celular)),
    ultimoEventoEm: row.ultima_interacao_em,
    ultimoEvento: row.ultimo_procedimento,
    ultimoContatoEm: row.ultimo_contato_em,
    diasSemInteracao: Number(row.dias_inativo),
    procedimentosRealizados: Number(row.procedimentos_realizados),
    consultasRealizadas: Number(row.consultas_realizadas),
    receitaTotal: Number(row.receita_total),
    orcamentoTotal: null,
    descontoValor: null,
    quantidadeItens: null,
    itensResumo: null,
  }));

  const lostQuoteResult = input.tipo === 'inativos' ? { rows: [] as LostQuoteRow[] } : await query<LostQuoteRow>(
    `
      select o.id as orcamento_id, o.paciente_id, o.nome_contato, o.whatsapp,
             coalesce(o.nao_aprovado_em, o.updated_at)::text as nao_aprovado_em,
             contact.ultimo_contato_em::text,
             (current_date - greatest(
               coalesce(o.nao_aprovado_em, o.updated_at)::date,
               coalesce(contact.ultimo_contato_em, coalesce(o.nao_aprovado_em, o.updated_at)::date)
             ))::text as dias_sem_interacao,
             count(distinct oi.id)::text as quantidade_itens,
             coalesce(sum(oi.valor_total), 0)::text as subtotal,
             o.desconto_valor::text,
             greatest(coalesce(sum(oi.valor_total), 0) - o.desconto_valor, 0)::text as total,
             coalesce(history.procedimentos_realizados, 0)::text as procedimentos_realizados,
             coalesce(history.consultas_realizadas, 0)::text as consultas_realizadas,
             coalesce(history.receita_total, 0)::text as receita_total,
             coalesce(string_agg(oi.descricao, ', ' order by oi.descricao), 'Orcamento sem itens') as itens
        from odonto.orcamentos o
        left join odonto.orcamento_itens oi on oi.orcamento_id = o.id
        left join lateral (
          select max(cc.created_at::date) as ultimo_contato_em
            from odonto.comercial_contatos cc
           where cc.empresa_id = o.empresa_id and cc.orcamento_id = o.id
        ) contact on true
        left join lateral (
          select
            (select count(*) from odonto.procedimentos_realizados pr
              where pr.empresa_id = o.empresa_id and pr.paciente_id = o.paciente_id) as procedimentos_realizados,
            (select coalesce(sum(pr.valor), 0) from odonto.procedimentos_realizados pr
              where pr.empresa_id = o.empresa_id and pr.paciente_id = o.paciente_id) as receita_total,
            (select count(*) from odonto.agenda_eventos ae
              where ae.empresa_id = o.empresa_id and ae.paciente_id = o.paciente_id
                and ae.tipo = 'consulta' and ae.status = 'concluido') as consultas_realizadas
        ) history on true
       where o.empresa_id = $1
         and o.status = 'nao_aprovado'
         and (
           contact.ultimo_contato_em is null
           or contact.ultimo_contato_em <= current_date - $2::integer
         )
       group by o.id, contact.ultimo_contato_em, history.procedimentos_realizados,
                history.consultas_realizadas, history.receita_total
       order by coalesce(o.nao_aprovado_em, o.updated_at) desc
       limit 200
    `,
    [auth.empresaId, input.dias],
  );
  const quoteOpportunities = lostQuoteResult.rows.map((row) => ({
    oportunidadeId: `orcamento:${row.orcamento_id}`,
    tipo: 'orcamento_nao_aprovado' as const,
    perfil: row.paciente_id ? 'paciente' as const : 'novo' as const,
    pacienteId: row.paciente_id,
    orcamentoId: row.orcamento_id,
    nome: row.nome_contato,
    celular: row.whatsapp,
    email: null,
    whatsappDisponivel: Boolean(normalizeWhatsAppNumber('BR', row.whatsapp)),
    ultimoEventoEm: row.nao_aprovado_em,
    ultimoEvento: 'Orcamento nao aprovado',
    ultimoContatoEm: row.ultimo_contato_em,
    diasSemInteracao: Number(row.dias_sem_interacao),
    procedimentosRealizados: Number(row.procedimentos_realizados),
    consultasRealizadas: Number(row.consultas_realizadas),
    receitaTotal: Number(row.receita_total),
    orcamentoTotal: Number(row.total),
    descontoValor: Number(row.desconto_valor),
    quantidadeItens: Number(row.quantidade_itens),
    itensResumo: row.itens,
  }));
  const oportunidades = [...quoteOpportunities, ...inactiveOpportunities].sort((a, b) => {
    if (a.tipo !== b.tipo) {
      return a.tipo === 'orcamento_nao_aprovado' ? -1 : 1;
    }
    return b.diasSemInteracao - a.diasSemInteracao;
  });
  return {
    oportunidades,
    resumo: {
      quantidade: oportunidades.length,
      pacientesInativos: inactiveOpportunities.length,
      orcamentosNaoAprovados: quoteOpportunities.length,
      novosContatos: quoteOpportunities.filter((item) => item.perfil === 'novo').length,
      comWhatsapp: oportunidades.filter((item) => item.whatsappDisponivel).length,
      valorEmAberto: quoteOpportunities.reduce((total, item) => total + (item.orcamentoTotal ?? 0), 0),
      receitaHistorica: oportunidades.reduce((total, item) => total + item.receitaTotal, 0),
    },
  };
}

export async function sendRetentionContact(
  auth: AuthContext,
  patientId: string,
  input: RetentionContactInput,
) {
  const patientResult = await query<ContactPatientRow>(
    `
      select pac.id as paciente_id, pac.nome as paciente_nome, pct.celular, pct.celular_pais,
             e.nome_fantasia as empresa_nome, cp.nome as procedimento_nome
        from odonto.pacientes pac
        inner join odonto.empresas e on e.id = pac.empresa_id
        left join odonto.paciente_contatos pct on pct.paciente_id = pac.id
        left join odonto.catalogo_procedimentos cp on cp.id = $3::uuid and cp.empresa_id = pac.empresa_id and cp.ativo = true
       where pac.id = $1 and pac.empresa_id = $2 and pac.status = 'ativo'
       limit 1
    `,
    [patientId, auth.empresaId, input.procedimentoId ?? null],
  );
  const patient = patientResult.rows[0];
  if (!patient) {
    throw notFound('Paciente nao encontrado.');
  }
  if (input.procedimentoId && !patient.procedimento_nome) {
    throw notFound('Procedimento ofertado nao encontrado.');
  }

  const firstName = patient.paciente_nome.split(' ')[0];
  const offer = patient.procedimento_nome ?? 'uma nova avaliacao para cuidar do seu sorriso';
  const message = input.mensagem ?? (patient.procedimento_nome
    ? `Olá, ${firstName}. Sentimos sua falta na ${patient.empresa_nome}. Gostaríamos de convidar você para ${patient.procedimento_nome}. Podemos ajudar com um horário?`
    : `Olá, ${firstName}. Sentimos sua falta na ${patient.empresa_nome}. Existe algo em que nossa clínica possa ajudar ou algum tratamento que você gostaria de realizar?`);
  const channels = [...new Set(input.canais)];
  let appStatus: NotificationStatus | null = null;
  let whatsappStatus: NotificationStatus | null = null;
  let whatsappProviderId: string | null = null;
  let whatsappError: string | null = null;

  if (channels.includes('aplicativo')) {
    appStatus = 'enviada';
  }
  if (channels.includes('whatsapp')) {
    const phone = normalizeWhatsAppNumber(patient.celular_pais, patient.celular);
    if (!phone) {
      whatsappStatus = 'falhou';
      whatsappError = 'Paciente sem celular cadastrado.';
    } else {
      const result = await sendRetentionWhatsApp({
        to: phone,
        patientName: firstName,
        clinicName: patient.empresa_nome,
        offer,
      });
      whatsappStatus = result.status;
      whatsappProviderId = result.providerId ?? null;
      whatsappError = result.error ?? null;
    }
  }

  await transaction(async (client) => {
    if (appStatus) {
      await client.query(
        `
          insert into odonto.notificacoes (
            empresa_id, paciente_id, canal, tipo, titulo, mensagem, destinatario,
            status_envio, enviada_em, created_by
          ) values ($1, $2, 'aplicativo', 'retencao_comercial', $3, $4, 'portal do paciente', 'enviada', now(), $5)
        `,
        [auth.empresaId, patient.paciente_id, patient.procedimento_nome ? 'Uma oportunidade para o seu sorriso' : 'Podemos ajudar?', message, auth.usuarioId],
      );
    }
    if (whatsappStatus) {
      const phone = normalizeWhatsAppNumber(patient.celular_pais, patient.celular);
      await client.query(
        `
          insert into odonto.notificacoes (
            empresa_id, paciente_id, canal, tipo, titulo, mensagem, destinatario,
            status_envio, provedor_id, erro_envio, enviada_em, created_by
          ) values ($1, $2, 'whatsapp', 'retencao_comercial', 'Contato da clinica', $3, $4,
            $5, $6, $7, $8, $9)
        `,
        [
          auth.empresaId,
          patient.paciente_id,
          message,
          phone,
          whatsappStatus,
          whatsappProviderId,
          whatsappError,
          whatsappStatus === 'enviada' ? new Date() : null,
          auth.usuarioId,
        ],
      );
    }
    await client.query(
      `
        insert into odonto.comercial_contatos (
          empresa_id, paciente_id, catalogo_procedimento_id, mensagem, canais,
          aplicativo_status, whatsapp_status, created_by
        ) values ($1, $2, $3, $4, $5::varchar[], $6, $7, $8)
      `,
      [
        auth.empresaId,
        patient.paciente_id,
        input.procedimentoId ?? null,
        message,
        channels,
        appStatus,
        whatsappStatus,
        auth.usuarioId,
      ],
    );
  });

  return {
    mensagem: message,
    resultados: channels.map((channel) => ({
      canal: channel,
      status: channel === 'aplicativo' ? appStatus : whatsappStatus,
      erro: channel === 'whatsapp' ? whatsappError : null,
    })),
  };
}
