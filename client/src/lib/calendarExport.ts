import type { CrewRoster, RosterDay, FlightLeg } from './pdfParser';
import type { GymRecommendation } from './complianceEngine';
import type { RoutineSuggestion } from './routinePlanner';
import { findRosterCodes, getRosterCodeDefinition, rosterCodeTitle } from './rosterCodes';

export type CalendarExportMode = 'all' | 'flights' | 'duties' | 'rest' | 'gym' | 'routine';
export type CalendarTitleFormat = 'route-flight' | 'flight-route';

export interface CalendarExportOptions {
  mode?: CalendarExportMode;
  titleFormat?: CalendarTitleFormat;
  includeReminders?: boolean;
  flightReminderMinutes?: number[];
  dutyReminderMinutes?: number[];
  gymReminderMinutes?: number[];
  routineReminderMinutes?: number[];
  routineSuggestions?: RoutineSuggestion[];
}

const DEFAULT_OPTIONS: Required<CalendarExportOptions> = {
  mode: 'all',
  titleFormat: 'route-flight',
  includeReminders: true,
  flightReminderMinutes: [120, 30],
  dutyReminderMinutes: [120, 30],
  gymReminderMinutes: [60],
  routineReminderMinutes: [60],
  routineSuggestions: [],
};

const AIRPORT_META: Record<string, { city: string; airport?: string; timezone?: string }> = {
  BSB: { city: 'Brasília', airport: 'Brasília', timezone: 'America/Sao_Paulo' },
  GYN: { city: 'Goiânia', airport: 'Goiânia', timezone: 'America/Sao_Paulo' },
  GRU: { city: 'Guarulhos', airport: 'Guarulhos', timezone: 'America/Sao_Paulo' },
  CGH: { city: 'São Paulo', airport: 'Congonhas', timezone: 'America/Sao_Paulo' },
  VCP: { city: 'Campinas', airport: 'Viracopos', timezone: 'America/Sao_Paulo' },
  NAT: { city: 'Natal', airport: 'Natal', timezone: 'America/Fortaleza' },
  MCZ: { city: 'Maceió', airport: 'Maceió', timezone: 'America/Maceio' },
  FOR: { city: 'Fortaleza', airport: 'Fortaleza', timezone: 'America/Fortaleza' },
  CNF: { city: 'Belo Horizonte', airport: 'Confins', timezone: 'America/Sao_Paulo' },
  PMW: { city: 'Palmas', airport: 'Palmas', timezone: 'America/Araguaina' },
  FLN: { city: 'Florianópolis', airport: 'Florianópolis', timezone: 'America/Sao_Paulo' },
  MAB: { city: 'Marabá', airport: 'Marabá', timezone: 'America/Belem' },
  CPV: { city: 'Campina Grande', airport: 'Campina Grande', timezone: 'America/Fortaleza' },
  JPA: { city: 'João Pessoa', airport: 'João Pessoa', timezone: 'America/Fortaleza' },
  EZE: { city: 'Buenos Aires / Ezeiza', airport: 'Ezeiza', timezone: 'America/Argentina/Buenos_Aires' },
  VIX: { city: 'Vitória', airport: 'Vitória', timezone: 'America/Sao_Paulo' },
  SSA: { city: 'Salvador', airport: 'Salvador', timezone: 'America/Bahia' },
  GIG: { city: 'Rio de Janeiro', airport: 'Galeão', timezone: 'America/Sao_Paulo' },
  SDU: { city: 'Rio de Janeiro', airport: 'Santos Dumont', timezone: 'America/Sao_Paulo' },
  REC: { city: 'Recife', airport: 'Recife', timezone: 'America/Recife' },
  AJU: { city: 'Aracaju', airport: 'Aracaju', timezone: 'America/Maceio' },
  BEL: { city: 'Belém', airport: 'Belém', timezone: 'America/Belem' },
  SLZ: { city: 'São Luís', airport: 'São Luís', timezone: 'America/Fortaleza' },
  CGB: { city: 'Cuiabá', airport: 'Cuiabá', timezone: 'America/Cuiaba' },
  POA: { city: 'Porto Alegre', airport: 'Porto Alegre', timezone: 'America/Sao_Paulo' },
  CUR: { city: 'Curitiba', airport: 'Curitiba', timezone: 'America/Sao_Paulo' },
};

