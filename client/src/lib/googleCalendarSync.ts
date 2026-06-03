import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';
import type { GymRecommendation } from './complianceEngine';
import type { RoutineSuggestion } from './routinePlanner';
import { getActivityCodes, primaryActivityCode } from './rosterNormalizer';
import { getRosterCodeDefinition, rosterCodeTitle } from './rosterCodes';

export type GoogleCalendarSyncStatus = 'idle' | 'connecting' | 'loading-calendars' | 'syncing' | 'success' | 'error';

export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
}

export type GoogleCalendarSyncMode = 'all' | 'flights' | 'gym' | 'routine';

export interface GoogleCalendarSettings {
  selectedCalendarId: string;
  selectedCalendarName: string;
  autoSync: boolean;
  exportMode: GoogleCalendarSyncMode;
}

export interface GoogleCalendarSyncExtras {
  gymRecommendations?: GymRecommendation[];
  routineSuggestions?: RoutineSuggestion[];
}

export interface GoogleSyncResult {
  created: number;
  updated: number;
  deleted: number;
  total: number;
  calendarId: string;
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleEventPayload {
  eventKey: string;
  summary: string;
  description: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  reminders?: { useDefault: boolean; overrides?: Array<{ method: 'popup'; minutes: number }> };
  colorId?: string;
}

const CLIENT_ID_OVERRIDE_KEY = 'crewcheck_google_client_id_override';

const SETTINGS_KEY = 'crewcheck_google_calendar_settings';
const GOOGLE_SCOPE = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');
const TIME_ZONE = 'America/Sao_Paulo';

let accessToken: string | null = null;
let tokenClientPromise: Promise<GoogleTokenClient> | null = null;

export function getGoogleClientId(): string {
  const envClientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  if (envClientId) return envClientId;
  try {
    return String(localStorage.getItem(CLIENT_ID_OVERRIDE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function getGoogleClientIdOverride(): string {
  try {
    return String(localStorage.getItem(CLIENT_ID_OVERRIDE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function saveGoogleClientIdOverride(value: string): void {
  try {
    const cleaned = String(value || '').trim();
    if (cleaned) localStorage.setItem(CLIENT_ID_OVERRIDE_KEY, cleaned);
    else localStorage.removeItem(CLIENT_ID_OVERRIDE_KEY);
    tokenClientPromise = null;
    accessToken = null;
  } catch {
    // localStorage indisponível: ignora e mantém fluxo por variável de ambiente.
  }
}

export function hasGoogleClientIdFromEnv(): boolean {
  return Boolean(String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim());
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

export function loadGoogleCalendarSettings(): GoogleCalendarSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultGoogleCalendarSettings();
    return { ...defaultGoogleCalendarSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultGoogleCalendarSettings();
  }
}

function defaultGoogleCalendarSettings(): GoogleCalendarSettings {
  return { selectedCalendarId: 'primary', selectedCalendarName: 'Calendário principal', autoSync: false, exportMode: 'all' };
}

export function saveGoogleCalendarSettings(settings: GoogleCalendarSettings): GoogleCalendarSettings {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export function hasGoogleCalendarToken(): boolean {
  return Boolean(accessToken);
}

export async function connectGoogleCalendar(prompt = ''): Promise<void> {
  if (!isGoogleCalendarConfigured()) {
    throw new Error('Configure VITE_GOOGLE_CLIENT_ID para ativar a sincronização com Google Calendar.');
  }
  const client = await getTokenClient();
  await new Promise<void>((resolve, reject) => {
    const previous = (window as any).__crewcheckGoogleTokenCallback;
    (window as any).__crewcheckGoogleTokenCallback = (response: any) => {
      (window as any).__crewcheckGoogleTokenCallback = previous;
      if (response?.error) reject(new Error(response.error_description || response.error));
      else {
        accessToken = response?.access_token || accessToken;
        if (!accessToken) reject(new Error('Google não retornou token de acesso.'));
        else resolve();
      }
    };
    client.requestAccessToken({ prompt });
  });
}

export async function listGoogleCalendars(): Promise<GoogleCalendarOption[]> {
  await ensureGoogleToken();
  const payload = await googleFetch<{ items?: GoogleCalendarOption[] }>('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer');
  const items: GoogleCalendarOption[] = (payload.items || [])
    .filter((item) => item.id && item.summary)
    .map((item) => ({ id: item.id, summary: item.summary, primary: item.primary, accessRole: item.accessRole, backgroundColor: item.backgroundColor }));
  if (!items.some((item) => item.id === 'primary')) {
    items.unshift({ id: 'primary', summary: 'Calendário principal', primary: true, accessRole: 'owner' });
  }
  return items;
}

export async function syncRosterToGoogleCalendar(roster: CrewRoster, settings = loadGoogleCalendarSettings(), extras: GoogleCalendarSyncExtras = {}): Promise<GoogleSyncResult> {
  await ensureGoogleToken();
  const calendarId = settings.selectedCalendarId || 'primary';
  const periodKey = buildPeriodKey(roster);
  const desiredEvents = buildGoogleEvents(roster, periodKey, settings.exportMode || 'all', extras);
  const existing = await listExistingCrewCheckEvents(calendarId, roster, periodKey);
  const existingByKey = new Map(existing.map((event: any) => [event.extendedProperties?.private?.crewcheckEventKey, event]));

  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const desired of desiredEvents) {
    const previous = existingByKey.get(desired.eventKey);
    const body = toGoogleEventBody(desired, periodKey);
    if (previous?.id) {
      await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(previous.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      updated += 1;
      existingByKey.delete(desired.eventKey);
    } else {
      await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      created += 1;
    }
  }

  for (const stale of existingByKey.values()) {
    if (!stale?.id) continue;
    await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(stale.id)}`, {
      method: 'DELETE',
      expectJson: false,
    });
    deleted += 1;
  }

  return { created, updated, deleted, total: desiredEvents.length, calendarId };
}

async function getTokenClient(): Promise<GoogleTokenClient> {
  if (!tokenClientPromise) {
    tokenClientPromise = loadGoogleIdentityScript().then(() => {
      const clientId = getGoogleClientId();
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) throw new Error('Google Identity Services não carregou corretamente.');
      return google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPE,
        callback: (response: any) => (window as any).__crewcheckGoogleTokenCallback?.(response),
      }) as GoogleTokenClient;
    });
  }
  return tokenClientPromise;
}

async function ensureGoogleToken(): Promise<void> {
  if (accessToken) return;
  await connectGoogleCalendar('consent');
}

function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-crewcheck-google-identity="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o Google Identity Services.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.crewcheckGoogleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Identity Services.'));
    document.head.appendChild(script);
  });
}

async function googleFetch<T = any>(url: string, init?: RequestInit & { expectJson?: boolean }): Promise<T> {
  if (!accessToken) throw new Error('Google Calendar não conectado.');
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (response.status === 401) {
    accessToken = null;
    throw new Error('A autorização do Google expirou. Conecte novamente.');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || `Google Calendar retornou HTTP ${response.status}.`);
  }
  if (init?.expectJson === false || response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function listExistingCrewCheckEvents(calendarId: string, roster: CrewRoster, periodKey: string): Promise<any[]> {
  const timeMin = new Date(roster.year, roster.month - 1, 1, 0, 0, 0).toISOString();
  const timeMax = new Date(roster.year, roster.month, 1, 0, 0, 0).toISOString();
  const params = new URLSearchParams({
    privateExtendedProperty: `crewcheckPeriodKey=${periodKey}`,
    singleEvents: 'true',
    showDeleted: 'false',
    maxResults: '2500',
    timeMin,
    timeMax,
  });
  const payload = await googleFetch<{ items?: any[] }>(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
  return payload.items || [];
}

function toGoogleEventBody(event: GoogleEventPayload, periodKey: string): any {
  return {
    summary: event.summary,
    description: event.description,
    location: event.location || '',
    colorId: event.colorId,
    start: event.start,
    end: event.end,
    reminders: event.reminders || { useDefault: false, overrides: [{ method: 'popup', minutes: 120 }, { method: 'popup', minutes: 30 }] },
    extendedProperties: {
      private: {
        crewcheck: 'true',
        crewcheckPeriodKey: periodKey,
        crewcheckEventKey: event.eventKey,
      },
    },
  };
}

function buildGoogleEvents(roster: CrewRoster, periodKey: string, mode: GoogleCalendarSyncMode, extras: GoogleCalendarSyncExtras): GoogleEventPayload[] {
  const events: GoogleEventPayload[] = [];
  const includeRoster = mode === 'all' || mode === 'flights';
  const includeOnlyFlights = mode === 'flights';

  if (includeRoster) for (const day of roster.days || []) {
    if (day.legs?.length) {
      const first = day.legs[0];
      const last = day.legs[day.legs.length - 1];
      const startTime = day.dutyReport || first.departureTime;
      const endTime = day.dutyDebrief || last.arrivalTime;
      const route = routeChain(day.legs);
      const activity = activityPrefix(day);
      const summary = activity ? `${activity} + ${route}` : route;
      events.push({
        eventKey: `${periodKey}:flight:${day.date}:${route}:${flightCodeSummary(day.legs)}`,
        summary,
        description: buildDescription(roster, day),
        location: `${first.origin} → ${last.destination}`,
        start: { dateTime: toDateTime(day.date, startTime), timeZone: TIME_ZONE },
        end: { dateTime: toDateTime(day.date, endTime, isNextDay(startTime, endTime) || Boolean(day.isNextDay) ? 1 : 0), timeZone: TIME_ZONE },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 120 }, { method: 'popup', minutes: 30 }] },
        colorId: googleColorIdForDay(day),
      });
      continue;
    }

    if (!includeOnlyFlights && day.dutyReport && day.dutyDebrief && !isRestDay(day)) {
      const code = primaryActivityCode(day) || day.type;
      events.push({
        eventKey: `${periodKey}:duty:${day.date}:${code}:${day.dutyReport}`,
        summary: dutySummary(day),
        description: buildDescription(roster, day),
        location: day.base || roster.base,
        start: { dateTime: toDateTime(day.date, day.dutyReport), timeZone: TIME_ZONE },
        end: { dateTime: toDateTime(day.date, day.dutyDebrief, isNextDay(day.dutyReport, day.dutyDebrief) || Boolean(day.isNextDay) ? 1 : 0), timeZone: TIME_ZONE },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 120 }, { method: 'popup', minutes: 30 }] },
        colorId: googleColorIdForDay(day),
      });
      continue;
    }

    if (!includeOnlyFlights && isRestDay(day)) {
      const code = day.type || 'REST';
      events.push({
        eventKey: `${periodKey}:rest:${day.date}:${code}`,
        summary: restSummary(day),
        description: buildDescription(roster, day),
        start: { date: toDateOnly(day.date) },
        end: { date: toDateOnly(day.date, 1) },
        reminders: { useDefault: false },
        colorId: googleColorIdForDay(day),
      });
    }
  }
  if (mode === 'all' || mode === 'gym') {
    for (const gym of extras.gymRecommendations || []) {
      events.push({
        eventKey: `${periodKey}:gym:${gym.date}:${gym.startTime}:${gym.endTime}`,
        summary: gym.priority === 'high' ? 'Academia · Treino recomendado' : gym.priority === 'medium' ? 'Academia · Treino moderado' : 'Academia · Recuperação ativa',
        description: [
          'Sugestão de academia gerada pelo CrewCheck.',
          `Prioridade: ${gym.priority}`,
          `Janela sugerida: ${gym.suggestedTime}`,
          `Motivo: ${gym.reason}`,
        ].join('\n'),
        location: 'Academia',
        start: { dateTime: toDateTime(gym.date, gym.startTime), timeZone: TIME_ZONE },
        end: { dateTime: toDateTime(gym.date, gym.endTime), timeZone: TIME_ZONE },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
        colorId: '2',
      });
    }
  }

  if (mode === 'all' || mode === 'routine') {
    for (const item of extras.routineSuggestions || []) {
      events.push({
        eventKey: `${periodKey}:routine:${item.id}:${item.date}:${item.startTime}`,
        summary: `Rotina · ${item.activityName}`,
        description: [
          'Sugestão de rotina gerada pelo CrewCheck.',
          `Tipo: ${item.activityType}`,
          `Intensidade: ${item.intensity}`,
          `Adequação: ${item.suitability} (${item.score}/100)`,
          `Motivo: ${item.reason}`,
          `Cuidado: ${item.caution}`,
        ].join('\n'),
        location: item.activityName,
        start: { dateTime: toDateTime(item.date, item.startTime), timeZone: TIME_ZONE },
        end: { dateTime: toDateTime(item.date, item.endTime), timeZone: TIME_ZONE },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
        colorId: isRoutinePhysical(item.activityType) ? '2' : '7',
      });
    }
  }

  return events;
}

function isRoutinePhysical(type: string): boolean {
  return ['musculacao', 'corrida', 'caminhada', 'crossfit'].includes(type);
}


function googleColorIdForDay(day: RosterDay): string {
  if (isPsFlightDay(day)) return '8'; // graphite: voo extra/PS em cinza
  if (day.legs?.length) return '9'; // blue: voo operacional
  const code = primaryActivityCode(day) || day.pairingCode || day.type;
  const def = getRosterCodeDefinition(code);
  const category = def?.category;
  if (category === 'DAY_OFF') return '10'; // green
  if (category === 'SIMULATOR') return '3'; // purple
  if (category === 'TRANSPORT') return '5'; // yellow/brown
  if (category === 'RESERVE' || category === 'STANDBY' || day.type === 'ASB' || day.type === 'HSB' || day.type === 'HSBE') return '6'; // orange
  if (category === 'DAY_MARKER') return '6'; // orange
  if (category === 'MEDICAL' || category === 'MEETING') return '7'; // cyan/peacock
  if (category === 'GROUND_DUTY') return '11'; // red
  if (day.type === 'LAYOVER') return '5';
  return '7';
}

function isPsFlightDay(day: RosterDay): boolean {
  const code = String(day.pairingCode || day.type || '').toUpperCase();
  return code === 'PS' || Boolean(day.legs?.length && day.legs.some((leg) => String(leg.workType || '').toUpperCase() === 'PS'));
}

function buildPeriodKey(roster: CrewRoster): string {
  const crew = sanitizeKey(roster.crewId || roster.crewName || 'crew');
  return `crewcheck:${crew}:${roster.year}-${String(roster.month).padStart(2, '0')}`;
}

function sanitizeKey(value: string): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'crew';
}

function activityPrefix(day: RosterDay): string {
  const code = getActivityCodes(day).find((item) => Boolean(getRosterCodeDefinition(item)));
  if (!code) return '';
  const def = getRosterCodeDefinition(code);
  return def ? def.title : code;
}

function dutySummary(day: RosterDay): string {
  const code = primaryActivityCode(day) || day.type;
  const def = getRosterCodeDefinition(code);
  if (def) return rosterCodeTitle(def.code);
  if (code === 'HSBE' || code === 'HSB') return `${code} / Sobreaviso`;
  if (code === 'ASB' || day.type === 'ASB') return 'ASB / Reserva';
  return `${code || day.type} / Atividade`;
}

function restSummary(day: RosterDay): string {
  if (day.type === 'LAYOVER') return `Inativo / pernoite${day.hotel ? ` · ${day.hotel}` : ''}`;
  if (day.type === 'DR') return 'Descanso regulamentar';
  if (day.type === 'OFF') return 'OFF';
  return 'Folga formal';
}

function buildDescription(roster: CrewRoster, day: RosterDay): string {
  const lines = [
    'Sincronizado pelo CrewCheck.',
    `Tripulante: ${roster.crewName || 'Tripulante'}`,
    `BP: ${roster.crewId || '-'}`,
    `Base: ${roster.base || day.base || '-'}`,
    `Data: ${day.date}`,
    day.dutyReport && day.dutyDebrief ? `Horário: ${day.dutyReport} - ${day.dutyDebrief}` : '',
    day.legs?.length ? `Voos: ${flightCodeSummary(day.legs)}` : '',
    day.legs?.length ? `Rota: ${routeChain(day.legs)}` : '',
    day.rawText ? `Fonte: ${day.rawText}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function isRestDay(day: RosterDay): boolean {
  return ['OFF', 'DO', 'DOF', 'DR', 'LAYOVER'].includes(day.type);
}

function routeChain(legs: FlightLeg[]): string {
  if (!legs.length) return 'Escala';
  const points = [legs[0].origin];
  for (const leg of legs) if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  return points.join(' – ');
}

function flightCodeSummary(legs: FlightLeg[]): string {
  return Array.from(new Set(legs.map((leg) => leg.flightNumber))).join(' · ');
}

function toDateOnly(date: string, addDays = 0): string {
  const parsed = parseDate(date);
  parsed.setDate(parsed.getDate() + addDays);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function toDateTime(date: string, time: string, addDays = 0): string {
  const parsed = parseDate(date);
  parsed.setDate(parsed.getDate() + addDays);
  const [hour, minute] = time.replace('(+1)', '').split(':').map(Number);
  parsed.setHours(hour || 0, minute || 0, 0, 0);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}T${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}:00`;
}

function parseDate(value: string): Date {
  const [day, month, year] = value.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function isNextDay(start: string, end: string): boolean {
  return minutes(end) <= minutes(start);
}

function minutes(value: string): number {
  const [hour, minute] = value.replace('(+1)', '').split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}
