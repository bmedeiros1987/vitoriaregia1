import type { CrewRoster } from './pdfParser';
import type { GymRecommendation } from './complianceEngine';
import type { RoutineSuggestion } from './routinePlanner';
import { generateICalendar, type CalendarExportMode } from './calendarExport';
import { authFetch } from './authClient';
import { t } from './i18n';

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
  feedUrl?: string;
}

export interface CalendarFeedInfo {
  feedUrl: string;
  token?: string;
  updatedAt?: string | null;
  periodLabel?: string | null;
  mode?: string | null;
  hasContent: boolean;
}

const SETTINGS_KEY = 'crewcheck_google_calendar_settings';
const CLIENT_ID_OVERRIDE_KEY = 'crewcheck_google_client_id_override';

function defaultGoogleCalendarSettings(): GoogleCalendarSettings {
  return {
    selectedCalendarId: 'crewcheck-ics-feed',
    selectedCalendarName: 'CrewCheck · assinatura automática ICS',
    autoSync: true,
    exportMode: 'all',
  };
}

export function getGoogleClientId(): string { return ''; }
export function getGoogleClientIdOverride(): string { return ''; }
export function saveGoogleClientIdOverride(_value: string): void {
  try { localStorage.removeItem(CLIENT_ID_OVERRIDE_KEY); } catch {}
}
export function hasGoogleClientIdFromEnv(): boolean { return false; }
export function isGoogleCalendarConfigured(): boolean { return true; }
export function hasGoogleCalendarToken(): boolean { return true; }
export async function connectGoogleCalendar(_prompt = ''): Promise<void> { await getCalendarFeedInfo().catch(() => undefined); }
export function disconnectGoogleCalendar(): void { /* Assinatura ICS não usa sessão Google. */ }

export function loadGoogleCalendarSettings(): GoogleCalendarSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { ...defaultGoogleCalendarSettings(), ...parsed };
    // Migração: versões antigas gravavam Google Calendar real. Agora usamos assinatura ICS.
    return {
      ...merged,
      selectedCalendarId: 'crewcheck-ics-feed',
      selectedCalendarName: 'CrewCheck · assinatura automática ICS',
      autoSync: typeof merged.autoSync === 'boolean' ? merged.autoSync : true,
    };
  } catch {
    return defaultGoogleCalendarSettings();
  }
}

export function saveGoogleCalendarSettings(settings: GoogleCalendarSettings): GoogleCalendarSettings {
  const saved: GoogleCalendarSettings = {
    ...defaultGoogleCalendarSettings(),
    ...settings,
    selectedCalendarId: 'crewcheck-ics-feed',
    selectedCalendarName: 'CrewCheck · assinatura automática ICS',
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
  return saved;
}

export async function listGoogleCalendars(): Promise<GoogleCalendarOption[]> {
  return [{
    id: 'crewcheck-ics-feed',
    summary: 'CrewCheck · assinatura automática ICS',
    primary: true,
    accessRole: 'owner',
    backgroundColor: '#2f80ed',
  }];
}

export async function getCalendarFeedInfo(): Promise<CalendarFeedInfo> {
  const payload = await authFetch<{ ok: boolean; feedUrl: string; token?: string; updatedAt?: string | null; periodLabel?: string | null; mode?: string | null; hasContent: boolean }>('/api/calendar-feed');
  return {
    feedUrl: payload.feedUrl,
    token: payload.token,
    updatedAt: payload.updatedAt || null,
    periodLabel: payload.periodLabel || null,
    mode: payload.mode || null,
    hasContent: Boolean(payload.hasContent),
  };
}

export async function syncRosterToGoogleCalendar(roster: CrewRoster, settings = loadGoogleCalendarSettings(), extras: GoogleCalendarSyncExtras = {}): Promise<GoogleSyncResult> {
  const mode = normalizeExportMode(settings.exportMode || 'all');
  const ical = generateICalendar(roster, extras.gymRecommendations, {
    mode,
    titleFormat: 'route-flight',
    includeReminders: true,
    flightReminderMinutes: [120, 30],
    dutyReminderMinutes: [120, 30],
    gymReminderMinutes: [60],
    routineReminderMinutes: [60],
    routineSuggestions: extras.routineSuggestions || [],
  });
  const total = (ical.match(/BEGIN:VEVENT/g) || []).length;
  const payload = await authFetch<{ ok: boolean; feedUrl: string; updatedAt?: string; periodLabel?: string; mode?: string }>('/api/calendar-feed', {
    method: 'POST',
    body: JSON.stringify({
      ical,
      periodLabel: `${String(roster.month).padStart(2, '0')}/${roster.year}`,
      mode,
      eventsCount: total,
    }),
  });
  return {
    created: total,
    updated: total,
    deleted: 0,
    total,
    calendarId: 'crewcheck-ics-feed',
    feedUrl: payload.feedUrl,
  };
}

function normalizeExportMode(mode: GoogleCalendarSyncMode): CalendarExportMode {
  if (mode === 'flights') return 'flights';
  if (mode === 'gym') return 'gym';
  if (mode === 'routine') return 'routine';
  return 'all';
}

export function explainCalendarFeed(): string {
  return 'Sem Google Cloud e sem OAuth: o CrewCheck atualiza um link ICS privado. Assine esse link uma vez no Google Calendar; depois, cada nova escala importada atualiza o mesmo calendário automaticamente.';
}

export function googleCalendarSimpleLabel(): string {
  return t('primaryCalendar') || 'Agenda';
}