export function generateICalendar(roster: CrewRoster, gymRecommendations?: GymRecommendation[], options?: CalendarExportOptions): string {
  const cfg = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const monthStr = String(roster.month).padStart(2, '0');
  const uidBase = `crewcheck-${roster.year}-${monthStr}-${cfg.mode}-${Date.now()}@crewcheck.local`;
  const crewName = titleCase(roster.crewName);
  const calendarLabel = calendarModeLabel(cfg.mode);

  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CrewCheck Premium//Roster Calendar//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:America/Sao_Paulo',
    `X-WR-CALNAME:${escapeIcal(`CrewCheck · ${calendarLabel} · ${crewName} · ${monthName(roster.month)}/${roster.year}`)}`,
    `X-WR-CALDESC:${escapeIcal('Escala premium exportada pelo CrewCheck com rotas, horários locais, cidades, atividades e lembretes.')}`,
  ].join('\n') + '\n';

  roster.days.forEach((day, dayIndex) => {
    if (shouldExportFlights(cfg.mode) && day.legs && day.legs.length > 0) {
      day.legs.forEach((leg, legIndex) => {
        const uid = `${uidBase}-flight-${dayIndex}-${legIndex}`;
        const endNextDay = Boolean(leg.isNextDay) || arrivesNextDay(leg.departureTime, leg.arrivalTime);

        ical += buildEvent({
          uid,
          now,
          start: formatDateTimeForIcal(day.date, leg.departureTime),
          end: formatDateTimeForIcal(day.date, leg.arrivalTime, endNextDay ? 1 : 0),
          summary: buildFlightSummary(leg, cfg.titleFormat),
          description: buildFlightDescription(roster, day, leg, endNextDay),
          location: buildFlightLocation(leg),
          categories: 'CrewCheck,Flight',
          transparency: 'OPAQUE',
          alarms: cfg.includeReminders ? cfg.flightReminderMinutes : [],
          color: calendarColorForDay(day),
        });
      });
    }

    if (shouldExportDuties(cfg.mode) && day.dutyReport && day.dutyDebrief && !isRestDay(day) && (!day.legs || day.legs.length === 0)) {
      const uid = `${uidBase}-duty-${dayIndex}`;
      const endNextDay = Boolean(day.isNextDay) || arrivesNextDay(day.dutyReport, day.dutyDebrief);
      ical += buildEvent({
        uid,
        now,
        start: formatDateTimeForIcal(day.date, day.dutyReport),
        end: formatDateTimeForIcal(day.date, day.dutyDebrief, endNextDay ? 1 : 0),
        summary: getDutySummary(day),
        description: buildDutyDescription(roster, day, endNextDay),
        location: buildDutyLocation(day),
        categories: 'CrewCheck,Duty',
        transparency: 'OPAQUE',
        alarms: cfg.includeReminders ? cfg.dutyReminderMinutes : [],
        color: calendarColorForDay(day),
      });
    }

    if (shouldExportRest(cfg.mode) && isRestDay(day)) {
      const uid = `${uidBase}-rest-${dayIndex}`;
      ical += buildAllDayEvent({
        uid,
        now,
        date: day.date,
        summary: getRestSummary(day),
        description: buildRestDescription(roster, day),
        categories: day.type === 'LAYOVER' ? 'CrewCheck,Layover' : 'CrewCheck,Rest',
        color: calendarColorForDay(day),
      });
    }
  });

  if (shouldExportGym(cfg.mode) && gymRecommendations?.length) {
    gymRecommendations.forEach((gym, index) => {
      ical += buildEvent({
        uid: `${uidBase}-gym-${index}`,
        now,
        start: formatDateTimeForIcal(gym.date, gym.startTime),
        end: formatDateTimeForIcal(gym.date, gym.endTime),
        summary: gym.priority === 'high' ? 'Academia · Treino recomendado' : gym.priority === 'medium' ? 'Academia · Treino moderado' : 'Academia · Recuperação ativa',
        description: [
          'Plano de condicionamento sugerido pelo CrewCheck.',
          '',
          `Prioridade: ${gym.priority === 'high' ? 'Alta' : gym.priority === 'medium' ? 'Média' : 'Leve'}`,
          `Janela sugerida: ${gym.suggestedTime}`,
          `Recomendação: ${gym.reason}`,
          '',
          'Sugestão: ajuste intensidade conforme sono, hidratação, alimentação e fadiga percebida.',
        ].join('\n'),
        location: 'Academia',
        categories: 'CrewCheck,Gym',
        transparency: 'TRANSPARENT',
        alarms: cfg.includeReminders ? cfg.gymReminderMinutes : [],
      });
    });
  }

  if (shouldExportRoutine(cfg.mode) && cfg.routineSuggestions?.length) {
    cfg.routineSuggestions.forEach((item, index) => {
      ical += buildEvent({
        uid: `${uidBase}-routine-${index}`,
        now,
        start: formatDateTimeForIcal(item.date, item.startTime),
        end: formatDateTimeForIcal(item.date, item.endTime),
        summary: `Rotina · ${item.activityName}`,
        description: [
          'Rotina inteligente sugerida pelo CrewCheck.',
          '',
          `Tipo: ${item.activityType}`,
          `Intensidade: ${item.intensity}`,
          `Adequação: ${item.suitability} (${item.score}/100)`,
          `Motivo: ${item.reason}`,
          `Cuidado: ${item.caution}`,
        ].join('\n'),
        location: item.activityName,
        categories: 'CrewCheck,Routine',
        transparency: 'TRANSPARENT',
        alarms: cfg.includeReminders ? cfg.routineReminderMinutes : [],
        color: ['musculacao','corrida','caminhada','crossfit'].includes(item.activityType) ? '#22c55e' : '#0f8d96',
      });
    });
  }

  return `${ical}END:VCALENDAR`;
}

