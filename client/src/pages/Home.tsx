import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode, type RefObject } from 'react';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Database,
  Download as DownloadIcon,
  Dumbbell,
  FileText,
  FolderOpen,
  ExternalLink,
  GraduationCap,
  History,
  Home as HomeIcon,
  Loader2,
  Lock,
  Mail,
  Languages,
  Menu,
  Monitor,
  Moon,
  LogOut,
  Plane,
  Radar,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  StickyNote,
  Sun,
  TrendingUp,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { analyzeCompliance, getGymRecommendations, type ComplianceResult, type GymRecommendation } from '@/lib/complianceEngine';
import { detectAndMarkLayovers } from '@/lib/layoverDetection';
import { normalizeRosterSchedule } from '@/lib/rosterNormalizer';
import type { CrewRoleSelection } from '@/lib/actRules';
import { parsePDF, type CrewRoster } from '@/lib/pdfParser';
import { getStoredUser, getToken, logout } from '@/lib/authClient';
import { syncPendingRosters, getPendingOfflineCount } from '@/lib/offlineSync';
import { getDatabaseStatus, listSavedRosters, openSavedRoster, type DatabaseStatus, type SavedRosterSummary } from '@/lib/databaseClient';
import { exportReport } from '@/lib/pdfExport';
import { applyDocumentLanguage, getSavedLanguage, saveCrewLanguage, type CrewLanguage } from '@/lib/i18n';
import { downloadCalendarFile, generateICalendar } from '@/lib/calendarExport';
import {
  connectGoogleCalendar,
  hasGoogleCalendarToken,
  hasGoogleClientIdFromEnv,
  getGoogleClientIdOverride,
  isGoogleCalendarConfigured,
  listGoogleCalendars,
  loadGoogleCalendarSettings,
  saveGoogleCalendarSettings,
  saveGoogleClientIdOverride,
  type GoogleCalendarOption,
  type GoogleCalendarSettings,
  type GoogleCalendarSyncMode,
} from '@/lib/googleCalendarSync';
import Dashboard from '../components/premium/Dashboard';
import CalendarView from '../components/premium/CalendarView';
import IFlightIntegrationView from '../components/premium/IFlightIntegrationView';

type HomeView = 'home' | 'import' | 'history' | 'calendar' | 'iflight' | 'routine' | 'c32f' | 'settings' | 'notes' | 'more';
type CrewThemeMode = 'light' | 'dark' | 'system';
type ResultsView = 'summary' | 'roster' | 'alerts' | 'irregularities' | 'gym' | 'fatigue' | 'metrics' | 'glossary' | 'statistics' | 'settings' | 'manual';

type NativePdfPayload = {
  ok?: boolean;
  filename?: string;
  sourceFileName?: string;
  dataBase64?: string;
};

const RESULT_VIEWS = new Set<ResultsView>(['summary', 'roster', 'alerts', 'irregularities', 'gym', 'fatigue', 'metrics', 'glossary', 'statistics', 'settings', 'manual']);

const C32F_ADMIN_EMAIL = 'bmedeiros1987@gmail.com';

function normalizeEmail(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function isC32FAcademyAdmin(user: ReturnType<typeof getStoredUser>): boolean {
  return normalizeEmail(user?.email) === C32F_ADMIN_EMAIL;
}

async function fileToBase64Payload(file: File): Promise<string> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('Arquivo inválido.'));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'));
    reader.readAsArrayBuffer(file);
  });
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToPdfFile(filename: string, dataBase64: string): File {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename || 'iFlight_RosterReport.pdf', { type: 'application/pdf' });
}

async function parsePdfViaServer(file: File): Promise<CrewRoster> {
  const dataBase64 = await fileToBase64Payload(file);
  const response = await fetch('/api/parse-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, dataBase64 }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.roster) {
    throw new Error(payload?.message || payload?.detail || 'Parser servidor indisponível.');
  }
  return payload.roster as CrewRoster;
}

function hasCurrentRosterSession() {
  return Boolean(sessionStorage.getItem('crewcheck_roster') && sessionStorage.getItem('crewcheck_compliance'));
}

function setInitialResultsView(view?: ResultsView) {
  if (view && RESULT_VIEWS.has(view)) sessionStorage.setItem('crewcheck_initial_view', view);
}


type SessionRosterBundle = {
  roster: CrewRoster;
  compliance: ComplianceResult;
  gym: GymRecommendation[];
};

type LocalProfileSettings = {
  displayName: string;
  company: string;
  base: string;
  rank: string;
};

function loadLocalProfileSettings(): LocalProfileSettings {
  try {
    return {
      displayName: localStorage.getItem('crewcheck_profile_display_name') || '',
      company: localStorage.getItem('crewcheck_profile_company') || '',
      base: localStorage.getItem('crewcheck_profile_base') || '',
      rank: localStorage.getItem('crewcheck_profile_rank') || '',
    };
  } catch {
    return { displayName: '', company: '', base: '', rank: '' };
  }
}

function saveLocalProfileSettings(settings: LocalProfileSettings): LocalProfileSettings {
  const cleaned = {
    displayName: settings.displayName.trim(),
    company: settings.company.trim(),
    base: settings.base.trim().toUpperCase(),
    rank: settings.rank.trim(),
  };
  try {
    localStorage.setItem('crewcheck_profile_display_name', cleaned.displayName);
    localStorage.setItem('crewcheck_profile_company', cleaned.company);
    localStorage.setItem('crewcheck_profile_base', cleaned.base);
    localStorage.setItem('crewcheck_profile_rank', cleaned.rank);
  } catch {
    // mantém estado em memória quando storage não está disponível
  }
  return cleaned;
}

