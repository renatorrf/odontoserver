"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProfessionalSlot = validateProfessionalSlot;
exports.listProfessionalAvailability = listProfessionalAvailability;
const pool_1 = require("../../database/pool");
const http_error_1 = require("../../utils/http-error");
const SAO_PAULO_OFFSET = '-03:00';
function addDays(date, days) {
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day + days));
    return value.toISOString().slice(0, 10);
}
function weekday(date) {
    return new Date(`${date}T12:00:00${SAO_PAULO_OFFSET}`).getUTCDay();
}
function atTime(date, time) {
    return new Date(`${date}T${time.slice(0, 5)}:00${SAO_PAULO_OFFSET}`);
}
function localParts(value) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(value);
    const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        minutes: Number(get('hour')) * 60 + Number(get('minute')),
    };
}
function timeMinutes(time) {
    const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
    return hours * 60 + minutes;
}
function formatMinutes(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function overlaps(start, end, event) {
    return start.getTime() < new Date(event.fim_em).getTime() && end.getTime() > new Date(event.inicio_em).getTime();
}
async function validateProfessionalSlot(client, auth, input) {
    const professional = await client.query(`select 1 from odonto.profissionais
      where id = $1 and empresa_id = $2 and status = 'ativo' and agenda_habilitada = true limit 1`, [input.profissionalId, auth.empresaId]);
    if (!professional.rowCount) {
        throw (0, http_error_1.notFound)('Profissional ativo com agenda habilitada nao encontrado.');
    }
    const start = localParts(input.inicioEm);
    const end = localParts(input.fimEm);
    const ranges = await client.query(`select dia_semana, hora_inicio::text, hora_fim::text, intervalo_minutos
       from odonto.profissional_disponibilidades
      where empresa_id = $1 and profissional_id = $2 and dia_semana = $3 and ativo = true
      order by hora_inicio`, [auth.empresaId, input.profissionalId, weekday(start.date)]);
    if (!ranges.rowCount) {
        throw (0, http_error_1.conflict)('O profissional nao possui disponibilidade cadastrada nesta data.');
    }
    if (!input.diaInteiro) {
        const fitsRange = start.date === end.date && ranges.rows.some((range) => (start.minutes >= timeMinutes(range.hora_inicio) && end.minutes <= timeMinutes(range.hora_fim)));
        if (!fitsRange) {
            throw (0, http_error_1.conflict)('O horario esta fora da disponibilidade cadastrada do profissional.');
        }
    }
    const collision = await client.query(`select 1 from odonto.agenda_eventos
      where empresa_id = $1 and profissional_id = $2 and status <> 'cancelado'
        and inicio_em < $4 and fim_em > $3
        and ($5::uuid is null or id <> $5::uuid)
      limit 1`, [auth.empresaId, input.profissionalId, input.inicioEm.toISOString(), input.fimEm.toISOString(), input.ignorarEventoId ?? null]);
    if (collision.rowCount) {
        throw (0, http_error_1.conflict)(input.diaInteiro
            ? 'O profissional ja possui compromisso nesta data; selecione outro dia.'
            : 'O profissional ja possui um agendamento neste horario.');
    }
}
async function listProfessionalAvailability(auth, input) {
    const professionalResult = await (0, pool_1.query)(`select nome from odonto.profissionais
      where id = $1 and empresa_id = $2 and status = 'ativo' and agenda_habilitada = true limit 1`, [input.profissionalId, auth.empresaId]);
    if (!professionalResult.rowCount) {
        throw (0, http_error_1.notFound)('Profissional ativo com agenda habilitada nao encontrado.');
    }
    const endDate = addDays(input.inicio, input.dias);
    const [rangesResult, eventsResult] = await Promise.all([
        (0, pool_1.query)(`select dia_semana, hora_inicio::text, hora_fim::text, intervalo_minutos
         from odonto.profissional_disponibilidades
        where empresa_id = $1 and profissional_id = $2 and ativo = true
        order by dia_semana, hora_inicio`, [auth.empresaId, input.profissionalId]),
        (0, pool_1.query)(`select id, inicio_em::text, fim_em::text from odonto.agenda_eventos
        where empresa_id = $1 and profissional_id = $2 and status <> 'cancelado'
          and inicio_em < $4::timestamptz and fim_em > $3::timestamptz
          and ($5::uuid is null or id <> $5::uuid)`, [
            auth.empresaId,
            input.profissionalId,
            atTime(input.inicio, '00:00').toISOString(),
            atTime(endDate, '00:00').toISOString(),
            input.ignorarEventoId ?? null,
        ]),
    ]);
    const now = Date.now();
    const days = Array.from({ length: input.dias }, (_, index) => {
        const date = addDays(input.inicio, index);
        const ranges = rangesResult.rows.filter((range) => range.dia_semana === weekday(date));
        const dayStart = atTime(date, '00:00');
        const dayEnd = atTime(addDays(date, 1), '00:00');
        const dayEvents = eventsResult.rows.filter((event) => overlaps(dayStart, dayEnd, event));
        const slots = [];
        if (input.diaInteiro) {
            if (ranges.length && !dayEvents.length && dayStart.getTime() > now) {
                slots.push({
                    inicioEm: dayStart.toISOString(),
                    fimEm: dayEnd.toISOString(),
                    horaInicio: 'Dia inteiro',
                    horaFim: '',
                });
            }
        }
        else {
            for (const range of ranges) {
                const rangeStart = atTime(date, range.hora_inicio);
                const rangeEnd = atTime(date, range.hora_fim);
                for (let cursor = rangeStart.getTime(); cursor + input.duracaoMinutos * 60_000 <= rangeEnd.getTime(); cursor += range.intervalo_minutos * 60_000) {
                    const start = new Date(cursor);
                    const end = new Date(cursor + input.duracaoMinutos * 60_000);
                    if (start.getTime() <= now || dayEvents.some((event) => overlaps(start, end, event))) {
                        continue;
                    }
                    slots.push({
                        inicioEm: start.toISOString(),
                        fimEm: end.toISOString(),
                        horaInicio: formatMinutes(localParts(start).minutes),
                        horaFim: formatMinutes(localParts(end).minutes),
                    });
                }
            }
        }
        return {
            data: date,
            diaSemana: weekday(date),
            periodoTrabalho: ranges.map((range) => ({ horaInicio: range.hora_inicio.slice(0, 5), horaFim: range.hora_fim.slice(0, 5) })),
            disponivel: slots.length > 0,
            slots,
        };
    });
    return {
        profissional: { id: input.profissionalId, nome: professionalResult.rows[0].nome },
        duracaoMinutos: input.duracaoMinutos,
        diaInteiro: input.diaInteiro,
        dias: days,
    };
}