function calendarColorForDay(day: RosterDay): string {
  if (String(day.pairingCode || day.type || '').toUpperCase() === 'PS' || (day.legs?.length && day.legs.some((leg) => String(leg.workType || '').toUpperCase() === 'PS'))) return '#64748b';
  if (day.legs?.length) return '#0b2b4c';
  const code = getRosterCodeDefinition(day.pairingCode)?.code || findRosterCodes(`${day.pairingCode || ''} ${day.type || ''} ${day.rawText || ''}`)[0] || day.type;
  const category = getRosterCodeDefinition(code)?.category;
  if (category === 'DAY_OFF') return '#15963a';
  if (category === 'SIMULATOR') return '#7c3aed';
  if (category === 'TRANSPORT') return '#9a7a42';
  if (category === 'RESERVE' || category === 'STANDBY' || category === 'DAY_MARKER') return '#f97316';
  if (category === 'MEETING' || category === 'MEDICAL') return '#0f8d96';
  if (category === 'GROUND_DUTY') return '#e11d48';
  return '#0f8d96';
}

function buildEvent(args: {
  uid: string;
  now: string;
  start: string;
  end: string;
  summary: string;
  description: string;
  location?: string;
  categories: string;
  transparency: 'OPAQUE' | 'TRANSPARENT';
  alarms?: number[];
  color?: string;
}): string {
  const alarmBlock = (args.alarms || []).map((minutes) => buildAlarm(minutes)).join('');
  const colorLine = args.color ? `COLOR:${args.color}\nX-APPLE-CALENDAR-COLOR:${args.color}\n` : '';
  return `BEGIN:VEVENT\nUID:${args.uid}\nDTSTAMP:${args.now}\n${colorLine}DTSTART;TZID=America/Sao_Paulo:${args.start}\nDTEND;TZID=America/Sao_Paulo:${args.end}\nSUMMARY:${escapeIcal(args.summary)}\nDESCRIPTION:${escapeIcal(args.description)}\nLOCATION:${escapeIcal(args.location || '')}\nCATEGORIES:${escapeIcal(args.categories)}\nSTATUS:CONFIRMED\nTRANSP:${args.transparency}\nX-MICROSOFT-CDO-BUSYSTATUS:${args.transparency === 'OPAQUE' ? 'BUSY' : 'FREE'}\n${alarmBlock}END:VEVENT\n`;
}

function buildAlarm(minutesBefore: number): string {
  return `BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:${escapeIcal('Lembrete CrewCheck')}\nTRIGGER:-PT${Math.max(1, Math.round(minutesBefore))}M\nEND:VALARM\n`;
}