function loadCrewThemeMode(): CrewThemeMode {
  try {
    const saved = localStorage.getItem('crewcheck_theme_mode');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function getEffectiveCrewTheme(mode: CrewThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function saveAndApplyCrewThemeMode(mode: CrewThemeMode): CrewThemeMode {
  try {
    localStorage.setItem('crewcheck_theme_mode', mode);
    const effective = getEffectiveCrewTheme(mode);
    document.documentElement.dataset.crewThemeMode = mode;
    document.documentElement.dataset.crewTheme = effective;
    document.documentElement.classList.toggle('dark', effective === 'dark');
    document.documentElement.style.colorScheme = effective;
    window.dispatchEvent(new CustomEvent('crewcheck:theme-change', { detail: { mode, effective } }));
  } catch {
    // mantém estado visual padrão quando storage não estiver disponível
  }
  return mode;
}

function readCurrentRosterBundle(): SessionRosterBundle | null {
  try {
    const rosterRaw = sessionStorage.getItem('crewcheck_roster');
    const complianceRaw = sessionStorage.getItem('crewcheck_compliance');
    if (!rosterRaw || !complianceRaw) return null;
    return {
      roster: JSON.parse(rosterRaw) as CrewRoster,
      compliance: JSON.parse(complianceRaw) as ComplianceResult,
      gym: JSON.parse(sessionStorage.getItem('crewcheck_gym') || '[]') as GymRecommendation[],
    };
  } catch {
    return null;
  }
}


type DashboardNextEvent = {
  title: string;
  time: string;
  endTime: string;
  date: string;
  route?: string;
  status?: string;
  gate?: string;
  terminal?: string;
  countdown?: string;
  source?: string;
};

function buildDashboardNextEvent(bundle: SessionRosterBundle | null, saved?: SavedRosterSummary): DashboardNextEvent {
  const fallback: DashboardNextEvent = saved
    ? {
        title: saved.sourceFileName || 'Escala salva',
        time: 'Abrir',
        endTime: 'histórico',
        date: `${monthLabel(saved.month, saved.year)} · ${saved.base || 'Base'}`,
        status: 'Salva',
        countdown: '—',
        source: 'Histórico CrewCheck',
      }
    : {
        title: 'Importe sua escala',
        time: 'PDF',
        endTime: 'novo',
        date: 'CrewRosterReport / AIMS / iFlight',
        status: 'Aguardando',
        countdown: '—',
        source: 'Importação local',
      };

  const roster = bundle?.roster;
  if (!roster?.days?.length) return fallback;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sorted = [...roster.days].sort((a, b) => rosterDateFromString(a.date).getTime() - rosterDateFromString(b.date).getTime());
  const nextDay = sorted.find((day) => rosterDateFromString(day.date).getTime() >= today.getTime()) || sorted[0];
  const firstLeg = nextDay.legs?.[0];
  const lastLeg = nextDay.legs?.[nextDay.legs.length - 1];
  const route = firstLeg && lastLeg ? `${firstLeg.origin} → ${lastLeg.destination}` : (nextDay.pairingCode || nextDay.type || 'Programação');
  const title = firstLeg ? route : readableDutyTitle(nextDay.type, nextDay.pairingCode);
  const report = nextDay.dutyReport || firstLeg?.departureTime || '—';
  const end = nextDay.dutyDebrief || lastLeg?.arrivalTime || '—';
  return {
    title,
    route,
    time: report,
    endTime: end,
    date: `${nextDay.dayOfWeek || ''} ${nextDay.date}`.trim(),
    status: firstLeg ? 'Programado' : readableDutyTitle(nextDay.type, nextDay.pairingCode),
    gate: '—',
    terminal: '—',
    countdown: countdownToRosterTime(nextDay.date, report),
    source: 'Escala atual',
  };
}

function rosterDateFromString(value: string): Date {
  const [day, month, year] = String(value || '').split(/[\/.-]/).map((part) => Number(part));
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function countdownToRosterTime(date: string, time: string): string {
  const target = rosterDateFromString(date);
  const [hours, minutes] = String(time || '').split(':').map((part) => Number(part));
  if (Number.isFinite(hours)) target.setHours(hours, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return 'agora';
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hoursLeft = Math.floor((totalMinutes % 1440) / 60);
  const minutesLeft = totalMinutes % 60;
  if (days > 0) return `${days}d ${hoursLeft}h`;
  return `${hoursLeft}h ${String(minutesLeft).padStart(2, '0')}m`;
}

function readableDutyTitle(type: string, code?: string | null): string {
  const normalized = String(code || type || '').toUpperCase();
  if (['DO', 'DOF', 'DR', 'DOP', 'DOPR'].includes(normalized)) return 'Folga';
  if (['HSB', 'HSBE'].includes(normalized)) return 'Sobreaviso';
  if (['ASB', 'RES'].includes(normalized)) return 'Reserva';
  if (['CRM', 'C32F'].includes(normalized)) return 'Treinamento';
  return normalized || 'Programação';
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [currentView, setCurrentView] = useState<HomeView>('home');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [roleSelection, setRoleSelection] = useState<CrewRoleSelection>('auto');
  const [savedRosters, setSavedRosters] = useState<SavedRosterSummary[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [autoLatestLoaded, setAutoLatestLoaded] = useState(false);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [openingSavedId, setOpeningSavedId] = useState<string | null>(null);
  const [pendingOffline, setPendingOffline] = useState(getPendingOfflineCount());
  const [profileAvatar, setProfileAvatar] = useState(() => localStorage.getItem('crewcheck_profile_avatar') || '');
  const [profileSettings, setProfileSettings] = useState<LocalProfileSettings>(() => loadLocalProfileSettings());
  const [themeMode, setThemeMode] = useState<CrewThemeMode>(() => loadCrewThemeMode());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativePdfImportingRef = useRef(false);

  const user = getStoredUser();
  const currentRosterBundle = readCurrentRosterBundle();
  const canAccessC32FAcademy = isC32FAcademyAdmin(user);
  const dashboardNextEvent = buildDashboardNextEvent(currentRosterBundle, savedRosters[0]);
  const dashboardAlerts = currentRosterBundle?.compliance?.alerts?.length || 0;
  const dashboardDaysLoaded = currentRosterBundle?.roster?.days?.length || 0;
  const dashboardComplianceScore = currentRosterBundle?.compliance?.score;

  const refreshSavedRosters = useCallback(async () => {
    setSavedLoading(true);
    try {
      const [statusResult, historyResult] = await Promise.allSettled([
        getDatabaseStatus(),
        listSavedRosters(8),
      ]);
      if (statusResult.status === 'fulfilled') setDbStatus(statusResult.value);
      else setDbStatus({ ok: false, connected: false, databaseConfigured: false, message: 'Banco indisponível. Histórico local ativo.' });
      if (historyResult.status === 'fulfilled') setSavedRosters(historyResult.value);
      else setSavedRosters([]);
      setPendingOffline(getPendingOfflineCount());
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSavedRosters();
  }, [refreshSavedRosters]);


  useEffect(() => {
    if (autoLatestLoaded || savedLoading || hasCurrentRosterSession() || !savedRosters[0]) return;
    setAutoLatestLoaded(true);
    const latest = savedRosters[0];
    openSavedRoster(latest.id)
      .then((data) => {
        const normalized = normalizeRosterSchedule(detectAndMarkLayovers(data.roster));
        sessionStorage.setItem('crewcheck_roster', JSON.stringify(normalized));
        sessionStorage.setItem('crewcheck_compliance', JSON.stringify(data.compliance));
        sessionStorage.setItem('crewcheck_gym', JSON.stringify(data.gym || []));
        sessionStorage.setItem('crewcheck_role_selection', roleSelection);
        sessionStorage.setItem('crewcheck_source_file', latest.sourceFileName || 'Última escala sincronizada');
        toast.success('Última escala sincronizada neste dispositivo.');
      })
      .catch(() => {
        // Mantém silencioso; o histórico continua disponível pelo menu.
      });
  }, [autoLatestLoaded, savedLoading, savedRosters, roleSelection]);

  useEffect(() => {
    saveAndApplyCrewThemeMode(themeMode);
    if (themeMode !== 'system') return;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => saveAndApplyCrewThemeMode('system');
    media?.addEventListener?.('change', onChange);
    return () => media?.removeEventListener?.('change', onChange);
  }, [themeMode]);

  const handleOpenSavedRoster = useCallback(async (id: string, targetView: ResultsView = 'summary') => {
    setOpeningSavedId(id);
    try {
      const data = await openSavedRoster(id);
      sessionStorage.setItem('crewcheck_roster', JSON.stringify(normalizeRosterSchedule(detectAndMarkLayovers(data.roster))));
      sessionStorage.setItem('crewcheck_compliance', JSON.stringify(data.compliance));
      sessionStorage.setItem('crewcheck_gym', JSON.stringify(data.gym || []));
      sessionStorage.setItem('crewcheck_role_selection', roleSelection);
      const summary = savedRosters.find((item) => item.id === id);
      sessionStorage.setItem('crewcheck_source_file', summary?.sourceFileName || 'Escala salva');
      setInitialResultsView(targetView);
      toast.success('Escala salva carregada.');
      setLocation('/results');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a escala salva.');
    } finally {
      setOpeningSavedId(null);
    }
  }, [roleSelection, savedRosters, setLocation]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      sessionStorage.clear();
      setLocation('/login');
    }
  }

  async function handleSyncPending() {
    try {
      const result = await syncPendingRosters();
      await refreshSavedRosters();
      setPendingOffline(result.remaining);
      if (result.synced > 0) toast.success(`${result.synced} escala(s) sincronizada(s).`);
      if (result.remaining > 0) toast.warning(`${result.remaining} pendência(s) ainda offline.`);
      if (!result.synced && !result.remaining) toast.info('Nenhuma pendência offline para sincronizar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao sincronizar pendências offline.');
    }
  }


  function handleExportCurrentPdf() {
    const bundle = readCurrentRosterBundle();
    if (!bundle) {
      toast.info('Importe ou abra uma escala antes de exportar o PDF completo.');
      setCurrentView('import');
      return;
    }
    exportReport(bundle.roster, bundle.compliance, bundle.gym);
    toast.success('PDF completo da escala gerado.');
  }

  function handleExportCurrentIcs() {
    const bundle = readCurrentRosterBundle();
    if (!bundle) {
      toast.info('Importe ou abra uma escala antes de exportar o calendário completo.');
      setCurrentView('import');
      return;
    }
    const ical = generateICalendar(bundle.roster, bundle.gym, {
      mode: 'all',
      titleFormat: 'route-flight',
      includeReminders: true,
      flightReminderMinutes: [120, 30],
      dutyReminderMinutes: [120, 30],
      gymReminderMinutes: [60],
      routineReminderMinutes: [60],
    });
    downloadCalendarFile(ical, `crewcheck-completo-${bundle.roster.year}-${String(bundle.roster.month).padStart(2, '0')}.ics`);
    toast.success('Calendário completo exportado.');
  }

  function handleProfileSettingsChange(next: LocalProfileSettings) {
    setProfileSettings(saveLocalProfileSettings(next));
    toast.success('Perfil atualizado neste dispositivo.');
  }

  const goToResults = useCallback((view: ResultsView = 'summary') => {
    if (hasCurrentRosterSession()) {
      setInitialResultsView(view);
      setLocation('/results');
      return;
    }
    if (savedRosters[0]) {
      void handleOpenSavedRoster(savedRosters[0].id, view);
      return;
    }
    toast.info('Carregue uma escala primeiro para abrir esta função.');
    setCurrentView('import');
  }, [handleOpenSavedRoster, savedRosters, setLocation]);

  const handleDashboardNavigate = useCallback((view: string) => {
    const map: Record<string, () => void> = {
      home: () => setCurrentView('home'),
      import: () => setCurrentView('import'),
      roster: () => goToResults('roster'),
      calendar: () => setCurrentView('calendar'),
      irregularities: () => goToResults('irregularities'),
      routine: () => goToResults('gym'),
      c32f: () => canAccessC32FAcademy ? setCurrentView('c32f') : toast.info('Academia C32F restrita ao administrador.'),
      iflight: () => setCurrentView('iflight'),
      history: () => setCurrentView('history'),
      reports: () => goToResults('metrics'),
      pdf: () => handleExportCurrentPdf(),
      ics: () => handleExportCurrentIcs(),
      google: () => goToResults('settings'),
      alerts: () => goToResults('alerts'),
      notes: () => setCurrentView('notes'),
      settings: () => setCurrentView('settings'),
      sync: () => void handleSyncPending(),
      more: () => setCurrentView('more'),
    };
    (map[view] || (() => setCurrentView('more')))();
  }, [canAccessC32FAcademy, goToResults]);

  const commitRoster = useCallback(async (inputRoster: CrewRoster, sourceFileName: string, targetView: ResultsView = 'summary') => {
    const roster = normalizeRosterSchedule(detectAndMarkLayovers(inputRoster));
    const compliance = analyzeCompliance(roster, roleSelection);
    const gym = getGymRecommendations(roster, roleSelection);

    sessionStorage.setItem('crewcheck_roster', JSON.stringify(roster));
    sessionStorage.setItem('crewcheck_compliance', JSON.stringify(compliance));
    sessionStorage.setItem('crewcheck_gym', JSON.stringify(gym));
    sessionStorage.setItem('crewcheck_role_selection', roleSelection);
    sessionStorage.setItem('crewcheck_source_file', sourceFileName);
    sessionStorage.setItem('crewcheck_auto_sync_pending', '1');
    sessionStorage.setItem('crewcheck_auto_db_save_pending', '1');
    setInitialResultsView(targetView);

    toast.success('Escala interpretada com sucesso.');
    setLocation('/results');
  }, [roleSelection, setLocation]);

  const handleRosterImport = useCallback(async (roster: CrewRoster, sourceFileName = 'iFlight LATAM') => {
    await commitRoster(roster, sourceFileName, 'roster');
  }, [commitRoster]);

  const handleFile = useCallback(async (file: File) => {
    const fileNameLower = (file.name || '').toLowerCase();
    const looksLikePdf = fileNameLower.endsWith('.pdf') || file.type === 'application/pdf' || file.type === 'application/octet-stream' || fileNameLower.includes('pdf');
    if (!looksLikePdf) {
      setError('Por favor, envie um arquivo PDF no formato CrewRosterReport ou AIMS. No iPhone, use Arquivos > iCloud/No iPhone e selecione o PDF original.');
      return;
    }
    if (!file.size || file.size < 50) {
      setError('O PDF selecionado parece vazio ou não foi liberado pelo iOS. Tente salvar o arquivo em Arquivos > No iPhone e selecionar novamente.');
      return;
    }

    setFileName(file.name);
    setIsProcessing(true);
    setError(null);

    try {
      let roster: CrewRoster;
      try {
        roster = await parsePdfViaServer(file);
      } catch (serverError) {
        console.warn('Server PDF parser failed; trying local parser fallback', serverError);
        try {
          roster = await parsePDF(file);
          toast.info('PDF interpretado pelo modo local do app.');
        } catch (localError) {
          console.error('Local PDF parser fallback failed', localError);
          const serverMessage = serverError instanceof Error ? serverError.message : 'Parser servidor indisponível.';
          const localMessage = localError instanceof Error ? localError.message : 'Parser local indisponível.';
          throw new Error(`${serverMessage} Fallback local: ${localMessage}`);
        }
      }
      await commitRoster(roster, file.name, 'summary');
    } catch (err) {
      console.error('Error parsing PDF:', err);
      const message = err instanceof Error ? err.message : '';
      setError(`Não consegui interpretar este PDF. ${message ? `Detalhe: ${message}. ` : ''}Tente salvar o arquivo localmente e selecionar novamente pelo botão Escolher PDF. Se for escala em formato ticket, confira se o PDF tem texto selecionável.`);
    } finally {
      setIsProcessing(false);
    }
  }, [commitRoster]);

  useEffect(() => {
    async function importNativePdf(payload?: NativePdfPayload) {
      if (!payload?.dataBase64 || nativePdfImportingRef.current) return;
      nativePdfImportingRef.current = true;
      const filename = payload.filename || payload.sourceFileName || 'iFlight_RosterReport.pdf';
      setCurrentView('import');
      setFileName(filename);
      setIsProcessing(true);
      setError(null);
      toast.info('PDF recebido do iFlight. Importando escala...');
      try {
        const file = base64ToPdfFile(filename, payload.dataBase64);
        let roster: CrewRoster;
        try {
          roster = await parsePdfViaServer(file);
        } catch (serverError) {
          console.warn('Server PDF parser failed for native PDF; trying local parser fallback', serverError);
          roster = await parsePDF(file);
        }
        await commitRoster(roster, filename, 'roster');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido.';
        setError(`Recebi o PDF do iFlight, mas não consegui interpretar. Detalhe: ${message}`);
        toast.error('Não consegui interpretar o PDF recebido do iFlight.');
      } finally {
        setIsProcessing(false);
        const win = window as Window & { __crewcheckPendingNativePdf?: NativePdfPayload };
        delete win.__crewcheckPendingNativePdf;
        nativePdfImportingRef.current = false;
      }
    }

    const handler = (event: Event) => {
      void importNativePdf((event as CustomEvent<NativePdfPayload>).detail);
    };

    window.addEventListener('crewcheck:native-pdf', handler as EventListener);
    const win = window as Window & { __crewcheckPendingNativePdf?: NativePdfPayload };
    if (win.__crewcheckPendingNativePdf) void importNativePdf(win.__crewcheckPendingNativePdf);
    return () => window.removeEventListener('crewcheck:native-pdf', handler as EventListener);
  }, [commitRoster]);

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  }, [handleFile]);

  const renderWithMobileMenu = (content: ReactNode, active: 'home' | 'roster' | 'iflight' | 'settings' | 'more' = 'home') => (
    <>
      <div className="crewcheck-mobile-menu-safe">{content}</div>
      <CrewCheckMobileMenu active={active} onNavigate={handleDashboardNavigate} />
    </>
  );

  if (currentView === 'calendar') return renderWithMobileMenu(<CalendarView onBack={() => setCurrentView('home')} />, 'roster');
  if (currentView === 'iflight') return renderWithMobileMenu(<IFlightIntegrationView onBack={() => setCurrentView('home')} onSuccess={() => goToResults('roster')} onFileUpload={handleFile} onRosterImport={handleRosterImport} />, 'iflight');

  if (currentView === 'import') {
    return renderWithMobileMenu(
      <ImportScreen
        userLabel={user?.name || user?.email || 'Usuário'}
        roleSelection={roleSelection}
        onRoleSelectionChange={setRoleSelection}
        isDragging={isDragging}
        isProcessing={isProcessing}
        error={error}
        fileName={fileName}
        fileInputRef={fileInputRef}
        onBack={() => setCurrentView('home')}
        onDrop={handleDrop}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onFileInput={handleFileInput}
        onLogout={handleLogout}
      />,
      'roster'
    );
  }

  if (currentView === 'history') {
    return renderWithMobileMenu(<HistoryScreen rosters={savedRosters} loading={savedLoading} dbStatus={dbStatus} openingId={openingSavedId} onBack={() => setCurrentView('home')} onOpen={(id) => void handleOpenSavedRoster(id, 'summary')} onRefresh={refreshSavedRosters} />, 'more');
  }

  if (currentView === 'routine') {
    return renderWithMobileMenu(<SimplePanel title="Minha Rotina" icon={Dumbbell} onBack={() => setCurrentView('home')} description="A rotina agora é calculada dentro da própria escala, considerando folgas, pernoites, sobreavisos, voos e intensidade do mês." actions={[{ label: 'Abrir rotina na escala', onClick: () => goToResults('gym') }, { label: 'Importar nova escala', onClick: () => setCurrentView('import') }]} />, 'more');
  }

  if (currentView === 'notes') {
    return renderWithMobileMenu(<NotesPanel onBack={() => setCurrentView('home')} />, 'more');
  }

  if (currentView === 'c32f') {
    if (!canAccessC32FAcademy) {
      return renderWithMobileMenu(<SimplePanel title="Acesso restrito" icon={Lock} onBack={() => setCurrentView('home')} description="A academia C32F é um módulo administrativo privado." actions={[{ label: 'Voltar ao início', onClick: () => setCurrentView('home') }]} />, 'home');
    }
    return renderWithMobileMenu(<C32FStudyPanel onBack={() => setCurrentView('home')} onOpenRoster={() => goToResults('roster')} />, 'more');
  }

  if (currentView === 'settings') {
    return renderWithMobileMenu(<SettingsHomePanel
      userLabel={profileSettings.displayName || user?.name || user?.email || 'Tripulante'}
      userEmail={user?.email || ''}
      profileSettings={profileSettings}
      avatar={profileAvatar}
      pendingOffline={pendingOffline}
      hasRoster={hasCurrentRosterSession()}
      onProfileSettingsChange={handleProfileSettingsChange}
      onAvatarChange={(value) => { setProfileAvatar(value); if (value) localStorage.setItem('crewcheck_profile_avatar', value); else localStorage.removeItem('crewcheck_profile_avatar'); }}
      themeMode={themeMode}
      onThemeModeChange={setThemeMode}
      onBack={() => setCurrentView('home')}
      onOpenIFlight={() => setCurrentView('iflight')}
      onOpenImport={() => setCurrentView('import')}
      onOpenResultsSettings={() => goToResults('settings')}
      onExportPdf={handleExportCurrentPdf}
      onExportIcs={handleExportCurrentIcs}
      onSyncPending={() => void handleSyncPending()}
      onLogout={handleLogout}
    />, 'settings');
  }

  if (currentView === 'more') {
    return renderWithMobileMenu(<MorePanel onBack={() => setCurrentView('home')} onNavigate={handleDashboardNavigate} onLogout={handleLogout} pendingOffline={pendingOffline} hasRoster={hasCurrentRosterSession()} canAccessC32FAcademy={canAccessC32FAcademy} />, 'more');
  }

  return renderWithMobileMenu(
    <div className="relative min-h-screen bg-[#08111f] crewcheck-has-global-menu">
      <Dashboard
        user={{ name: profileSettings.displayName || user?.name || user?.email || 'Tripulante', company: profileSettings.company || 'CrewCheck Premium', base: profileSettings.base || user?.base || undefined, avatar: profileAvatar || undefined }}
        nextEvent={dashboardNextEvent}
        canAccessC32FAcademy={canAccessC32FAcademy}
        pendingOffline={pendingOffline}
        hasRoster={hasCurrentRosterSession()}
        alertsCount={dashboardAlerts}
        daysLoaded={dashboardDaysLoaded}
        complianceScore={dashboardComplianceScore}
        onNavigate={handleDashboardNavigate}
      />

    </div>,
    'home'
  );
}

function CrewCheckMobileMenu({ active, onNavigate }: { active: 'home' | 'roster' | 'iflight' | 'settings' | 'more'; onNavigate: (view: string) => void }) {
  const items: { id: typeof active; label: string; icon: LucideIcon; view: string }[] = [
    { id: 'home', label: 'Início', icon: HomeIcon, view: 'home' },
    { id: 'roster', label: 'Escala', icon: CalendarDays, view: 'roster' },
    { id: 'iflight', label: 'iFlight', icon: Plane, view: 'iflight' },
    { id: 'settings', label: 'Config.', icon: Settings, view: 'settings' },
    { id: 'more', label: 'Mais', icon: Menu, view: 'more' },
  ];
  return (
    <nav className="crewcheck-global-bottom-menu fixed bottom-0 left-0 right-0 z-[95] border-t border-white/10 bg-[#08111f]/92 px-4 pb-[calc(0.9rem+env(safe-area-inset-bottom,0px))] pt-2.5 shadow-2xl shadow-black/45 backdrop-blur-2xl lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between gap-1">
        {items.map(({ id, label, icon: Icon, view }) => {
          const isActive = active === id;
          return (
            <button key={id} onClick={() => onNavigate(view)} className={`flex min-w-12 flex-1 flex-col items-center gap-1 rounded-2xl px-1.5 py-1.5 transition active:scale-95 ${isActive ? 'bg-cyan-300/15 text-cyan-200' : 'text-slate-400 hover:bg-white/8 hover:text-white'}`}>
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-black leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ImportScreen({ userLabel, roleSelection, onRoleSelectionChange, isDragging, isProcessing, error, fileName, fileInputRef, onBack, onDrop, onDragOver, onDragLeave, onFileInput, onLogout }: {
  userLabel: string;
  roleSelection: CrewRoleSelection;
  onRoleSelectionChange: (value: CrewRoleSelection) => void;
  isDragging: boolean;
  isProcessing: boolean;
  error: string | null;
  fileName: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  onBack: () => void;
  onDrop: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden overflow-y-auto bg-[#07111F] text-white crewcheck-import-screen">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.35),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(236,72,153,0.25),transparent_32%),linear-gradient(135deg,#07111F_0%,#0B1730_45%,#0A1020_100%)]" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.85) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.85) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
      </div>

      <div className="relative z-10">
        <header className="container py-6">
          <div className="flex items-center justify-between gap-4 crewcheck-light-card rounded-3xl border border-white/10 bg-white/[0.06] px-5 py-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <button onClick={onBack} className="flex items-center gap-3 text-left">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-cyan-100"><ArrowLeft className="h-5 w-5" /></div>
              <div>
                <h1 className="text-lg font-black tracking-tight">Nova escala</h1>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/70">Importação segura · LGPD</p>
              </div>
            </button>
            <div className="hidden items-center gap-2 md:flex">
              <Badge className="border-white/10 bg-white/10 text-cyan-100 hover:bg-white/10"><Lock className="mr-1.5 h-3.5 w-3.5" /> Conta protegida</Badge>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-cyan-100"><UserRound className="h-4 w-4" /><span className="max-w-[11rem] truncate">{userLabel}</span></div>
              <button onClick={onLogout} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-cyan-100 hover:bg-white/15"><LogOut className="mr-1 inline h-3.5 w-3.5" /> Sair</button>
            </div>
          </div>
        </header>

        <main className="container pb-16 pt-6 md:pb-24 md:pt-10">
          <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 shadow-lg shadow-cyan-950/30"><Sparkles className="h-4 w-4" /> Leitura premium do CrewRosterReport/AIMS com LGPD</div>
              <h2 className="max-w-4xl text-4xl font-black leading-[1.04] tracking-tight md:text-6xl">Transforme sua escala em painel, alertas, rotina e calendário.</h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200/80">Envie o PDF da escala. O CrewCheck interpreta voos, folgas, sobreavisos, pernoites, treinamentos e pontos de atenção com salvamento offline-first.</p>
              <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi icon={Radar} value="PDF" label="linhas, colunas e ticket" />
                <Kpi icon={Shield} value="ACT" label="piloto ou comissário" />
                <Kpi icon={CalendarDays} value="Google" label="calendário sem duplicar" />
                <Kpi icon={Dumbbell} value="Rotina" label="sugestão dentro da escala" />
              </div>
            </div>

            <Card className="crewcheck-light-card relative overflow-hidden rounded-[2rem] border-white/10 bg-white/[0.08] p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300" />
              <div className="crewcheck-light-card rounded-[1.5rem] border border-white/10 bg-[#0B1730]/70 p-5 md:p-7">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div><p className="text-sm font-semibold text-cyan-100">Upload seguro</p><h3 className="text-2xl font-black tracking-tight">Analisar escala</h3></div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200"><FileText className="h-6 w-6" /></div>
                </div>

                <div className="crewcheck-light-card mb-5 rounded-[1.2rem] border border-white/10 bg-white/[0.06] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-cyan-100">ACT aplicável</p><p className="text-xs leading-5 text-slate-300">O sistema tenta identificar pelo PDF, mas você pode forçar a função correta.</p></div><Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/10">2025/2027</Badge></div>
                  <select value={roleSelection} onChange={(event) => onRoleSelectionChange(event.target.value as CrewRoleSelection)} className="h-12 w-full rounded-2xl border border-white/15 bg-[#07111F] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300">
                    <option value="auto">Detectar automaticamente pela escala</option>
                    <option value="cabin">Aplicar ACT Comissários</option>
                    <option value="pilot">Aplicar ACT Pilotos</option>
                  </select>
                </div>

                <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`crewcheck-light-card relative rounded-[1.35rem] border-2 border-dashed p-8 text-center transition-all duration-300 ${isDragging ? 'scale-[1.015] border-cyan-300 bg-cyan-300/10' : 'border-white/15 bg-white/[0.04] hover:border-fuchsia-300/60 hover:bg-white/[0.07]'} ${isProcessing ? 'pointer-events-none opacity-70' : ''}`}>
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-4 py-6"><div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-300 border-t-transparent" /><div><p className="text-lg font-bold">Interpretando {fileName || 'PDF'}...</p><p className="mt-1 text-sm text-slate-300">Lendo cabeçalho, trechos, jornadas, folgas e totais.</p></div></div>
                  ) : (
                    <div className="flex flex-col items-center gap-5 py-4">
                      <div className="flex h-20 w-20 items-center justify-center rounded-[1.7rem] bg-gradient-to-br from-cyan-300 to-fuchsia-400 text-[#07111F] shadow-xl shadow-cyan-500/25"><Upload className="h-9 w-9" /></div>
                      <div><p className="text-xl font-black">Arraste o CrewRosterReport aqui</p><p className="mt-2 text-sm text-slate-300">ou selecione o PDF original emitido pelo sistema de escala</p></div>
                      <label className="relative inline-flex cursor-pointer items-center justify-center rounded-2xl bg-white px-7 py-3 text-sm font-black text-[#07111F] shadow-lg transition hover:bg-cyan-100 active:scale-[0.99]"><input ref={fileInputRef} type="file" accept="application/pdf,.pdf,application/octet-stream" onChange={onFileInput} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />Escolher PDF no dispositivo</label>
                      <p className="max-w-sm text-xs leading-5 text-slate-400">No iPhone/iPad, prefira Arquivos → No iPhone/iCloud Drive. Se o PDF veio do WhatsApp, salve em Arquivos antes de importar.</p>
                    </div>
                  )}
                </div>

                {error && <div className="mt-4 flex gap-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-left text-red-100"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm leading-6">{error}</p></div>}

                <div className="mt-5 grid gap-3 text-sm text-slate-200/85">
                  <TrustLine icon={CheckCircle2} text="Processamento com parser do servidor e fallback local no app." />
                  <TrustLine icon={CheckCircle2} text="Gera painel, alertas, rotina, PDF, ICS e Agenda automática." />
                  <TrustLine icon={CheckCircle2} text="Salvamento automático sem duplicar histórico." />
                </div>
              </div>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}

function HistoryScreen({ rosters, loading, dbStatus, openingId, onBack, onOpen, onRefresh }: {
  rosters: SavedRosterSummary[];
  loading: boolean;
  dbStatus: DatabaseStatus | null;
  openingId: string | null;
  onBack: () => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const dbOnline = Boolean(dbStatus?.connected || dbStatus?.ok);
  return (
    <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <HeaderBack title="Histórico de escalas" subtitle={dbOnline ? 'Banco online' : 'Histórico local/offline'} onBack={onBack} action={<button onClick={onRefresh} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-cyan-100"><RefreshCw className="mr-2 inline h-4 w-4" />Atualizar</button>} />
        {loading ? <StateCard icon={Loader2} title="Buscando escalas" text="Carregando histórico salvo..." spin /> : rosters.length ? (
          <div className="mt-6 grid gap-3">
            {rosters.map((item) => (
              <button key={item.id} onClick={() => onOpen(item.id)} disabled={openingId === item.id} className="flex w-full items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-left transition hover:bg-white/[0.09] disabled:opacity-60">
                <div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/70">{monthLabel(item.month, item.year)} · {item.base || 'Base'}</p><h3 className="mt-1 text-lg font-black">{item.crewName || 'Tripulante'}</h3><p className="mt-1 text-sm text-slate-400">{item.sourceFileName || 'Escala salva'} · score {item.score ?? '-'}</p></div>
                <div className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#07111f]">{openingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir'}</div>
              </button>
            ))}
          </div>
        ) : <StateCard icon={FolderOpen} title="Nenhuma escala salva" text="Importe uma escala uma vez; ela ficará disponível aqui após o login." />}
      </div>
    </div>
  );
}

function NotesPanel({ onBack }: { onBack: () => void }) {
  const [note, setNote] = useState(() => localStorage.getItem('crewcheck_personal_notes') || '');
  return (
    <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <HeaderBack title="Notas" subtitle="Anotações locais do tripulante" onBack={onBack} />
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: observar pernoite, descanso, voo extra, treinamento, pendência pessoal..." className="min-h-[18rem] w-full rounded-2xl border border-white/10 bg-[#07111f] p-4 text-sm leading-6 text-white outline-none focus:border-cyan-300" />
          <div className="mt-4 flex justify-end"><Button onClick={() => { localStorage.setItem('crewcheck_personal_notes', note); toast.success('Notas salvas neste dispositivo.'); }} className="rounded-2xl bg-cyan-300 text-[#07111f] hover:bg-cyan-200"><StickyNote className="h-4 w-4" /> Salvar notas</Button></div>
        </div>
      </div>
    </div>
  );
}

function SettingsHomePanel({ userLabel, userEmail, profileSettings, avatar, pendingOffline, hasRoster, themeMode, onThemeModeChange, onProfileSettingsChange, onAvatarChange, onBack, onOpenIFlight, onOpenImport, onOpenResultsSettings, onExportPdf, onExportIcs, onSyncPending, onLogout }: {
  userLabel: string;
  userEmail: string;
  profileSettings: LocalProfileSettings;
  avatar: string;
  pendingOffline: number;
  hasRoster: boolean;
  themeMode: CrewThemeMode;
  onThemeModeChange: (mode: CrewThemeMode) => void;
  onProfileSettingsChange: (settings: LocalProfileSettings) => void;
  onAvatarChange: (value: string) => void;
  onBack: () => void;
  onOpenIFlight: () => void;
  onOpenImport: () => void;
  onOpenResultsSettings: () => void;
  onExportPdf: () => void;
  onExportIcs: () => void;
  onSyncPending: () => void;
  onLogout: () => void;
}) {
  const [preview, setPreview] = useState(avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [profileForm, setProfileForm] = useState<LocalProfileSettings>(profileSettings);
  const [language, setLanguage] = useState<CrewLanguage>(() => getSavedLanguage());
  const [googleSettings, setGoogleSettings] = useState<GoogleCalendarSettings>(() => loadGoogleCalendarSettings());
  const [calendars, setCalendars] = useState<GoogleCalendarOption[]>([]);
  const [googleConnected, setGoogleConnected] = useState(() => hasGoogleCalendarToken());
  const [googleBusy, setGoogleBusy] = useState(false);
  const [clientIdOverride, setClientIdOverride] = useState(() => getGoogleClientIdOverride());
  const googleConfigured = isGoogleCalendarConfigured();
  const hasEnvClientId = hasGoogleClientIdFromEnv();
  const isAdmin = false;

  useEffect(() => {
    setPreview(avatar);
  }, [avatar]);

  function persistGoogle(next: GoogleCalendarSettings) {
    const saved = saveGoogleCalendarSettings(next);
    setGoogleSettings(saved);
    toast.success('Configuração do Agenda automática salva.');
  }

  async function handleConnectGoogle() {
    if (!isGoogleCalendarConfigured()) {
      toast.error('Configure o Google Client ID para ativar o Agenda automática.');
      return;
    }
    setGoogleBusy(true);
    try {
      await connectGoogleCalendar('consent select_account');
      setGoogleConnected(true);
      const items = await listGoogleCalendars();
      setCalendars(items);
      const current = loadGoogleCalendarSettings();
      if (!current.selectedCalendarId && items[0]) persistGoogle({ ...current, selectedCalendarId: items[0].id, selectedCalendarName: items[0].summary });
      toast.success('Agenda automática conectado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui conectar ao Agenda automática.');
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleRefreshCalendars() {
    setGoogleBusy(true);
    try {
      const items = await listGoogleCalendars();
      setCalendars(items);
      toast.success('Link de agenda atualizado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui atualizar a agenda automática.');
    } finally {
      setGoogleBusy(false);
    }
  }

  function handleSaveClientId() {
    saveGoogleClientIdOverride(clientIdOverride);
    toast.success('Configuração técnica removida. O modo atual usa link ICS.');
  }

  const calendarOptions = (() => {
    const map = new Map<string, GoogleCalendarOption>();
    map.set(googleSettings.selectedCalendarId || 'primary', { id: googleSettings.selectedCalendarId || 'primary', summary: googleSettings.selectedCalendarName || 'Calendário principal' });
    map.set('primary', { id: 'primary', summary: 'Calendário principal', primary: true, accessRole: 'owner' });
    calendars.forEach((calendar) => map.set(calendar.id, calendar));
    return Array.from(map.values());
  })();

  async function handleAvatarInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) {
      toast.error('Escolha uma imagem válida.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem precisa ter até 5 MB.');
      return;
    }
    setIsSaving(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Imagem inválida.'));
        reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem.'));
        reader.readAsDataURL(file);
      });
      setPreview(dataUrl);
      onAvatarChange(dataUrl);
      toast.success('Foto de perfil atualizada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar a imagem.');
    } finally {
      setIsSaving(false);
    }
  }

  function removeAvatar() {
    setPreview('');
    onAvatarChange('');
    toast.success('Foto removida.');
  }

  function saveProfile() {
    onProfileSettingsChange(profileForm);
  }

  function handleLanguageChange(next: CrewLanguage) {
    setLanguage(saveCrewLanguage(next));
    applyDocumentLanguage();
    toast.success('Idioma salvo neste dispositivo.');
    window.setTimeout(() => window.dispatchEvent(new Event('crewcheck:language-change')), 0);
  }

  const navItems = [
    { id: 'perfil', label: 'Perfil', icon: UserRound },
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'email', label: 'E-mail', icon: Mail },
    { id: 'tema', label: 'Tema', icon: Sun },
    { id: 'idioma', label: 'Idioma', icon: Languages },
  ];

  return (
    <div className="min-h-screen bg-[#08111f] pb-28 text-white crewcheck-settings-screen">
      <div className="pointer-events-none fixed inset-0 opacity-90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(14,165,233,0.18),transparent_28rem),radial-gradient(circle_at_90%_5%,rgba(37,99,235,0.14),transparent_30rem),linear-gradient(180deg,#08111f_0%,#07111f_50%,#020817_100%)]" />
      </div>

      <div className="fixed bottom-4 left-1/2 z-[70] flex w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 items-center justify-between gap-1 rounded-[1.6rem] border border-white/10 bg-slate-950/88 p-1.5 shadow-2xl shadow-black/35 backdrop-blur-2xl sm:top-24 sm:bottom-auto sm:left-auto sm:right-4 sm:w-32 sm:translate-x-0 sm:flex-col sm:items-stretch">
        {navItems.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#${id}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-[1.1rem] px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-100 transition hover:bg-cyan-300/15 sm:flex-none sm:justify-start sm:text-[11px]">
            <Icon className="h-4 w-4" /> <span>{label}</span>
          </a>
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5 py-7">
        <HeaderBack title="Configurações" subtitle="Perfil, agenda, e-mail, tema e idioma" onBack={onBack} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="space-y-5">
            <div id="perfil" className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-white/[0.065] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.7rem] border border-white/10 bg-gradient-to-br from-cyan-300/20 to-blue-500/10">
                    {preview ? <img src={preview} alt="Foto do perfil" className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10 text-cyan-100" />}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/60">perfil</p>
                    <h2 className="mt-1 text-2xl font-black">{profileForm.displayName || userLabel || 'Tripulante'}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-400">Esses dados são opcionais e ficam salvos apenas neste dispositivo.</p>
                  </div>
                </div>
                <img src="/icons/crewcheck-icon.svg" alt="Logo CrewCheck" className="hidden h-16 w-16 rounded-[1.4rem] sm:block" />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#07111f] shadow-lg shadow-cyan-950/25 transition hover:bg-cyan-200 active:scale-[0.99]">
                  <Camera className="h-5 w-5" /> {isSaving ? 'Salvando...' : 'Trocar foto'}
                  <input type="file" accept="image/*,.heic,.heif" onChange={handleAvatarInput} disabled={isSaving} className="sr-only" />
                </label>
                <button onClick={removeAvatar} disabled={!preview} className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40">
                  <Trash2 className="h-5 w-5" /> Remover foto
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <ProfileField label="Nome exibido" value={profileForm.displayName} placeholder="Nome que aparecerá no app" onChange={(value) => setProfileForm({ ...profileForm, displayName: value })} />
                <ProfileField label="Descrição" value={profileForm.company} placeholder="Descrição opcional" onChange={(value) => setProfileForm({ ...profileForm, company: value })} />
                <ProfileField label="Base" value={profileForm.base} placeholder="Base opcional" onChange={(value) => setProfileForm({ ...profileForm, base: value.toUpperCase() })} />
                <ProfileField label="Função" value={profileForm.rank} placeholder="Função opcional" onChange={(value) => setProfileForm({ ...profileForm, rank: value })} />
              </div>
              <div className="mt-4 flex justify-end"><Button onClick={saveProfile} className="rounded-2xl bg-white text-[#07111f] hover:bg-cyan-100"><CheckCircle2 className="h-4 w-4" /> Salvar perfil</Button></div>
            </div>

            <div id="agenda" className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-white/[0.065] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/60">agenda</p>
                  <h3 className="mt-1 text-2xl font-black">Agenda automática</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Assine um link ICS uma única vez no Google Calendar. Depois disso, cada nova escala importada atualiza o mesmo link automaticamente, sem Google Cloud ou OAuth.</p>
                </div>
                <Badge className={`rounded-full border-0 ${googleConnected ? 'bg-emerald-400/15 text-emerald-100' : googleConfigured ? 'bg-amber-400/15 text-amber-100' : 'bg-rose-400/15 text-rose-100'}`}>{googleConnected ? 'Conectado' : googleConfigured ? 'Pronto para conectar' : 'Client ID ausente'}</Badge>
              </div>
              {!googleConfigured && <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50/90">Configure <strong>VITE_GOOGLE_CLIENT_ID</strong> no Render antes do build para ativar a sincronização.</div>}
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                  <h4 className="font-black">Conectar</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Não usa senha, OAuth, Google Cloud nem tela de autorização. O CrewCheck apenas atualiza seu link ICS privado.</p>
                  <Button onClick={handleConnectGoogle} disabled={!googleConfigured || googleBusy} className="mt-4 rounded-xl bg-cyan-300 text-[#07111f] hover:bg-cyan-200"><RefreshCw className={`h-4 w-4 ${googleBusy ? 'animate-spin' : ''}`} /> {googleBusy ? 'Gerando' : 'Gerar link ICS'}</Button>
                  {isAdmin && !hasEnvClientId && <div className="mt-4 rounded-2xl border border-white/10 bg-[#07111f] p-3"><input value={clientIdOverride} onChange={(event) => setClientIdOverride(event.target.value)} placeholder="Client ID Google" className="h-11 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white outline-none focus:border-cyan-300" /><Button type="button" onClick={handleSaveClientId} variant="outline" className="mt-2 rounded-xl border-cyan-300/30 text-cyan-100 hover:bg-cyan-300/10">Limpar campo técnico</Button></div>}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                  <h4 className="font-black">Calendário e modo</h4>
                  <select value={googleSettings.selectedCalendarId} onChange={(event) => { const selected = calendarOptions.find((item) => item.id === event.target.value); persistGoogle({ ...googleSettings, selectedCalendarId: event.target.value, selectedCalendarName: selected?.summary || event.target.value }); }} className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-3 text-sm font-bold text-white outline-none focus:border-cyan-300">
                    {calendarOptions.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? ' · principal' : ''}</option>)}
                  </select>
                  <Button onClick={handleRefreshCalendars} disabled={!googleConfigured || googleBusy} variant="outline" className="mt-3 rounded-xl border-cyan-300/30 text-cyan-100 hover:bg-cyan-300/10"><RefreshCw className={`h-4 w-4 ${googleBusy ? 'animate-spin' : ''}`} /> Atualizar calendários</Button>
                  <select value={googleSettings.exportMode || 'all'} onChange={(event) => persistGoogle({ ...googleSettings, exportMode: event.target.value as GoogleCalendarSyncMode })} className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-3 text-sm font-bold text-white outline-none focus:border-cyan-300">
                    <option value="all">Tudo: voos, atividades, folgas, academia e rotina</option>
                    <option value="flights">Somente voos</option>
                    <option value="gym">Somente academia</option>
                    <option value="routine">Somente rotina</option>
                  </select>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-sm text-slate-200"><input type="checkbox" checked={googleSettings.autoSync} onChange={(event) => persistGoogle({ ...googleSettings, autoSync: event.target.checked })} className="mt-1" /><span><strong>Atualizar ICS automaticamente após importar escala.</strong><br /><span className="text-slate-400">Se o token expirar, reconecte.</span></span></label>
                </div>
              </div>
            </div>

            <div id="email" className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-white/[0.065] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/60">e-mail</p>
              <h3 className="mt-1 text-2xl font-black">Conta do CrewCheck</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">Use e-mail pessoal no CrewCheck. O e-mail corporativo deve ser digitado apenas dentro do portal oficial iFlight.</p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm font-bold text-slate-200"><Mail className="mr-2 inline h-4 w-4 text-cyan-200" /> {userEmail || 'E-mail da conta não disponível'}</div>
            </div>

            <div id="tema" className="scroll-mt-28"><ThemeSettingsCard themeMode={themeMode} onThemeModeChange={onThemeModeChange} /></div>

            <div id="idioma" className="scroll-mt-28 rounded-[2rem] border border-white/10 bg-white/[0.065] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/60">idioma</p>
              <h3 className="mt-1 text-2xl font-black">Idioma do sistema</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">A preferência fica salva neste dispositivo.</p>
              <select value={language} onChange={(event) => handleLanguageChange(event.target.value as CrewLanguage)} className="mt-4 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300">
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="it">Italiano</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-7 lg:self-start">
            <QuickConfigButton icon={Plane} title="iFlight" text="Portal, PDF e importação" onClick={onOpenIFlight} tone="orange" />
            <QuickConfigButton icon={CloudUpload} title="Importar escala" text="PDF CrewRosterReport/AIMS" onClick={onOpenImport} tone="emerald" />
            <QuickConfigButton icon={FileText} title="Exportar PDF" text={hasRoster ? 'Relatório completo da escala atual' : 'Importe uma escala primeiro'} onClick={onExportPdf} tone="cyan" />
            <QuickConfigButton icon={CalendarDays} title="Exportar agenda" text="Arquivo ICS completo" onClick={onExportIcs} tone="blue" />
            <QuickConfigButton icon={Settings} title="Configurações da escala" text="Alertas, rotina e exportações" onClick={onOpenResultsSettings} tone="slate" />
            <QuickConfigButton icon={Database} title="Atualizar ICS offline" text={`${pendingOffline} pendência(s)`} onClick={onSyncPending} tone="violet" />
            <div className="rounded-[1.7rem] border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm leading-6 text-emerald-50/80"><Shield className="mb-3 h-8 w-8 text-emerald-200" /><strong>Privacidade:</strong> perfil, foto e preferências ficam no dispositivo. Senha, MFA e sessão iFlight não são salvos.</div>
            <button onClick={onLogout} className="w-full rounded-[1.4rem] border border-white/10 bg-white/10 px-5 py-4 text-sm font-black text-white hover:bg-white/15"><LogOut className="mr-2 inline h-4 w-4" /> Sair</button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ThemeSettingsCard({ themeMode, onThemeModeChange }: { themeMode: CrewThemeMode; onThemeModeChange: (mode: CrewThemeMode) => void }) {
  const options: { value: CrewThemeMode; title: string; text: string; icon: LucideIcon }[] = [
    { value: 'light', title: 'Claro', text: 'Interface branca e limpa', icon: Sun },
    { value: 'dark', title: 'Escuro', text: 'Visual premium noturno', icon: Moon },
    { value: 'system', title: 'Sistema', text: 'Segue Android/navegador', icon: Monitor },
  ];
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/60">aparência</p>
          <h3 className="mt-1 text-2xl font-black">Tema claro e escuro</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Escolha o tema do CrewCheck. A preferência fica salva neste dispositivo e vale para o app, web, dashboard, resultados e configurações.</p>
        </div>
        <Badge className="rounded-full border-0 bg-cyan-300/15 text-cyan-100">{themeMode === 'system' ? 'Automático' : themeMode === 'light' ? 'Claro' : 'Escuro'}</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {options.map(({ value, title, text, icon: Icon }) => {
          const active = themeMode === value;
          return (
            <button key={value} type="button" onClick={() => onThemeModeChange(value)} className={`rounded-[1.35rem] border p-4 text-left transition active:scale-[0.99] ${active ? 'border-cyan-300/60 bg-cyan-300/15 text-cyan-50 shadow-lg shadow-cyan-950/25' : 'border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active ? 'bg-cyan-300 text-[#07111f]' : 'bg-white/10 text-cyan-200'}`}><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="font-black">{title}</p>
                  <p className="mt-0.5 text-xs leading-4 text-slate-400">{text}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfileField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300" />
    </label>
  );
}

function QuickConfigButton({ icon: Icon, title, text, onClick, tone }: { icon: LucideIcon; title: string; text: string; onClick: () => void; tone: 'cyan' | 'blue' | 'slate' | 'orange' | 'emerald' | 'violet' }) {
  const tones: Record<typeof tone, string> = {
    cyan: 'from-cyan-300/20 to-blue-500/10 text-cyan-100',
    blue: 'from-blue-300/20 to-indigo-500/10 text-blue-100',
    slate: 'from-slate-200/15 to-slate-600/10 text-slate-100',
    orange: 'from-orange-300/20 to-amber-500/10 text-orange-100',
    emerald: 'from-emerald-300/20 to-teal-500/10 text-emerald-100',
    violet: 'from-violet-300/20 to-fuchsia-500/10 text-violet-100',
  };
  return (
    <button onClick={onClick} className={`w-full rounded-[1.7rem] border border-white/10 bg-gradient-to-br ${tones[tone]} p-5 text-left shadow-xl shadow-black/20 transition hover:border-cyan-200/30 hover:bg-white/[0.08]`}>
      <Icon className="mb-4 h-8 w-8" />
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
    </button>
  );
}

function MorePanel({ onBack, onNavigate, onLogout, pendingOffline, hasRoster, canAccessC32FAcademy }: { onBack: () => void; onNavigate: (view: string) => void; onLogout: () => void; pendingOffline: number; hasRoster: boolean; canAccessC32FAcademy: boolean }) {
  return (
    <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
      <div className="mx-auto max-w-4xl">
        <HeaderBack title="Mais funções" subtitle="Menu completo do CrewCheck" onBack={onBack} />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <MenuAction icon={CloudUpload} title="Importar nova escala" text="PDF CrewRosterReport/AIMS" onClick={() => onNavigate('import')} />
          <MenuAction icon={History} title="Histórico" text="Abrir escalas salvas" onClick={() => onNavigate('history')} />
          <MenuAction icon={Bell} title="Alertas" text="Irregularidades e avisos" onClick={() => onNavigate('alerts')} />
          {canAccessC32FAcademy && <MenuAction icon={GraduationCap} title="C32F / Check A32F" text="Apostila, revisão rápida e mapas A32F" onClick={() => onNavigate('c32f')} />}
          <MenuAction icon={BarChart3} title="Relatórios" text="Métricas e PDF" onClick={() => onNavigate('reports')} />
          <MenuAction icon={FileText} title="Exportar tudo em PDF" text={hasRoster ? "Relatório completo da escala atual" : "Importe/abra uma escala primeiro"} onClick={() => onNavigate('pdf')} />
          <MenuAction icon={CalendarDays} title="Exportar tudo para calendário" text="ICS completo com lembretes" onClick={() => onNavigate('ics')} />
          <MenuAction icon={CalendarDays} title="Agenda automática" text="Sincronismo automático sem duplicidade" onClick={() => onNavigate('google')} />
          <MenuAction icon={CalendarDays} title="Calendário" text="Visual, ICS e Google" onClick={() => onNavigate('calendar')} />
          <MenuAction icon={Settings} title="Configurações" text="Conta, rotina e Google" onClick={() => onNavigate('settings')} />
          <MenuAction icon={Database} title="Atualizar ICS offline" text={`${pendingOffline} pendência(s)`} onClick={() => onNavigate('sync')} />
          <MenuAction icon={LogOut} title="Sair" text="Encerrar sessão" onClick={onLogout} />
        </div>
        <div className="mt-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">
          Premium · LGPD · Offline-first
        </div>
      </div>
    </div>
  );
}


function C32FStudyPanel({ onBack, onOpenRoster }: { onBack: () => void; onOpenRoster: () => void }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfZoom, setPdfZoom] = useState<'page-width' | 'page-fit' | '100' | '125' | '150'>('page-width');
  const [c32fViewMode, setC32fViewMode] = useState<'reader' | 'pdf'>('reader');

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    async function loadProtectedPdf() {
      try {
        setPdfStatus('loading');
        const token = getToken();
        const response = await fetch('/api/c32f/apostila-pdf', {
          headers: token ? { authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (active) {
          setPdfUrl(objectUrl);
          setPdfStatus('ready');
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        if (active) setPdfStatus('error');
      }
    }

    loadProtectedPdf();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  const modules = [
    { title: 'Revisão relâmpago', tag: 'decorar', text: '2.000 ft: Tripulação a seus postos. 500 ft: Posição de impacto. 11.500 ft: Airbus bright + cintos + luzes de emergência. 14.000 ft: queda automática das máscaras.' },
    { title: 'Primeiros socorros', tag: 'AMPLA/RPPP', text: 'AMPLA: Alergias, Medicações, Passado médico, Líquidos/alimentos, Associação ao evento. RPPP: Respiração, Pulso, Pele, Pupilas.' },
    { title: 'RCP e DEA', tag: 'crítico', text: 'Treine o fluxo de avaliação, acionamento do DEA, segurança da cena e situações em que o atendimento é assumido ou interrompido conforme manual vigente.' },
    { title: 'Combate ao fogo', tag: 'cabine', text: 'Funções: combatente, assistente, comunicador e suporte. Revise porta quente/fria, bin, áreas ocultas, rescaldo e vigilância contínua.' },
    { title: 'Evacuação A32F', tag: 'mapas', text: 'Revise A319, A320, A321 e A321neo. Atenção: A321 clássico usa referência central A4/A5; no A321neo mantém A3 na dianteira direita.' },
    { title: 'Kits e oxigênio', tag: 'equip.', text: 'Diferencie KIM, KPS, KPU e KME. Associe cada kit à finalidade prática e revise máscaras, cilindros e fluxo de despressurização.' },
  ];

  const quickQuestions = [
    'Consigo falar os callouts principais sem olhar?',
    'Sei explicar ATAC: Atendente, Transportador, Assistente e Comunicador?',
    'Sei diferenciar porta quente e porta fria em ocorrência de fogo?',
    'Sei quando bloquear uma saída insegura e redirecionar fluxo?',
    'Sei explicar a diferença operacional entre A321 clássico e A321neo?',
  ];


  const readerTables = [
    {
      title: 'Quadro premium de memorização rápida',
      subtitle: 'Transformado em tabela larga e legível para estudo direto no sistema, sem depender do zoom do PDF.',
      columns: ['Tema', 'O que decorar'],
      rows: [
        ['Callouts', '“Tripulação a seus postos” • “Posição de impacto” • “Tripulação, evacuar” • “Permaneçam sentados”. Treine falando em voz alta, sem ler.'],
        ['Despressurização', 'Airbus: 11.500 ft = cabine em bright, avisos de cintos e luzes de emergência. 14.000 ft = queda automática das máscaras.'],
        ['Combate ao fogo', 'Memorize os papéis: combatente, assistente, comunicador e suporte. Depois revise base do fogo, distância, rescaldo e vigilância.'],
        ['Primeiros socorros', 'AMPLA, RPPP, ATAC e DEA. Use como roteiro mental para avaliação, comunicação e continuidade do atendimento.'],
        ['Kits', 'KIM, KPS, KPU e KME. Diferencie finalidade, abertura e uso prático de cada kit.'],
        ['Evacuação A32F', 'A321 clássico: atenção ao centro A4/A5. A321neo: mantém A3 na dianteira direita. Revise mapas e lógica do OK de cabine.'],
      ],
      notes: [
        'Use este quadro como aquecimento de 5 minutos antes de estudar o PDF original.',
        'Quando errar um tema, volte ao PDF na página correspondente para conferir a fonte completa.',
      ],
    },
    {
      title: 'Despressurização e descida de emergência · marcos críticos',
      subtitle: 'Quadro refeito com linhas maiores para evitar cortes e perda de informação no iPad/desktop.',
      columns: ['Marco / frota', 'Sinal verificado ou ação esperada'],
      rows: [
        ['Airbus · ~11.500 ft', 'Cabine em BRIGHT, avisos de atar cintos ligados e luzes de emergência acesas.'],
        ['Airbus · ~14.000 ft', 'Queda automática das máscaras. Revise também a lógica de comunicação e altitude segura.'],
        ['B777/B787 · ~10.000 ft', 'Acende aviso de atar cintos com respectivo chime.'],
        ['B777/B787 · ~14.000 ft', 'Queda automática das máscaras, cabine em BRIGHT e chimes específicos da frota.'],
        ['Após “Tripulação, altitude segura”', 'Checar cabine, lavatórios e áreas críticas; comunicar situação geral conforme fluxo do manual vigente.'],
      ],
      notes: [
        'Memorização-chave: 11.500 ft, 14.000 ft, 2.000 ft e 500 ft.',
        'Em caso de divergência operacional, prevalecem o manual e comunicações oficiais vigentes.',
      ],
    },
    {
      title: 'Combate ao fogo · papéis da equipe',
      subtitle: 'Resumo organizado para prova oral/check: quem faz o quê e o que não esquecer.',
      columns: ['Função', 'Responsabilidade prática'],
      rows: [
        ['Combatente', 'Atua diretamente sobre o foco; usa extintor adequado; mira na base do fogo; mantém segurança e comunica necessidade de suporte.'],
        ['Assistente', 'Prepara equipamentos, substitui extintor, auxilia PBE, observa evolução e antecipa recursos.'],
        ['Comunicador', 'Mantém cockpit/chefe de equipe informado com localização, tipo de fogo, recursos usados e evolução.'],
        ['Suporte', 'Controla passageiros, isola área, preserva corredor, evita pânico e organiza contingência.'],
        ['Rescaldo e vigilância', 'Mesmo após aparente extinção, manter rescaldo e vigilância contínua para evitar reignição.'],
      ],
      notes: [
        'Regra prática: atacar a base do fogo e manter distância operacional segura conforme manual.',
        'Fogo oculto, bin e PED/bateria exigem atenção reforçada à vigilância pós-extinção.',
      ],
    },
    {
      title: 'Extintores · aplicação e checagem mental',
      subtitle: 'Versão legível dos pontos mais cobrados sobre tipos, uso e cuidados.',
      columns: ['Tipo', 'Uso / característica principal'],
      rows: [
        ['BCF 1301 · lixeira do lavatório', 'Disparo automático na lixeira do lavatório quando a temperatura atinge aproximadamente 77 °C.'],
        ['Halon / BCF 1211', 'Indicado para classes B e C; pode ser usado em classe A com rescaldo posterior.'],
        ['Kidde / Air Total', 'Verificar fixação, manômetro/área verde, lacre e etiqueta; duração média costuma ser curta, então planeje o uso.'],
        ['P3 HAFEX / Halotron BrX', 'Agente limpo substituto do Halon 1211, com mesma lógica prática de combate.'],
        ['Halon MAIP', 'Manter lógica operacional de checagem, identificação e aplicação conforme item específico do manual.'],
      ],
      notes: [
        'A pergunta de prova costuma misturar tipo de fogo, extintor, PBE e rescaldo.',
        'Nunca trate extinção aparente como final do procedimento: monitore e comunique.',
      ],
    },
    {
      title: 'PBE · função, ativação e sinais de atenção',
      subtitle: 'Quadro expandido para leitura mais limpa que o PDF em tela pequena.',
      columns: ['Modelo / ponto', 'Checagem ou ativação resumida'],
      rows: [
        ['Função geral', 'Proteção respiratória contra fumaça, gases e partículas durante combate ao fogo ou ambiente contaminado.'],
        ['Scott', 'Verificar fixação, data de fabricação e indicador de umidade pelo visor; confirmar condição aceitável conforme padrão do manual.'],
        ['Puritan', 'Verificar fixação e integridade do vácuo da embalagem; vestir e acionar/ajustar conforme tiras indicadas.'],
        ['Drager', 'Verificar fixação, embalagem lacrada e data; ativação conforme mecanismo do modelo.'],
        ['Air Liquide', 'Verificar fixação, data e indicador; ativação ocorre durante abertura/vestimenta, conforme modelo.'],
      ],
      notes: [
        'Associe PBE + extintor + comunicação + suporte de cabine.',
        'Se o modelo mudar na aeronave, prevalece a checagem do equipamento instalado.',
      ],
    },
    {
      title: 'Primeiros socorros · AMPLA e RPPP',
      subtitle: 'Roteiro de avaliação em formato de card/tabela para decorar antes do C32F.',
      columns: ['Item', 'Pergunta ou observação prática'],
      rows: [
        ['A · Alergias', 'Perguntar alergias conhecidas, reações prévias e relação com o evento atual.'],
        ['M · Medicações', 'Verificar medicamentos em uso, dose, horário e se houve uso recente.'],
        ['P · Passado médico', 'Investigar histórico relevante e condições conhecidas.'],
        ['L · Líquidos/alimentos', 'Checar última ingestão de líquidos/alimentos e possíveis gatilhos.'],
        ['A · Associação ao evento', 'Relacionar sinais, sintomas, início e fatores desencadeantes.'],
        ['RPPP', 'Respiração, Pulso, Pele e Pupilas: observar padrão, frequência, cor, temperatura, sudorese e alterações.'],
      ],
      notes: [
        'AMPLA é roteiro de entrevista; RPPP é roteiro de observação clínica.',
        'Documente e comunique conforme fluxo operacional vigente.',
      ],
    },
    {
      title: 'Kits médicos e biossegurança',
      subtitle: 'Quadro refeito para diferenciar finalidade prática de cada kit.',
      columns: ['Kit', 'Finalidade resumida'],
      rows: [
        ['KPS · Kit Primeiros Socorros', 'Itens de curativo e apoio inicial; associe a atendimentos simples e suporte básico.'],
        ['KPU · Kit de Precaução Universal', 'Biossegurança: barreira de proteção, limpeza/absorção e proteção da tripulação/passageiros.'],
        ['KIM · Kit Insumos Médicos', 'Pode ser aberto pela tripulação de cabine; contém insumos médicos de apoio conforme manual vigente.'],
        ['KME · Kit Médico de Emergência', 'Recurso de atendimento médico avançado conforme política operacional; revisar condição de abertura/uso e comunicação.'],
      ],
      notes: [
        'Pergunta típica: qual kit usar, quem pode abrir e qual comunicação fazer.',
        'Não confundir kit de biossegurança com kit de atendimento médico.',
      ],
    },
    {
      title: 'Ressuscitação cardiopulmonar · leitura ampliada',
      subtitle: 'Quadro reformatado para leitura mais nítida em tablet, iPad e desktop.',
      columns: ['Paciente', 'Compressões / ventilações'],
      rows: [
        ['Adulto / adolescente', '05 ciclos de 30 compressões x 02 ventilações; compressões com as duas mãos na metade inferior do esterno.'],
        ['Criança', '10 ciclos de 15 compressões x 02 ventilações; geralmente com uma mão (ou duas, conforme o porte físico).'],
        ['Bebê', '10 ciclos de 15 compressões x 01 ventilação; dois dedos no centro do tórax, logo abaixo da linha mamilar.'],
        ['Neonatal', '10 ciclos de 03 compressões x 01 ventilação; dois polegares sobre o esterno, envolvendo o tórax com as mãos.'],
      ],
      notes: [
        'Seguir sempre o procedimento vigente do manual e da RTM-C aplicável.',
        'Se houver diferença entre este quadro e uma publicação oficial posterior, prevalece a publicação oficial.',
      ],
    },
    {
      title: 'Sobrevivência no mar, deserto e gelo · revisão ampliada',
      subtitle: 'Tabela reformulada em linhas mais longas para leitura confortável dentro do CrewCheck.',
      columns: ['Ambiente', 'Ações e cuidados prioritários'],
      rows: [
        ['Mar', 'Manter organização do grupo; utilizar coletes, auxílio à flutuação e slide raft; priorizar sinalização visível; economizar água e energia.'],
        ['Deserto', 'Primeiros socorros, abrigo/sombra, proteção contra calor/sol, planejamento, racionamento de água e sinalização.'],
        ['Gelo / frio intenso', 'Abrigo e isolamento térmico; proteger extremidades; monitorar hipotermia/congelamento; reduzir vento e conservar calor corporal.'],
        ['Selva', 'Aplicar SAFA + D + A: Sinalização, Abrigo, Fogo, Água, Descanso e Alimentação.'],
      ],
      notes: [
        'Mar: sinalização visível + preservação do grupo + controle de água e energia.',
        'Deserto: abrigo/sombra e água são críticos.',
        'Gelo: abrigo, calor corporal e proteção ao vento/congelamento são críticos.',
      ],
    },
  ];

  const readerBlocks = [
    {
      title: 'Plano de revisão em 30 minutos',
      bullets: [
        '5 min · Callouts e vozes de comando.',
        '5 min · Despressurização e oxigênio.',
        '5 min · Combate ao fogo e funções da equipe.',
        '5 min · RCP/DEA, ATAC e situações de interrupção/assunção do atendimento.',
        '5 min · Mapas de evacuação A32F.',
        '5 min · KIM, KPS, KPU, KME, PBE, extintores e ELT.',
      ],
    },
    {
      title: 'Prioridade máxima de memorização',
      bullets: [
        'AMPLA e RPPP.',
        'ATAC e funções de atendimento.',
        '2.000 ft, 500 ft, 11.500 ft e 14.000 ft.',
        'Porta quente / porta fria no lavatório.',
        'Fogo em bin com PED/bateria de lítio.',
        'A321 clássico x A321neo na distribuição de funções.',
      ],
    },
    {
      title: 'Evacuação A32F · pontos de fala',
      bullets: [
        'Treinar lógica de fluxo, bloqueio de saída insegura e redirecionamento.',
        'Revisar “quem encontra quem” no OK de cabine por configuração.',
        'Não decorar apenas mapa: explique a lógica da função e da confirmação.',
        'A321 clássico e A321neo costumam gerar confusão: revise em separado.',
      ],
    },
    {
      title: 'Como usar esta tela premium',
      bullets: [
        'Use “Leitura guiada” como estudo principal no celular/iPad.',
        'Use “PDF original” para conferir paginação e fidelidade visual.',
        'Use “Abrir PDF em nova aba” quando quiser zoom livre do navegador.',
        'Na véspera do C32F, revise apenas os quadros de memorização e durma bem.',
      ],
    },
  ];

  const pdfChapters = [
    { label: 'Capa V6', page: 1 },
    { label: 'Índice visual', page: 2 },
    { label: 'Dashboard de estudo', page: 3 },
    { label: 'Checklist premium', page: 4 },
    { label: 'Parte I · Base', page: 9 },
    { label: 'Parte II · Crítico', page: 27 },
    { label: 'Apêndice V5 · Master', page: 35 },
  ];

  async function downloadProtectedPdf() {
    try {
      const token = getToken();
      const response = await fetch('/api/c32f/apostila-pdf?download=1', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Apostila_C32F_Check_A32F_V6.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      toast.error('Não foi possível baixar a apostila C32F. Faça login novamente e tente de novo.');
    }
  }


  function openPdfInNewTab() {
    if (!pdfUrl) return;
    window.open(`${pdfUrl}#page=${pdfPage}&zoom=${pdfZoom}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="min-h-screen bg-[#08111f] px-5 py-8 pb-32 text-white">
      <div className="mx-auto max-w-6xl">
        <HeaderBack title="C32F / Check A32F" subtitle="Sistema privado de estudo" onBack={onBack} action={<Button onClick={onOpenRoster} className="rounded-2xl bg-cyan-300 text-[#07111f] hover:bg-cyan-200">Ver escala</Button>} />

        <section className="mt-6 overflow-hidden rounded-[2.2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-300/18 via-white/[0.07] to-fuchsia-400/10 p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/70">Academia CrewCheck · privado</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">C32F Premium · Leitura guiada da Apostila V6</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200/90">A apostila foi transformada em quadros legíveis dentro do CrewCheck. Use a leitura guiada para estudar sem cortes e o PDF original para conferência integral.</p>
            </div>
            <div className="rounded-[1.4rem] border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-50/90">
              Acesso liberado somente para bmedeiros1987@gmail.com. Em caso de divergência, prevalecem manuais e comunicações oficiais vigentes.
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[19rem_1fr]">
          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20 xl:sticky xl:top-4 xl:h-fit">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-300 text-[#07111f]"><FileText className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">C32F V6</p>
                <h3 className="font-black">Estudo guiado</h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setC32fViewMode('reader')}
                className={`rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${c32fViewMode === 'reader' ? 'border-cyan-200 bg-cyan-300 text-[#07111f]' : 'border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.09]'}`}
              >
                Leitura guiada
              </button>
              <button
                type="button"
                onClick={() => setC32fViewMode('pdf')}
                className={`rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${c32fViewMode === 'pdf' ? 'border-cyan-200 bg-cyan-300 text-[#07111f]' : 'border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.09]'}`}
              >
                PDF original
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {pdfChapters.map((chapter) => (
                <button
                  key={chapter.label}
                  type="button"
                  onClick={() => { setPdfPage(chapter.page); setC32fViewMode('pdf'); }}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${pdfPage === chapter.page ? 'border-cyan-200 bg-cyan-300 text-[#07111f]' : 'border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.09]'}`}
                >
                  <span className="block text-[10px] uppercase tracking-[0.16em] opacity-70">Página {chapter.page}</span>
                  {chapter.label}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/15 p-3">
              <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100/70">Zoom do PDF</label>
              <select value={pdfZoom} onChange={(e) => setPdfZoom(e.target.value as any)} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none">
                <option value="page-width">Ajustar à largura</option>
                <option value="page-fit">Ajustar à página</option>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
              </select>
            </div>

            <div className="mt-4 grid gap-2">
              <Button onClick={downloadProtectedPdf} disabled={pdfStatus !== 'ready'} className="w-full rounded-2xl bg-white text-[#07111f] hover:bg-cyan-50">
                <DownloadIcon className="h-4 w-4" /> Baixar apostila
              </Button>
              <Button onClick={openPdfInNewTab} disabled={pdfStatus !== 'ready'} variant="outline" className="w-full rounded-2xl border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.10]">
                <ExternalLink className="h-4 w-4" /> Abrir PDF em nova aba
              </Button>
            </div>
          </aside>

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/20">
            <div className="flex flex-col gap-3 border-b border-white/10 bg-black/15 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/70">{c32fViewMode === 'reader' ? 'Leitura guiada premium' : 'Visualizador integrado'}</p>
                <h3 className="text-lg font-black">{c32fViewMode === 'reader' ? 'Conteúdo reformatado para leitura mais nítida' : `Apostila Premium V6 · Página ${pdfPage}`}</h3>
                <p className="mt-1 text-sm text-slate-300">{c32fViewMode === 'reader' ? 'Quadros críticos reescritos em linhas maiores, com melhor centralização e leitura dentro do CrewCheck.' : 'Se o PDF ficar pequeno no dispositivo, use o zoom ou troque para Leitura guiada.'}</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-200">
                {c32fViewMode === 'reader' ? 'Modo leitura' : pdfStatus === 'ready' ? 'PDF carregado' : pdfStatus === 'loading' ? 'Carregando PDF' : 'Falha ao carregar'}
              </div>
            </div>

            {c32fViewMode === 'reader' ? (
              <div className="max-h-[78vh] overflow-y-auto px-4 py-4 md:px-6 md:py-6">
                <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="grid gap-4">
                    {readerTables.map((table) => (
                      <article key={table.title} className="rounded-[1.7rem] border border-white/10 bg-slate-950/45 p-4 md:p-5">
                        <h4 className="text-lg font-black text-white md:text-xl">{table.title}</h4>
                        <p className="mt-1 text-sm leading-6 text-slate-300">{table.subtitle}</p>
                        <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-300/15 bg-white/[0.03]">
                          <table className="min-w-full text-left text-sm">
                            <thead className="bg-cyan-300 text-[#07111f]">
                              <tr>
                                {table.columns.map((column) => <th key={column} className="px-4 py-3 font-black">{column}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {table.rows.map((row) => (
                                <tr key={row[0]} className="border-t border-white/10 align-top">
                                  <td className="w-[26%] px-4 py-3 font-black text-white">{row[0]}</td>
                                  <td className="px-4 py-3 leading-7 text-slate-200">{row[1]}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100/80">Memorização rápida</p>
                          <ul className="mt-3 grid gap-2 text-sm leading-6 text-amber-50/90">
                            {table.notes.map((note) => <li key={note}>• {note}</li>)}
                          </ul>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="grid gap-4">
                    {readerBlocks.map((block) => (
                      <article key={block.title} className="rounded-[1.7rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/10">
                        <h4 className="text-lg font-black text-white">{block.title}</h4>
                        <div className="mt-4 grid gap-2">
                          {block.bullets.map((bullet) => (
                            <div key={bullet} className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-200">{bullet}</div>
                          ))}
                        </div>
                      </article>
                    ))}
                    <article className="rounded-[1.7rem] border border-emerald-300/15 bg-emerald-300/10 p-5">
                      <h4 className="text-lg font-black text-emerald-50">Sugestão de uso</h4>
                      <ul className="mt-4 grid gap-2 text-sm leading-6 text-emerald-50/90">
                        <li>• Use a <b>Leitura guiada</b> para revisar tabelas críticas de forma mais legível.</li>
                        <li>• Use o <b>PDF original</b> quando quiser conferir a paginação e o conteúdo integral.</li>
                        <li>• Em tablet/iPad, o modo leitura costuma ficar mais claro do que o visualizador nativo do PDF.</li>
                      </ul>
                    </article>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[78vh] min-h-[34rem] bg-slate-950/70 p-3 md:p-5">
                {pdfStatus === 'ready' && pdfUrl ? (
                  <div className="mx-auto h-full w-full max-w-[1100px] overflow-hidden rounded-[1.6rem] bg-white shadow-2xl shadow-black/30 ring-1 ring-white/10">
                    <iframe key={`${pdfUrl}-${pdfPage}-${pdfZoom}`} title="Apostila Premium C32F V6" src={`${pdfUrl}#page=${pdfPage}&zoom=${pdfZoom}`} className="h-full w-full border-0 bg-white" />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-6 text-center">
                    <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[0.06] p-6">
                      <Loader2 className={`mx-auto h-8 w-8 ${pdfStatus === 'loading' ? 'animate-spin text-cyan-200' : 'text-amber-200'}`} />
                      <h3 className="mt-4 text-xl font-black">{pdfStatus === 'loading' ? 'Carregando apostila privada...' : 'Não foi possível abrir o PDF'}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{pdfStatus === 'loading' ? 'O CrewCheck está validando seu login antes de exibir a apostila C32F.' : 'Confirme se você está logado como administrador autorizado e tente atualizar a página.'}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => (
            <article key={item.title} className="crewcheck-light-card rounded-[1.8rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200"><GraduationCap className="h-6 w-6" /></div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">{item.tag}</span>
              </div>
              <h3 className="text-lg font-black">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="crewcheck-light-card rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20">
            <h3 className="text-xl font-black">Checklist de prova/check</h3>
            <div className="mt-4 grid gap-3">
              {quickQuestions.map((question, index) => (
                <div key={question} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-sm font-black text-[#07111f]">{index + 1}</span>
                  <p className="text-sm leading-6 text-slate-200">{question}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="crewcheck-light-card rounded-[2rem] border border-amber-300/20 bg-amber-400/10 p-5 shadow-2xl shadow-black/20">
            <h3 className="text-xl font-black text-amber-50">Quando aparecer C32F na escala</h3>
            <p className="mt-3 text-sm leading-6 text-amber-50/85">O CrewCheck trata C32F como Check de Competência A32F, separado de voo, folga e voo extra. Ele deve aparecer como treinamento/check, entrar no calendário como atividade de solo e servir como gatilho para revisão desta academia.</p>
            <div className="mt-4 rounded-2xl border border-amber-200/20 bg-black/15 p-4 text-sm leading-6 text-amber-50/90">
              Sugestão de rotina: nos 7 dias anteriores, revise um bloco por dia. Na véspera, use apenas revisão rápida e sono.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SimplePanel({ title, description, icon: Icon, actions, onBack }: { title: string; description: string; icon: LucideIcon; actions: { label: string; onClick: () => void }[]; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <HeaderBack title={title} subtitle="CrewCheck Premium" onBack={onBack} />
        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-cyan-300/15 text-cyan-200"><Icon className="h-10 w-10" /></div>
          <h2 className="mt-5 text-2xl font-black">{title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">{description}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{actions.map((action) => <Button key={action.label} onClick={action.onClick} className="rounded-2xl bg-cyan-300 text-[#07111f] hover:bg-cyan-200">{action.label}</Button>)}</div>
        </div>
      </div>
    </div>
  );
}

function HeaderBack({ title, subtitle, onBack, action }: { title: string; subtitle: string; onBack: () => void; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button onClick={onBack} className="flex items-center gap-3 text-left"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-cyan-100"><ArrowLeft className="h-5 w-5" /></div><div><h1 className="text-xl font-black">{title}</h1><p className="text-xs uppercase tracking-[0.22em] text-cyan-100/60">{subtitle}</p></div></button>
      {action}
    </div>
  );
}

function StateCard({ icon: Icon, title, text, spin }: { icon: LucideIcon; title: string; text: string; spin?: boolean }) {
  return <div className="crewcheck-light-card mt-6 rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-center text-slate-300"><Icon className={`mx-auto mb-4 h-8 w-8 text-cyan-200 ${spin ? 'animate-spin' : ''}`} /><h3 className="text-lg font-black text-white">{title}</h3><p className="mt-2 text-sm">{text}</p></div>;
}

function MenuAction({ icon: Icon, title, text, onClick }: { icon: LucideIcon; title: string; text: string; onClick: () => void }) {
  return <button onClick={onClick} className="crewcheck-light-card flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-left transition hover:bg-white/[0.09]"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200"><Icon className="h-6 w-6" /></div><div><h3 className="font-black">{title}</h3><p className="text-sm text-slate-400">{text}</p></div><ChevronRight className="ml-auto h-5 w-5 text-slate-500" /></button>;
}

function monthLabel(month: number | null, year: number | null): string {
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  if (!month || !year) return 'Período salvo';
  return `${names[month - 1] || String(month).padStart(2, '0')}/${year}`;
}

function Kpi({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return <div className="crewcheck-light-card rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl"><Icon className="mb-3 h-5 w-5 text-cyan-200" /><p className="text-xl font-black">{value}</p><p className="mt-1 text-xs leading-4 text-slate-300">{label}</p></div>;
}

function TrustLine({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><span>{text}</span></div>;
}