function buildAllDayEvent(args: {
  uid: string;
  now: string;
  date: string;
  summary: string;
  description: string;
  categories: string;
  color?: string;
}): string {
  const start = formatDateForIcal(args.date);
  const end = formatDateForIcal(args.date, 1);
  const colorLine = args.color ? `COLOR:${args.color}\nX-APPLE-CALENDAR-COLOR:${args.color}\n` : '';
  return `BEGIN:VEVENT\nUID:${args.uid}\nDTSTAMP:${args.now}\n${colorLine}DTSTART;VALUE=DATE:${start}\nDTEND;VALUE=DATE:${end}\nSUMMARY:${escapeIcal(args.summary)}\nDESCRIPTION:${escapeIcal(args.description)}\nCATEGORIES:${escapeIcal(args.categories)}\nSTATUS:CONFIRMED\nTRANSP:TRANSPARENT\nX-MICROSOFT-CDO-BUSYSTATUS:FREE\nEND:VEVENT\n`;
}

function buildFlightSummary(leg: FlightLeg, format: CalendarTitleFormat): string {
  const route = `${leg.origin}-${leg.destination}`;
  return format === 'flight-route' ? `${leg.flightNumber} · ${route}` : `${route} · ${leg.flightNumber}`;
}

function buildFlightDescription(roster: CrewRoster, day: RosterDay, leg: FlightLeg, endNextDay: boolean): string {
  const origin = airportLabel(leg.origin);
  const destination = airportLabel(leg.destination);
  const workType = translateWorkType(leg.workType || 'OP');
  const localDate = displayDate(day.date);
  const startUtc = toUtcLabel(day.date, leg.departureTime);
  const endUtc = toUtcLabel(day.date, leg.arrivalTime, endNextDay ? 1 : 0);

  return [
    `${leg.flightNumber}: ${leg.origin}-${leg.destination}`,
    `${cityOnly(leg.origin)} → ${cityOnly(leg.destination)}`,
    '',
    `Data: ${localDate}`,
    `Origem: ${origin}`,
    `Partida local: ${leg.departureTime} America/Sao_Paulo`,
    `Partida UTC: ${startUtc}`,
    `Destino: ${destination}`,
    `Chegada local: ${leg.arrivalTime}${endNextDay ? ' (+1)' : ''} America/Sao_Paulo`,
    `Chegada UTC: ${endUtc}`,
    `Tipo de operação: ${workType}`,
    leg.aircraftType ? `Aeronave: ${leg.aircraftType}` : '',
    day.dutyReport ? `Duty report do pairing: ${day.dutyReport}` : '',
    day.dutyDebrief ? `Duty debrief do pairing: ${day.dutyDebrief}${day.isNextDay ? ' (+1)' : ''}` : '',
    '',
    `Crew: (${roster.crewId || 'sem BP'}) ${titleCase(roster.crewName)}`,
    `Base: ${roster.base} · ${cityOnly(roster.base)}`,
    `Função: ${roster.rank || 'Tripulante'}`,
    'Fonte: CrewCheck Premium',
  ].filter(Boolean).join('\n');
}

function buildFlightLocation(leg: FlightLeg): string {
  return `${airportLabel(leg.origin)} → ${airportLabel(leg.destination)}`;
}

function buildDutyDescription(roster: CrewRoster, day: RosterDay, endNextDay: boolean): string {
  const activity = translateDutyType(day);
  return [
    activity,
    '',
    `Data: ${displayDate(day.date)}`,
    `Horário: ${day.dutyReport} → ${day.dutyDebrief}${endNextDay ? ' (+1)' : ''}`,
    `Local: ${buildDutyLocation(day)}`,
    day.dutyHours != null ? `Jornada estimada: ${formatDecimalHours(day.dutyHours)}` : '',
    day.pairingCode ? `Código/programação: ${day.pairingCode}` : '',
    '',
    `Crew: (${roster.crewId || 'sem BP'}) ${titleCase(roster.crewName)}`,
    `Base: ${roster.base} · ${cityOnly(roster.base)}`,
    `Função: ${roster.rank || 'Tripulante'}`,
    'Fonte: CrewCheck Premium',
  ].filter(Boolean).join('\n');
}

function buildDutyLocation(day: RosterDay): string {
  if (day.type === 'ASB') return `${day.base} · ${cityOnly(day.base)} · Airport Stand By`;
  if (day.type === 'HSB' || day.type === 'HSBE') return `${day.base} · ${cityOnly(day.base)} · Home Stand By`;
  if (/^C\d{2,3}F$/i.test(day.pairingCode || '') || /\bC\d{2,3}F\b/i.test(day.rawText || '')) return `${day.base} · ${cityOnly(day.base)} · Centro de treinamento / check`;
  const rosterCode = getRosterCode(day);
  if (rosterCode === 'NS' || rosterCode === 'NSJ' || (rosterCode.endsWith('J') && rosterCode !== 'IJ')) return `${day.base} · ${cityOnly(day.base)} · Justificativa / não comparecimento`;
  if (rosterCode === 'IJ') return `${day.base} · ${cityOnly(day.base)} · Interrupção de jornada`;
  if (rosterCode === 'DM') return `${day.base} · ${cityOnly(day.base)} · Dispensa médica`;
  return `${day.base} · ${cityOnly(day.base)}`;
}

function getRestSummary(day: RosterDay): string {
  if (day.type === 'LAYOVER') return `Inativo / pernoite${day.hotel ? ` · ${day.hotel}` : ''}`;
  if (day.type === 'OFF') return 'OFF · Extensão do descanso';
  if (day.type === 'DOF') return 'DOF · Folga';
  if (day.type === 'DR') return 'DR · Descanso regulamentar';
  return 'DO · Folga';
}

function buildRestDescription(roster: CrewRoster, day: RosterDay): string {
  return [
    day.type === 'LAYOVER'
      ? 'Dia tratado como inativo / pernoite entre programações, sem apontamento automático de irregularidade.'
      : explainRestType(day.type),
    '',
    `Data: ${displayDate(day.date)}`,
    day.type === 'LAYOVER' ? `Local: ${day.hotel || cityOnly(day.base)}` : `Base: ${roster.base} · ${cityOnly(roster.base)}`,
    `Crew: (${roster.crewId || 'sem BP'}) ${titleCase(roster.crewName)}`,
    'Fonte: CrewCheck Premium',
  ].filter(Boolean).join('\n');
}

function getDutySummary(day: RosterDay): string {
  if (day.type === 'HSB') return 'HSB · Home Stand By';
  if (day.type === 'HSBE') return 'HSBE · Home Stand By Extra';
  if (day.type === 'ASB') return 'ASB · Airport Stand By';
  if (/^C\d{2,3}F$/i.test(day.pairingCode || '') || /\bC\d{2,3}F\b/i.test(day.rawText || '')) return `${day.pairingCode || 'C32F'} · Check de competência A32F`;
  if (day.pairingCode === 'CBF') return 'CBF · EAD - Combate ao Fogo';
  if (day.pairingCode === 'EMER') return 'EMER · EAD - Emergências Gerais';
  if (day.pairingCode === 'MT') return 'MT · Meeting / reunião com a chefia';
  const rosterCode = getRosterCode(day);
  if (rosterCode === 'NS') return 'NS · Não comparecimento';
  if (rosterCode === 'NSJ') return 'NSJ · Não comparecimento justificado';
  if (rosterCode.endsWith('J') && rosterCode !== 'IJ') return `${rosterCode} · Justificado`;
  if (rosterCode === 'IJ') return 'IJ · Interrupção de jornada';
  if (rosterCode === 'DM') return 'DM · Dispensa médica';
  if (day.type === 'CRM') return 'CRM · Corporate Resource Management';
  if (day.type === 'OTHER' && day.pairingCode) return `${day.pairingCode} · Atividade programada`;
  return `${day.type} · Atividade`;
}

function isRestDay(day: RosterDay): boolean {
  return ['OFF', 'DO', 'DOF', 'DR', 'LAYOVER'].includes(day.type) || getRosterCodeDefinition(day.pairingCode || '')?.category === 'DAY_OFF';
}

function shouldExportFlights(mode: CalendarExportMode): boolean {
  return mode === 'all' || mode === 'flights';
}

function shouldExportDuties(mode: CalendarExportMode): boolean {
  return mode === 'all' || mode === 'duties';
}

function shouldExportRest(mode: CalendarExportMode): boolean {
  return mode === 'all' || mode === 'rest';
}

function shouldExportGym(mode: CalendarExportMode): boolean {
  return mode === 'all' || mode === 'gym';
}

function shouldExportRoutine(mode: CalendarExportMode): boolean {
  return mode === 'all' || mode === 'routine';
}

function calendarModeLabel(mode: CalendarExportMode): string {
  if (mode === 'flights') return 'Voos';
  if (mode === 'duties') return 'Atividades';
  if (mode === 'rest') return 'Folgas e repousos';
  if (mode === 'gym') return 'Academia';
  if (mode === 'routine') return 'Rotina inteligente';
  return 'Escala completa';
}

function arrivesNextDay(start: string, end: string): boolean {
  return minutesOfDay(end) <= minutesOfDay(start);
}

function minutesOfDay(time: string): number {
  const [hour, minute] = time.replace('(+1)', '').split(':').map(Number);
  return hour * 60 + minute;
}

function parseDate(dateStr: string): Date {
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(dateStr);
}

function formatDateForIcal(dateStr: string, addDays = 0): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + addDays);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTimeForIcal(dateStr: string, timeStr: string, addDays = 0): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + addDays);
  const [hours, minutes] = timeStr.replace('(+1)', '').split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
}

function escapeIcal(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function airportLabel(code: string): string {
  const meta = AIRPORT_META[code];
  if (!meta) return code;
  return `${code} · ${meta.city}`;
}

function cityOnly(code: string): string {
  return AIRPORT_META[code]?.city || code;
}

function monthName(month: number): string {
  return ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][month - 1] || String(month);
}

function displayDate(dateStr: string): string {
  const date = parseDate(dateStr);
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function toUtcLabel(dateStr: string, timeStr: string, addDays = 0): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + addDays);
  const [hours, minutes] = timeStr.replace('(+1)', '').split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }).format(date) + ' UTC';
}

function formatDecimalHours(value: number): string {
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function translateWorkType(type: string): string {
  const normalized = (type || '').toUpperCase();
  if (normalized === 'OP') return 'Operacional';
  if (normalized === 'PS') return 'Posicionamento';
  if (normalized === 'DH') return 'Deadhead / deslocamento';
  return normalized || 'Operacional';
}

function getRosterCode(day: RosterDay): string {
  const source = `${day.pairingCode || ''} ${day.type || ''} ${day.rawText || ''}`.toUpperCase();
  return source.match(/\b(NSJ|IJ|NS|DM|[A-Z]{1,4}J)\b/)?.[1] || '';
}

function translateDutyType(day: RosterDay): string {
  if (day.type === 'ASB') return 'ASB · Airport Stand By';
  if (day.type === 'HSB') return 'HSB · Home Stand By';
  if (day.type === 'HSBE') return 'HSBE · Home Stand By Extra';
  if (/^C\d{2,3}F$/i.test(day.pairingCode || '') || /\bC\d{2,3}F\b/i.test(day.rawText || '')) return 'C32F · Check de competência A32F';
  if (day.pairingCode === 'CBF') return 'CBF · EAD - Combate ao Fogo';
  if (day.pairingCode === 'EMER') return 'EMER · EAD - Emergências Gerais';
  if (day.pairingCode === 'MT') return 'MT · Meeting / reunião com a chefia';
  const rosterCode = getRosterCode(day);
  if (rosterCode === 'NS') return 'NS · Não comparecimento';
  if (rosterCode === 'NSJ') return 'NSJ · Não comparecimento justificado';
  if (rosterCode.endsWith('J') && rosterCode !== 'IJ') return `${rosterCode} · Justificado`;
  if (rosterCode === 'IJ') return 'IJ · Interrupção de jornada';
  if (rosterCode === 'DM') return 'DM · Dispensa médica';
  if (day.type === 'CRM') return 'CRM · Corporate Resource Management';
  return day.pairingCode || day.type;
}

function explainRestType(type: RosterDay['type']): string {
  if (type === 'DO') return 'Folga formal registrada na escala (DO).';
  if (type === 'DOF') return 'Folga formal registrada na escala (DOF).';
  if (type === 'DR') return 'Descanso regulamentar registrado na escala (DR).';
  if (type === 'OFF') return 'Extensão do descanso registrada na escala (OFF).';
  return `Dia de descanso registrado como ${type}.`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function downloadCalendarFile(ical: string, filename: string = 'crew-roster.ics'): void {
  const element = document.createElement('a');
  const file = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(element.href);
}
