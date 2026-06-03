import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BedDouble,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  CloudUpload,
  Copy,
  Download,
  Dumbbell,
  FileText,
  Flame,
  Gauge,
  GraduationCap,
  Home,
  House,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  Moon,
  MoreHorizontal,
  Plane,
  Plus,
  Search,
  Settings,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportReport } from "@/lib/pdfExport";
import { copyToClipboard } from "@/lib/sharing";
import { downloadCalendarFile, generateICalendar, type CalendarExportMode } from "@/lib/calendarExport";
import { getDatabaseStatus, listSavedRosters, getStoredStats, type DatabaseStatus, type SavedRosterSummary, type StoredStatsResponse } from "@/lib/databaseClient";
import { saveRosterOfflineFirst, syncPendingRosters, getPendingOfflineCount } from "@/lib/offlineSync";
import { sendRosterByEmail } from "@/lib/emailClient";
import { getStoredUser, logout } from "@/lib/authClient";
import type { CrewRoster, FlightLeg, RosterDay } from "@/lib/pdfParser";
import { normalizeRosterSchedule, getActivityCodes } from "@/lib/rosterNormalizer";
import { eventTextFromRosterCode, findRosterCodes, getRosterCodeDefinition } from "@/lib/rosterCodes";
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
  syncRosterToGoogleCalendar,
  type GoogleCalendarOption,
  type GoogleCalendarSettings,
  type GoogleCalendarSyncMode,
} from "@/lib/googleCalendarSync";
import type { ComplianceResult, DayLoadAnalysis, GymRecommendation, LoadAnalysis } from "@/lib/complianceEngine";
import {
  buildRoutineSuggestions,
  defaultRoutineActivities,
  getActivityDefaultDuration,
  getActivityDefaultIntensity,
  getActivityLabel,
  isPhysicalActivity,
  type RoutineActivityConfig,
  type RoutineActivityType,
  type RoutineIntensity,
  type RoutinePeriod,
  type RoutineSuggestion,
} from "@/lib/routinePlanner";

type ViewKey = "roster" | "irregularities" | "gym" | "fatigue" | "statistics" | "settings" | "manual";

type RosterEvent = {
  id: string;
  day: RosterDay;
  leg?: FlightLeg;
  date: Date;
  dateLabel: string;
  weekday: string;
  dayNumber: string;
  monthLabel: string;
  time: string;
  activity: string;
  subtitle: string;
  code: string;
  typeLabel: string;
  status: string;
};

type RosterDayGroup = {
  id: string;
  date: Date;
  dateLabel: string;
  weekday: string;
  dayNumber: string;
  monthLabel: string;
  time: string;
  events: RosterEvent[];
};

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const WEEKDAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export default function Results() {
  const [, setLocation] = useLocation();
  const [roster, setRoster] = useState<CrewRoster | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [gym, setGym] = useState<GymRecommendation[]>([]);
  const [query, setQuery] = useState("");
  const [dutyType, setDutyType] = useState("Todos");
  const [activeView, setActiveView] = useState<ViewKey>("roster");
  const [selectedAlert, setSelectedAlert] = useState<ComplianceResult["alerts"][number] | null>(null);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [savedRosters, setSavedRosters] = useState<SavedRosterSummary[]>([]);
  const [isSavingDb, setIsSavingDb] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(getPendingOfflineCount());
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [storedStats, setStoredStats] = useState<StoredStatsResponse | null>(null);
  const autoDbSaveStartedRef = useRef(false);

  const switchView = (view: ViewKey) => {
    setSelectedAlert(null);
    setActiveView(view);
  };

  const openAlertDay = (date?: string) => {
    if (date) {
      setQuery(date);
      setDutyType("Todos");
    }
    setSelectedAlert(null);
    setActiveView("roster");
  };

  useEffect(() => {
    const rosterData = sessionStorage.getItem("crewcheck_roster");
    const complianceData = sessionStorage.getItem("crewcheck_compliance");
    const gymData = sessionStorage.getItem("crewcheck_gym");

    if (!rosterData || !complianceData) {
      setLocation("/");
      return;
    }

    try {
      setRoster(normalizeRosterSchedule(JSON.parse(rosterData)));
      setCompliance(JSON.parse(complianceData));
      setGym(gymData ? JSON.parse(gymData) : []);
    } catch {
      setLocation("/");
    }
  }, [setLocation]);

  useEffect(() => {
    let active = true;

    async function loadDatabaseInfo() {
      try {
        const status = await getDatabaseStatus();
        if (!active) return;
        setDbStatus(status);
        if (status.ok) {
          const history = await listSavedRosters(5);
          const stats = await getStoredStats().catch(() => null);
          if (active) {
            setSavedRosters(history);
            if (stats) setStoredStats(stats);
          }
        }
      } catch (error) {
        if (active) setDbStatus({ ok: false, connected: false, message: error instanceof Error ? error.message : 'Banco indisponível' });
      }
    }

    loadDatabaseInfo();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!roster) return;
    const pending = sessionStorage.getItem("crewcheck_auto_sync_pending");
    if (!pending) return;
    const settings = loadGoogleCalendarSettings();
    if (!settings.autoSync) {
      sessionStorage.removeItem("crewcheck_auto_sync_pending");
      return;
    }
    if (!isGoogleCalendarConfigured()) {
      toast.warning("Sincronização Google Calendar configurada como automática, mas falta VITE_GOOGLE_CLIENT_ID.");
      sessionStorage.removeItem("crewcheck_auto_sync_pending");
      return;
    }
    if (!hasGoogleCalendarToken()) {
      toast.info("Google Calendar automático está ativo. Abra Configurações e conecte o Google para sincronizar esta escala.");
      return;
    }
    let cancelled = false;
    syncRosterToGoogleCalendar(roster, settings, buildGoogleSyncExtras(gym, buildFallbackLoadAnalysis(roster)))
      .then((result) => {
        if (cancelled) return;
        sessionStorage.removeItem("crewcheck_auto_sync_pending");
        toast.success(`Google Calendar atualizado: ${result.created} novo(s), ${result.updated} atualizado(s), ${result.deleted} removido(s).`);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Falha ao sincronizar Google Calendar.");
      });
    return () => { cancelled = true; };
  }, [roster]);

  const events = useMemo(() => (roster ? buildRosterEvents(roster) : []), [roster]);
  const firstEventId = undefined;

  const filteredEvents = useMemo(() => {
    const normalizedQuery = normalize(query);
    return events.filter((event) => {
      const matchesType = dutyType === "Todos" || event.typeLabel === dutyType;
      const haystack = normalize(`${event.activity} ${event.subtitle} ${event.code} ${event.dateLabel} ${event.typeLabel}`);
      return matchesType && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [events, query, dutyType]);

  const filteredDayGroups = useMemo(() => buildDailyRosterGroups(filteredEvents), [filteredEvents]);

  const refreshSavedRosters = async () => {
    try {
      const history = await listSavedRosters(5);
      setSavedRosters(history);
      const stats = await getStoredStats().catch(() => null);
      if (stats) setStoredStats(stats);
    } catch {
      // O cartão de banco já exibe o status; não precisa interromper a tela.
    }
  };

  useEffect(() => {
    if (!roster || !compliance) return;
    if (autoDbSaveStartedRef.current) return;
    if (sessionStorage.getItem("crewcheck_auto_db_save_pending") !== "1") return;

    autoDbSaveStartedRef.current = true;
    const rosterToSave = roster;
    const complianceToSave = compliance;
    const gymToSave = gym;
    let cancelled = false;

    async function autoSaveRoster() {
      setIsSavingDb(true);
      try {
        const result = await saveRosterOfflineFirst({
          roster: rosterToSave,
          compliance: complianceToSave,
          gym: gymToSave,
          sourceFileName: sessionStorage.getItem("crewcheck_source_file"),
        });

        if (cancelled) return;
        sessionStorage.removeItem("crewcheck_auto_db_save_pending");
        setPendingOffline(result.pendingCount);

        if (result.savedOnline) {
          setDbStatus({ ok: true, connected: true });
          await refreshSavedRosters();
          toast.success(result.deduplicatedLocal ? "Escala atualizada automaticamente na base, sem duplicidade." : "Escala salva automaticamente na base.");
        } else if (result.deduplicatedLocal) {
          toast.info("Escala já salva anteriormente. Salvamento automático não duplicou o registro.");
        } else {
          toast.warning("Banco indisponível no momento. Escala guardada offline para sincronizar depois.");
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Falha no salvamento automático da escala.");
      } finally {
        if (!cancelled) setIsSavingDb(false);
      }
    }

    void autoSaveRoster();
    return () => { cancelled = true; };
  }, [roster, compliance, gym]);

  if (!roster || !compliance) return null;

  const storedUser = getStoredUser();
  const displayCrewName = resolvedCrewName(roster, storedUser);

  const stats = getStats(roster, compliance, events);
  const status = getComplianceStatus(compliance);
  const uniqueTypes = ["Todos", ...Array.from(new Set(events.map((event) => event.typeLabel)))];
  const StatusIcon = status.icon;
  const loadAnalysis = compliance.loadAnalysis ?? buildFallbackLoadAnalysis(roster);
  const errors = compliance.alerts.filter((alert) => alert.severity === "error");
  const warnings = compliance.alerts.filter((alert) => alert.severity === "warning");

  const handleExportPdf = () => {
    exportReport(roster, compliance, gym);
    toast.success("Relatório PDF gerado.");
  };

  const handleExportCalendar = (mode: CalendarExportMode = "all") => {
    const ical = generateICalendar(roster, gym, {
      mode,
      titleFormat: "route-flight",
      includeReminders: true,
      flightReminderMinutes: [120, 30],
      dutyReminderMinutes: [120, 30],
      gymReminderMinutes: [60],
      routineReminderMinutes: [60],
      routineSuggestions: buildGoogleSyncExtras(gym, loadAnalysis).routineSuggestions,
    });
    const label = mode === "all" ? "completo" : mode === "flights" ? "voos" : mode === "duties" ? "atividades" : mode === "rest" ? "folgas-repousos" : mode === "gym" ? "academia" : "rotina";
    downloadCalendarFile(ical, `crewcheck-${label}-${roster.year}-${String(roster.month).padStart(2, "0")}.ics`);
    toast.success(`Calendário ${label} exportado.`);
  };

    const handleCopy = async () => {
    const ok = await copyToClipboard(roster, compliance);
    toast[ok ? "success" : "error"](ok ? "Resumo copiado." : "Não foi possível copiar.");
  };

  const handleSaveDatabase = async () => {
    setIsSavingDb(true);
    try {
      const result = await saveRosterOfflineFirst({
        roster,
        compliance,
        gym,
        sourceFileName: sessionStorage.getItem("crewcheck_source_file"),
      });
      setPendingOffline(result.pendingCount);

      if (result.savedOnline) {
        toast.success(result.deduplicatedLocal ? "Escala já existia na base; registro atualizado sem duplicidade." : `Escala salva na base. ID: ${result.summary?.id?.slice(0, 8) || "online"}`);
        setDbStatus({ ok: true, connected: true });
        await refreshSavedRosters();
      } else if (result.deduplicatedLocal) {
        toast.info("Esta escala já foi salva/sincronizada. Duplicidade evitada.");
      } else {
        toast.warning("Sem conexão com banco. Escala guardada offline para sincronizar depois.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setIsSavingDb(false);
    }
  };

  const handleSyncOffline = async () => {
    setIsSavingDb(true);
    try {
      const result = await syncPendingRosters();
      setPendingOffline(result.remaining);
      if (result.synced > 0) toast.success(`${result.synced} escala(s) sincronizada(s) sem duplicidade.`);
      if (result.remaining > 0) toast.warning(`${result.remaining} escala(s) continuam pendentes.`);
      if (!result.synced && !result.remaining) toast.info("Nenhuma escala pendente offline.");
      await refreshSavedRosters();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar pendências.");
    } finally {
      setIsSavingDb(false);
    }
  };

  const handleEmailReport = async () => {
    const to = window.prompt("Enviar relatório para qual e-mail?");
    if (!to) return;
    setIsSendingEmail(true);
    try {
      const result = await sendRosterByEmail({ to, roster, compliance, gym });
      toast.success(`E-mail enviado${result.provider ? ` via ${result.provider}` : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envio por e-mail ainda não configurado.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handlePowerOff = async () => {
    try {
      await logout();
    } finally {
      sessionStorage.clear();
      setLocation('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#eef5f8] text-[#06213d]">
      <DesktopSidebar activeView={activeView} onChange={switchView} onNewRoster={() => setLocation("/")} onPowerOff={handlePowerOff} />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#092846] text-white shadow-[0_10px_30px_rgba(7,26,51,0.18)]">
          <div className="flex h-16 items-center justify-between px-4 lg:px-7">
            <div className="flex items-center gap-3">
              <button onClick={() => switchView("roster")} className="rounded-xl p-2 text-white/85 transition hover:bg-white/10" aria-label="Voltar para escala">
                <Menu className="h-5 w-5" />
              </button>
              <button onClick={() => setLocation("/")} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white/85 transition hover:bg-white/10 lg:inline-flex" aria-label="Carregar nova escala">
                <CloudUpload className="h-4 w-4" /> Nova escala
              </button>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-100/60">CrewCheck Premium</p>
              <h1 className="text-sm font-black tracking-[0.18em] md:text-base">{viewTitle(activeView).toUpperCase()}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="relative hidden rounded-xl p-2 text-white/85 transition hover:bg-white/10 sm:inline-flex" aria-label="Notificações">
                <Bell className="h-5 w-5" />
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold">{errors.length + warnings.length}</span>
              </button>
              <div className="hidden items-center gap-3 md:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-black">{initials(displayCrewName)}</div>
                <div className="leading-tight">
                  <p className="text-sm font-bold">{titleCase(displayCrewName)}</p>
                  <p className="text-xs text-cyan-100/70">{roster.rank || "Flight Crew"} · {roster.base}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-white/65" />
              </div>
              <button onClick={handlePowerOff} className="rounded-xl p-2 text-white/85 transition hover:bg-white/10" aria-label="Desligar e sair do sistema">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 md:px-7 lg:py-8">
          <div className="mx-auto max-w-[1540px]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#0b4f7a]/20 pb-3">
              <div className="text-sm font-medium text-sky-500">
                HOME <span className="mx-2 text-[#6d8397]">/</span> <span className="font-black text-[#092846]">{viewTitle(activeView)}</span>
              </div>
              <Badge className="rounded-full border-0 px-3 py-1 text-xs font-bold" style={{ backgroundColor: status.bg, color: status.fg }}>
                <StatusIcon className="h-3.5 w-3.5" /> {status.label}
              </Badge>
            </div>

            <MobileViewTabs activeView={activeView} onChange={switchView} errors={errors.length} />

            <section className="mb-4 overflow-hidden rounded-[1.4rem] border border-white bg-white shadow-[0_18px_55px_rgba(20,54,84,0.08)]">
              <div className="relative flex min-h-[7.2rem] items-center justify-between gap-6 overflow-hidden px-5 py-5 md:px-7">
                <div className="absolute inset-y-0 right-0 hidden w-[42%] bg-[radial-gradient(circle_at_70%_50%,rgba(72,190,255,0.28),transparent_34%),linear-gradient(90deg,transparent,#eaf7ff)] md:block" />
                <div className="relative z-10 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-inner shadow-blue-200/60">
                    {viewHeroIcon(activeView)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight md:text-3xl">{viewTitle(activeView)}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-[#60758a] md:text-base">{viewSubtitle(activeView)}</p>
                  </div>
                </div>
                <div className="relative z-10 hidden h-20 min-w-[18rem] items-end justify-end md:flex">
                  <div className="h-1 w-36 rounded-full bg-[#9ed4ef]" />
                  <div className="-ml-8 h-16 w-40 skew-x-[-24deg] rounded-tl-[3rem] rounded-br-2xl bg-gradient-to-br from-[#1d6f9d] to-[#063153] shadow-lg" />
                </div>
              </div>
            </section>

            <ViewKpis activeView={activeView} stats={stats} load={loadAnalysis} errors={errors.length} warnings={warnings.length} gym={gym} roster={roster} />

            {(activeView === "roster" || activeView === "irregularities") && <LegalProfileBanner profile={compliance.legalProfile} />}
            <PrivacyTrustBanner />

            {activeView === "roster" && (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21.5rem]">
                <section className="space-y-4">
                  <RosterFilters roster={roster} query={query} setQuery={setQuery} dutyType={dutyType} setDutyType={setDutyType} uniqueTypes={uniqueTypes} />
                  <DesktopRosterTable groups={filteredDayGroups} todayId={firstEventId} />
                  <MobileRosterList groups={filteredDayGroups} todayId={firstEventId} roster={roster} />
                </section>
                <RightActions roster={roster} gym={gym} events={events} stats={stats} load={loadAnalysis} dbStatus={dbStatus} savedRosters={savedRosters} isSavingDb={isSavingDb} pendingOffline={pendingOffline} isSendingEmail={isSendingEmail} handleSyncOffline={handleSyncOffline} handleEmailReport={handleEmailReport} handleSaveDatabase={handleSaveDatabase} handleExportCalendar={handleExportCalendar} handleExportPdf={handleExportPdf} handleCopy={handleCopy} setLocation={setLocation} onOpenSettings={() => switchView("settings")} />
              </div>
            )}

            {activeView === "irregularities" && (selectedAlert ? <IrregularityDetailPage alert={selectedAlert} onBack={() => setSelectedAlert(null)} onOpenDay={() => openAlertDay(selectedAlert.date)} /> : <IrregularitiesPanel compliance={compliance} errors={errors} warnings={warnings} onOpenAlert={setSelectedAlert} />)}
            {activeView === "gym" && <RoutinePanel gym={gym} load={loadAnalysis} />}
            {activeView === "fatigue" && <FatiguePanel load={loadAnalysis} compliance={compliance} />}
            {activeView === "statistics" && <StatisticsPanel storedStats={storedStats} savedRosters={savedRosters} />}
            {activeView === "settings" && <SettingsPanel roster={roster} gym={gym} load={loadAnalysis} />}
            {activeView === "manual" && <ManualPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}


function PrivacyTrustBanner() {
  return (
    <section className="mb-4 rounded-[1.1rem] border border-emerald-100 bg-white px-4 py-3 shadow-[0_10px_35px_rgba(20,54,84,0.05)]">
      <div className="flex flex-col gap-2 text-sm text-[#425a72] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 font-bold text-[#092846]"><Lock className="h-4 w-4 text-emerald-600" /> Privacidade e proteção de dados</div>
        <p className="max-w-3xl leading-6">Cadastro mínimo, senha com hash, histórico por usuário e uso dos dados apenas para leitura da escala, conformidade e exportações solicitadas. Sistema orientado às boas práticas da LGPD.</p>
      </div>
    </section>
  );
}

function LegalProfileBanner({ profile }: { profile: ComplianceResult['legalProfile'] }) {
  return (
    <section className="mb-4 rounded-[1.25rem] border border-sky-100 bg-gradient-to-r from-white to-sky-50 p-4 shadow-[0_14px_45px_rgba(20,54,84,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#092846] text-white"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">ACT / base legal</p>
            <h3 className="mt-1 text-lg font-black text-[#092846]">{profile.actName} · {profile.roleLabel} · {profile.functionLabel}</h3>
            <p className="mt-1 text-sm leading-6 text-[#60758a]">{profile.inferenceReason}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#092846] shadow-sm">Confiança: {profile.confidence}</span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#092846] shadow-sm">Vigência: {profile.actValidity}</span>
        </div>
      </div>
    </section>
  );
}

function RosterFilters({ roster, query, setQuery, dutyType, setDutyType, uniqueTypes }: { roster: CrewRoster; query: string; setQuery: (value: string) => void; dutyType: string; setDutyType: (value: string) => void; uniqueTypes: string[] }) {
  const sorted = [...roster.days].sort((a, b) => parseRosterDate(a.date).getTime() - parseRosterDate(b.date).getTime());
  const fromDate = sorted[0]?.date || `01/${String(roster.month).padStart(2, "0")}/${roster.year}`;
  const toDate = sorted[sorted.length - 1]?.date || `${daysInMonth(roster.month, roster.year)}/${String(roster.month).padStart(2, "0")}/${roster.year}`;
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-4 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Month">
          <div className="flex items-center justify-between rounded-xl border border-[#d8e4ee] bg-white px-3 py-2.5 text-sm font-semibold">
            <span>{MONTHS_PT[roster.month - 1]} {roster.year}</span>
            <ChevronDown className="h-4 w-4 text-[#7890a4]" />
          </div>
        </Field>
        <Field label="From Date">
          <div className="rounded-xl border border-[#d8e4ee] bg-white px-3 py-2.5 text-sm">{fromDate}</div>
        </Field>
        <Field label="To Date">
          <div className="rounded-xl border border-[#d8e4ee] bg-white px-3 py-2.5 text-sm">{toDate}</div>
        </Field>
        <Field label="Duty Type">
          <select value={dutyType} onChange={(event) => setDutyType(event.target.value)} className="h-[42px] w-full rounded-xl border border-[#d8e4ee] bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400">
            {uniqueTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Search">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7890a4]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flights, routes, codes..." className="h-[42px] w-full rounded-xl border border-[#d8e4ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
          </div>
        </Field>
      </div>
    </div>
  );
}

function RightActions({ roster, gym, events, stats, load, dbStatus, savedRosters, isSavingDb, pendingOffline, isSendingEmail, handleSyncOffline, handleEmailReport, handleSaveDatabase, handleExportCalendar, handleExportPdf, handleCopy, setLocation, onOpenSettings }: { roster: CrewRoster; gym: GymRecommendation[]; events: RosterEvent[]; stats: ReturnType<typeof getStats>; load: LoadAnalysis; dbStatus: DatabaseStatus | null; savedRosters: SavedRosterSummary[]; isSavingDb: boolean; pendingOffline: number; isSendingEmail: boolean; handleSyncOffline: () => void; handleEmailReport: () => void; handleSaveDatabase: () => void; handleExportCalendar: (mode?: CalendarExportMode) => void; handleExportPdf: () => void; handleCopy: () => void; setLocation: (path: string) => void; onOpenSettings: () => void }) {
  return (
    <aside className="space-y-4">
      <ActionCard title="Nova escala" description="Limpa a análise atual e abre a tela de upload para carregar outro PDF." icon={CloudUpload} button="Carregar PDF" onClick={() => setLocation("/")} />
      <ActionCard title="Import Roster" description="Volte para o upload e importe um novo CrewRosterReport em PDF." icon={CloudUpload} button="Upload File" onClick={() => setLocation("/")} />
      <DatabaseCard dbStatus={dbStatus} savedRosters={savedRosters} isSavingDb={isSavingDb} onSave={handleSaveDatabase} />
      <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <h3 className="text-lg font-black">Offline / APK</h3>
        <p className="mt-1 text-sm text-[#60758a]">Pendências ficam salvas no aparelho e sincronizam depois sem duplicar.</p>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
          <span className="text-sm font-bold text-[#092846]">{pendingOffline} pendente(s)</span>
          <Button onClick={handleSyncOffline} disabled={isSavingDb || pendingOffline === 0} variant="outline" className="rounded-xl border-blue-200 text-blue-600">Sincronizar</Button>
        </div>
      </div>
      <ActionCard title="Enviar por e-mail" description="Envia um resumo premium da análise para qualquer e-mail, se SendGrid ou MailerSend estiver configurado no Render." icon={Mail} button={isSendingEmail ? "Enviando..." : "Enviar"} onClick={handleEmailReport} />
      <GoogleCalendarQuickCard roster={roster} gym={gym} load={load} onOpenSettings={onOpenSettings} />
      <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">Exportar ICS</h3>
            <p className="mt-1 text-sm text-[#60758a]">Arquivo compatível com Google, Outlook e iOS para uso manual.</p>
          </div>
          <Button onClick={() => handleExportCalendar("all")} variant="outline" className="rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"><Download className="h-4 w-4" /> Tudo</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => handleExportCalendar("flights")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><Plane className="h-4 w-4" /> Só voos</Button>
          <Button onClick={() => handleExportCalendar("duties")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><BriefcaseBusiness className="h-4 w-4" /> Atividades</Button>
          <Button onClick={() => handleExportCalendar("rest")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><Moon className="h-4 w-4" /> Folgas</Button>
          <Button onClick={() => handleExportCalendar("gym")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><Dumbbell className="h-4 w-4" /> Academia</Button>
          <Button onClick={() => handleExportCalendar("routine")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><BookOpen className="h-4 w-4" /> Rotina</Button>
        </div>
      </div>
      <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-black">Roster Summary</h3><span className="rounded-lg border border-[#d8e4ee] px-2 py-1 text-xs font-semibold text-[#60758a]">This Month</span></div>
        <div className="space-y-3 text-sm">
          <SummaryLine icon={CalendarDays} label="Total Events" value={events.length} color="#2f80ed" />
          <SummaryLine icon={Plane} label="Flight Segments" value={stats.flightSegments} color="#2f80ed" />
          <SummaryLine icon={GraduationCap} label="Training Sessions" value={stats.trainingSessions} color="#7c3aed" />
          <SummaryLine icon={BriefcaseBusiness} label="Meetings" value={stats.meetings} color="#0f8d96" />
          <SummaryLine icon={AlertTriangle} label="Interrupções" value={stats.interruptions} color="#f97316" />
          <SummaryLine icon={ClipboardList} label="Justificativas/DM" value={stats.absences} color="#64748b" />
          <SummaryLine icon={House} label="Day Off" value={stats.daysOff} color="#19a43a" />
          <SummaryLine icon={Gauge} label="Nota de puxada" value={load.intensityScore} color="#f97316" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={handleExportPdf} className="rounded-xl bg-[#092846] text-white hover:bg-[#0d365e]"><FileText className="h-4 w-4" /> PDF</Button>
        <Button onClick={handleCopy} variant="outline" className="rounded-xl border-[#d8e4ee]"><Copy className="h-4 w-4" /> Copiar</Button>
      </div>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">A análise é automática e depende da leitura correta do PDF. Para decisão trabalhista/oficial, confira escala publicada, ACT aplicável, CCT, manual do operador, GRF/SGRF e setor responsável.</p>
    </aside>
  );
}


function GoogleCalendarQuickCard({ roster, gym, load, onOpenSettings }: { roster: CrewRoster; gym: GymRecommendation[]; load: LoadAnalysis; onOpenSettings: () => void }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const settings = loadGoogleCalendarSettings();
  const configured = isGoogleCalendarConfigured();

  async function handleSyncNow() {
    if (!configured) {
      toast.error("Configure VITE_GOOGLE_CLIENT_ID no ambiente do sistema para ativar Google Calendar.");
      onOpenSettings();
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncRosterToGoogleCalendar(roster, settings, buildGoogleSyncExtras(gym, load));
      sessionStorage.removeItem("crewcheck_auto_sync_pending");
      toast.success(`Google Calendar atualizado: ${result.created} novo(s), ${result.updated} atualizado(s), ${result.deleted} removido(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar Google Calendar.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="rounded-[1.25rem] border border-blue-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Google Calendar</h3>
          <p className="mt-1 text-sm text-[#60758a]">Sincroniza e substitui eventos da escala sem duplicar.</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white"><CalendarDays className="h-5 w-5" /></div>
      </div>
      <div className="rounded-2xl bg-white/75 p-3 text-xs leading-5 text-[#425a72]">
        <p><strong>Calendário:</strong> {settings.selectedCalendarName || settings.selectedCalendarId || "Calendário principal"}</p>
        <p><strong>Automático:</strong> {settings.autoSync ? "ativo após upload" : "desativado"}</p>
        <p><strong>Exportação:</strong> {googleSyncModeLabel(settings.exportMode || "all")}</p>
        {!configured && <p className="mt-2 font-bold text-amber-700">Falta configurar VITE_GOOGLE_CLIENT_ID no Render/Vercel.</p>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={handleSyncNow} disabled={isSyncing || !configured} className="rounded-xl bg-blue-600 text-white hover:bg-blue-700">
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} /> {isSyncing ? "Sincronizando" : "Sincronizar"}
        </Button>
        <Button onClick={onOpenSettings} variant="outline" className="rounded-xl border-blue-200 text-blue-700"><Settings className="h-4 w-4" /> Configurar</Button>
      </div>
    </div>
  );
}

function SettingsPanel({ roster, gym, load }: { roster: CrewRoster; gym: GymRecommendation[]; load: LoadAnalysis }) {
  const [settings, setSettings] = useState<GoogleCalendarSettings>(() => loadGoogleCalendarSettings());
  const [calendars, setCalendars] = useState<GoogleCalendarOption[]>([]);
  const [connected, setConnected] = useState(() => hasGoogleCalendarToken());
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [clientIdOverride, setClientIdOverride] = useState(() => getGoogleClientIdOverride());
  const configured = isGoogleCalendarConfigured();
  const hasEnvClientId = hasGoogleClientIdFromEnv();
  const currentUser = getStoredUser();
  const isAdminUser = isGoogleCalendarAdmin(currentUser);

  function persist(next: GoogleCalendarSettings) {
    const saved = saveGoogleCalendarSettings(next);
    setSettings(saved);
  }

  function handleSaveClientId() {
    saveGoogleClientIdOverride(clientIdOverride);
    toast.success(clientIdOverride.trim() ? 'Google Client ID salvo localmente.' : 'Google Client ID local removido.');
  }

  async function handleConnectAndLoad() {
    if (!configured) {
      toast.error("Configure VITE_GOOGLE_CLIENT_ID para ativar a sincronização com Google Calendar.");
      return;
    }
    setIsLoadingCalendars(true);
    try {
      await connectGoogleCalendar("consent");
      setConnected(true);
      const items = await listGoogleCalendars();
      setCalendars(items);
      const selected = items.find((item) => item.id === settings.selectedCalendarId) || items.find((item) => item.primary) || items[0];
      if (selected) persist({ ...settings, selectedCalendarId: selected.id, selectedCalendarName: selected.summary });
      toast.success("Google Calendar conectado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível conectar ao Google Calendar.");
    } finally {
      setIsLoadingCalendars(false);
    }
  }

  async function handleRefreshCalendars() {
    if (!configured) {
      toast.error("Configure VITE_GOOGLE_CLIENT_ID para ativar a sincronização com Google Calendar.");
      return;
    }
    setIsLoadingCalendars(true);
    try {
      const items = await listGoogleCalendars();
      setConnected(true);
      setCalendars(items);
      toast.success("Calendários carregados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os calendários.");
    } finally {
      setIsLoadingCalendars(false);
    }
  }

  async function handleSyncNow() {
    if (!configured) {
      toast.error("Configure VITE_GOOGLE_CLIENT_ID para ativar Google Calendar.");
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncRosterToGoogleCalendar(roster, settings, buildGoogleSyncExtras(gym, load));
      sessionStorage.removeItem("crewcheck_auto_sync_pending");
      toast.success(`Google Calendar atualizado: ${result.created} novo(s), ${result.updated} atualizado(s), ${result.deleted} removido(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar Google Calendar.");
    } finally {
      setIsSyncing(false);
    }
  }

  const options = calendarOptions(calendars, settings);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">configurações</p>
              <h3 className="mt-1 text-2xl font-black">Google Calendar sem duplicidade</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758a]">Escolha o calendário que receberá a escala. O CrewCheck marca cada evento com uma chave privada e, no próximo upload, atualiza ou remove o evento antigo em vez de criar cópias.</p>
            </div>
            <Badge className={`rounded-full border-0 px-3 py-1 ${connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{connected ? "Conectado" : "Pendente"}</Badge>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#d7e4ef] bg-[#f8fbfe] p-4">
              <h4 className="font-black text-[#092846]">1. Conectar conta Google</h4>
              <p className="mt-2 text-sm leading-6 text-[#60758a]">Autorize acesso apenas para listar calendários e criar/atualizar eventos da escala.</p>
              {!configured && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                  {isAdminUser
                    ? <>Falta variável <code>VITE_GOOGLE_CLIENT_ID</code> no ambiente do sistema. Configure no Render antes do build ou cole temporariamente o Client ID abaixo.</>
                    : <>Google Calendar ainda não foi configurado pelo administrador do sistema.</>}
                </p>
              )}
              <Button onClick={handleConnectAndLoad} disabled={!configured || isLoadingCalendars} className="mt-4 rounded-xl bg-[#092846] text-white hover:bg-[#0d365e]">
                <RefreshCw className={`h-4 w-4 ${isLoadingCalendars ? "animate-spin" : ""}`} /> {isLoadingCalendars ? "Conectando" : "Conectar Google"}
              </Button>
              {isAdminUser && !hasEnvClientId && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-3">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-amber-800">
                    <Lock className="h-3.5 w-3.5" /> Somente administrador
                  </div>
                  <label className="block text-xs font-black uppercase tracking-[0.12em] text-amber-700">Client ID Google opcional</label>
                  <input
                    value={clientIdOverride}
                    onChange={(event) => setClientIdOverride(event.target.value)}
                    placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
                    className="mt-2 h-11 w-full rounded-xl border border-[#d7e4ef] px-3 text-xs font-semibold text-[#092846] outline-none focus:border-amber-400"
                  />
                  <p className="mt-2 text-xs leading-5 text-amber-800">Campo técnico oculto para tripulantes. Preferencialmente configure <code>VITE_GOOGLE_CLIENT_ID</code> no Render.</p>
                  <Button type="button" onClick={handleSaveClientId} variant="outline" className="mt-2 rounded-xl border-amber-200 text-amber-700">Salvar Client ID local</Button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#d7e4ef] bg-[#f8fbfe] p-4">
              <h4 className="font-black text-[#092846]">2. Escolher calendário</h4>
              <p className="mt-2 text-sm leading-6 text-[#60758a]">Use um calendário dedicado, por exemplo “CrewCheck Escala”, para facilitar conferência e remoção.</p>
              <select value={settings.selectedCalendarId} onChange={(event) => {
                const selected = options.find((item) => item.id === event.target.value);
                persist({ ...settings, selectedCalendarId: event.target.value, selectedCalendarName: selected?.summary || event.target.value });
              }} className="mt-4 h-12 w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
                {options.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " · principal" : ""}</option>)}
              </select>
              <Button onClick={handleRefreshCalendars} disabled={!configured || isLoadingCalendars} variant="outline" className="mt-3 rounded-xl border-blue-200 text-blue-700"><RefreshCw className={`h-4 w-4 ${isLoadingCalendars ? "animate-spin" : ""}`} /> Atualizar lista</Button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#d7e4ef] bg-[#f8fbfe] p-4">
            <h4 className="font-black text-[#092846]">3. O que sincronizar/exportar</h4>
            <p className="mt-2 text-sm leading-6 text-[#60758a]">Mesmo padrão do gerador ICS: escolha se o Google Calendar receberá tudo, somente voos, academia ou rotina inteligente.</p>
            <select value={settings.exportMode || "all"} onChange={(event) => persist({ ...settings, exportMode: event.target.value as GoogleCalendarSyncMode })} className="mt-4 h-12 w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
              <option value="all">Tudo · escala, voos, atividades, folgas, academia e rotina</option>
              <option value="flights">Voos · somente etapas de voo</option>
              <option value="gym">Academia · recomendações de treino</option>
              <option value="routine">Rotina · treino, estudo, faculdade e compromissos</option>
            </select>
          </div>

          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-[#092846]">
              <input type="checkbox" checked={settings.autoSync} onChange={(event) => persist({ ...settings, autoSync: event.target.checked })} className="mt-1 h-4 w-4 rounded border-blue-300" />
              <span><strong>Sincronizar automaticamente após cada upload de escala.</strong><br /><span className="font-medium text-[#60758a]">Quando uma nova escala for importada, o sistema tenta atualizar o calendário escolhido sem duplicar eventos. Se a sessão Google tiver expirado, ele pedirá reconexão em Configurações.</span></span>
            </label>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Sincronizar agora</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">Atualiza o mês atual no calendário selecionado usando o filtro: <b>{googleSyncModeLabel(settings.exportMode || "all")}</b>. Eventos que não existem mais nesse filtro são removidos para não sobrar duplicidade.</p>
          <Button onClick={handleSyncNow} disabled={!configured || isSyncing} className="mt-4 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700">
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} /> {isSyncing ? "Sincronizando" : "Sincronizar escala"}
          </Button>
        </div>
        <div className="rounded-[1.25rem] border border-emerald-100 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
          <h3 className="font-black">Como evita duplicidade</h3>
          <p className="mt-2">Cada evento recebe uma chave privada com mês, tripulante, data, rota/código e horário. Em novo upload, o CrewCheck procura essa chave, aplica PATCH no evento existente, cria só o que é novo e apaga o que saiu da escala.</p>
        </div>
      </aside>
    </div>
  );
}


function googleSyncModeLabel(mode: GoogleCalendarSyncMode): string {
  if (mode === 'flights') return 'Voos';
  if (mode === 'gym') return 'Academia';
  if (mode === 'routine') return 'Rotina';
  return 'Tudo';
}

function buildGoogleSyncExtras(gym: GymRecommendation[], load: LoadAnalysis) {
  return {
    gymRecommendations: gym,
    routineSuggestions: buildRoutineSuggestions(load.days, loadRoutineActivities()),
  };
}

function calendarOptions(calendars: GoogleCalendarOption[], settings: GoogleCalendarSettings): GoogleCalendarOption[] {
  const map = new Map<string, GoogleCalendarOption>();
  map.set(settings.selectedCalendarId || "primary", { id: settings.selectedCalendarId || "primary", summary: settings.selectedCalendarName || "Calendário principal" });
  map.set("primary", { id: "primary", summary: "Calendário principal", primary: true, accessRole: "owner" });
  for (const calendar of calendars) map.set(calendar.id, calendar);
  return Array.from(map.values());
}

function isGoogleCalendarAdmin(user: ReturnType<typeof getStoredUser>): boolean {
  const role = normalize(user?.role || '');
  const email = normalize(user?.email || '');
  return ['admin', 'administrator', 'master', 'owner', 'suporte', 'support', 'bruno'].includes(role) || email === 'bmedeiros1987@gmail.com';
}

function ManualPanel() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">manual do sistema</p>
          <h3 className="mt-1 text-2xl font-black">Como usar o CrewCheck</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758a]">Carregue o PDF da escala, confira os cartões interpretados, salve o histórico e use a sincronização Google Calendar para manter a agenda atualizada sem eventos repetidos.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <ManualStep title="1. Enviar escala" text="Na tela inicial, toque em Carregar PDF. O CrewCheck lê dados do tripulante, base, função, voos, reservas, folgas, treinamentos e observações." />
            <ManualStep title="2. Conferir leitura" text="Use a aba My Roster para verificar dias, horários e rotas. Programações contínuas são concatenadas para reduzir duplicidade visual." />
            <ManualStep title="3. Irregularidades" text="A aba Irregularidades separa violação confirmada, ponto de atenção e leitura incerta. Sempre confira a escala oficial antes de decisão formal." />
            <ManualStep title="4. Rotina inteligente" text="Cadastre treino, estudo, faculdade e compromissos. O sistema sugere janelas considerando carga, repouso, pernoites e madrugadas." />
            <ManualStep title="5. Google Calendar" text="Vá em Configurações, conecte o Google, escolha o calendário e ative sincronização automática após upload." />
            <ManualStep title="6. Histórico" text="Salve escalas para acompanhar estatísticas e recuperar análises anteriores. O app mantém pendências offline e sincroniza quando possível." />
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Regras de privacidade</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">O CrewCheck usa os dados da escala apenas para análise, histórico e exportações solicitadas. Tokens Google ficam no navegador e podem expirar; reconecte quando necessário.</p>
        </div>
        <div className="rounded-[1.25rem] border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <h3 className="font-black">Aviso operacional</h3>
          <p className="mt-2">A leitura automática ajuda na organização, mas não substitui a publicação oficial da escala, ACT, CCT, RBAC 117 ou validação do setor responsável.</p>
        </div>
      </aside>
    </div>
  );
}

function ManualStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[#d7e4ef] bg-[#f8fbfe] p-4">
      <h4 className="font-black text-[#092846]">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-[#60758a]">{text}</p>
    </div>
  );
}

function IrregularitiesPanel({ compliance, errors, warnings, onOpenAlert }: { compliance: ComplianceResult; errors: ComplianceResult['alerts']; warnings: ComplianceResult['alerts']; onOpenAlert: (alert: ComplianceResult['alerts'][number]) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <ScoreCard title="Conformidade legal" value={`${compliance.score}/100`} icon={ShieldCheck} tone={compliance.score >= 85 ? "#15963a" : compliance.score >= 70 ? "#f97316" : "#dc2626"} description="Nota de conformidade automática." />
          <ScoreCard title="Irregularidades" value={String(errors.length)} icon={AlertTriangle} tone="#dc2626" description="Alertas críticos encontrados." />
          <ScoreCard title="Pontos de atenção" value={String(warnings.length)} icon={Sparkles} tone="#f97316" description="Itens que exigem revisão." />
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-xl font-black">Irregularidades e alertas</h3><p className="mt-1 text-sm text-[#60758a]">Baseado no RBAC 117, Lei do Aeronauta, CLT e ACT selecionada conforme piloto ou comissário.</p></div></div>
          {compliance.alerts.length === 0 ? (
            <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-800"><CheckCircle2 className="mb-2 h-6 w-6" /><b>Nenhuma irregularidade automática encontrada.</b><p className="mt-1 text-sm">Ainda assim, revise ACT/CCT, escalas publicadas e eventuais extensões operacionais.</p></div>
          ) : (
            <div className="space-y-3">
              {compliance.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} onOpen={() => onOpenAlert(alert)} />)}
            </div>
          )}
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-sky-100 bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">ACT aplicada</h3>
          <p className="mt-2 text-sm font-bold text-[#092846]">{compliance.legalProfile.roleLabel} · {compliance.legalProfile.functionLabel}</p>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">{compliance.legalProfile.actName}. {compliance.legalProfile.inferenceReason}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <MiniMetric label="Voo 28d" value={`${compliance.legalProfile.flightLimit28Days}h`} />
            <MiniMetric label="Voo 365d" value={`${compliance.legalProfile.flightLimit365Days}h`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {compliance.legalProfile.sourceFiles.map((source) => <a key={source} href={source} target="_blank" className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700 hover:bg-sky-100">Abrir ACT</a>)}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Bases verificadas</h3>
          <div className="mt-4 space-y-3 text-sm text-[#425a72]">
            <LegalLine title="ACT correta por função" text="Detecta comissário ou piloto pelo código/cargo da escala e permite seleção manual na tela inicial." />
            <LegalLine title="Repouso mínimo" text="12h, 16h ou 24h conforme jornada anterior, com atenção ao +1h do ACT em jornada simples acima de 10h." />
            <LegalLine title="Solo entre etapas" text="Máximo de 180min no período diurno e 120min no período noturno." />
            <LegalLine title="Horas de voo" text="90h/28d e 900h/365d em A32F/Embraer; 100h/28d e 1000h/365d em Wide Body." />
            <LegalLine title="Madrugadas" text="2 consecutivas e 4 em janela móvel de 168h, com reset após 48h livres." />
            <LegalLine title="Sobreaviso/reserva" text="Sobreaviso 3h–12h e até 8 mensais; reserva em local de trabalho 3h–6h." />
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-red-100 bg-red-50 p-5 text-sm leading-6 text-red-900">
          <h3 className="font-black">Importante</h3>
          <p className="mt-2">O sistema agora separa “irregularidade confirmada”, “ponto de atenção” e “leitura incerta”. Se o PDF tiver horário invertido, coluna misturada ou duty inconsistente, o alerta não entra como irregularidade crítica até conferência do dia citado.</p>
        </div>
      </aside>
    </div>
  );
}


function RoutinePanel({ gym, load }: { gym: GymRecommendation[]; load: LoadAnalysis }) {
  const [activities, setActivities] = useState<RoutineActivityConfig[]>(() => loadRoutineActivities());
  const [draft, setDraft] = useState<RoutineActivityConfig>(() => makeDraftRoutineActivity('musculacao'));
  const suggestions = useMemo(() => buildRoutineSuggestions(load.days, activities), [load.days, activities]);
  const physicalSuggestions = suggestions.filter((item) => isPhysicalActivity(item.activityType));
  const cognitiveSuggestions = suggestions.filter((item) => !isPhysicalActivity(item.activityType));
  const highConfidence = suggestions.filter((item) => item.confidence === 'alta').length;
  const bestGymDays = gym.filter((item) => item.priority === 'high' || item.priority === 'medium').length;

  function updateActivities(next: RoutineActivityConfig[]) {
    setActivities(next);
    localStorage.setItem('crewcheck_routine_activities_v1', JSON.stringify(next));
  }

  function handleTypeChange(type: RoutineActivityType) {
    const duration = getActivityDefaultDuration(type);
    setDraft((current) => ({
      ...current,
      type,
      name: getActivityLabel(type),
      durationMinutes: duration,
      intensity: getActivityDefaultIntensity(type),
    }));
  }

  function addActivity() {
    const normalized = {
      ...draft,
      id: `${draft.type}-${Date.now()}`,
      name: draft.name.trim() || getActivityLabel(draft.type),
      durationMinutes: Math.max(15, Math.min(240, Number(draft.durationMinutes) || 60)),
      frequencyPerWeek: Math.max(1, Math.min(7, Number(draft.frequencyPerWeek) || 1)),
    };
    updateActivities([...activities, normalized]);
    setDraft(makeDraftRoutineActivity(draft.type));
  }

  function removeActivity(id: string) {
    updateActivities(activities.filter((item) => item.id !== id));
  }

  function resetDefaults() {
    updateActivities(defaultRoutineActivities());
    setDraft(makeDraftRoutineActivity('musculacao'));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">rotina adaptada à escala</p>
              <h3 className="mt-1 text-2xl font-black">Treino, estudo e compromissos</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758a]">Configure duração, intensidade e tipo de atividade. O CrewCheck cruza isso com folgas, pernoites, madrugadas, repouso antes/depois e carga operacional para sugerir janelas realistas.</p>
            </div>
            <button onClick={resetDefaults} className="rounded-2xl border border-[#d7e4ef] px-4 py-2 text-sm font-black text-[#092846] hover:bg-[#f7fbff]">Restaurar padrão</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ScoreCard title="Atividades" value={String(activities.length)} icon={Activity} tone="#2563eb" description="configuradas" />
            <ScoreCard title="Sugestões" value={String(suggestions.length)} icon={Clock} tone="#15963a" description="no mês" />
            <ScoreCard title="Confiança alta" value={String(highConfidence)} icon={ShieldCheck} tone="#0f766e" description="janelas robustas" />
            <ScoreCard title="Dias bons" value={String(bestGymDays)} icon={Dumbbell} tone="#f97316" description="base antiga de academia" />
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Adicionar atividade</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1.5 text-xs font-bold text-[#61778e] xl:col-span-2">Tipo
              <select value={draft.type} onChange={(e) => handleTypeChange(e.target.value as RoutineActivityType)} className="w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 py-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
                <option value="musculacao">Musculação</option>
                <option value="corrida">Corrida</option>
                <option value="caminhada">Caminhada</option>
                <option value="crossfit">Crossfit</option>
                <option value="estudo">Estudo</option>
                <option value="faculdade">Faculdade</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-bold text-[#61778e] xl:col-span-2">Nome
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 py-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400" placeholder="Ex.: Musculação A" />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-[#61778e]">Frequência/semana
              <select value={draft.frequencyPerWeek} onChange={(e) => setDraft({ ...draft, frequencyPerWeek: Number(e.target.value) })} className="w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 py-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
                {[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}x</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-bold text-[#61778e]">Período
              <select value={draft.preferredPeriod} onChange={(e) => setDraft({ ...draft, preferredPeriod: e.target.value as RoutinePeriod })} className="w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 py-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
                <option value="qualquer">Qualquer</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <p className="mb-2 text-xs font-bold text-[#61778e]">Duração</p>
              <div className="flex flex-wrap gap-2">
                {[45,60,120].map((duration) => <button key={duration} onClick={() => setDraft({ ...draft, durationMinutes: duration })} className={`rounded-full px-4 py-2 text-sm font-black ${draft.durationMinutes === duration ? 'bg-[#092846] text-white' : 'bg-[#eef5fb] text-[#425a72]'}`}>{duration === 60 ? '1h' : duration === 120 ? '2h' : '45min'}</button>)}
                <input type="number" min={15} max={240} value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })} className="w-24 rounded-full border border-[#d7e4ef] px-3 py-2 text-center text-sm font-black" />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-[#61778e]">Intensidade</p>
              <div className="flex flex-wrap gap-2">
                {(['baixa','moderada','alta'] as RoutineIntensity[]).map((intensity) => <button key={intensity} onClick={() => setDraft({ ...draft, intensity })} className={`rounded-full px-4 py-2 text-sm font-black capitalize ${draft.intensity === intensity ? 'bg-blue-600 text-white' : 'bg-[#eef5fb] text-[#425a72]'}`}>{intensity}</button>)}
              </div>
            </div>
            <Button onClick={addActivity} className="h-12 rounded-2xl bg-[#092846] px-6 text-white hover:bg-[#0d365e]"><Plus className="h-4 w-4" /> Adicionar</Button>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Plano sugerido do mês</h3>
          <p className="mt-1 text-sm leading-6 text-[#60758a]">Sugestões não substituem orientação médica, treinador ou planejamento acadêmico. Elas apenas organizam janelas prováveis com base na escala lida.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {suggestions.map((item) => <RoutineCard key={item.id} item={item} />)}
            {!suggestions.length && <p className="rounded-2xl bg-[#f7fbff] p-4 text-sm text-[#60758a]">Configure pelo menos uma atividade para gerar a rotina.</p>}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Atividades configuradas</h3>
          <div className="mt-4 space-y-2">
            {activities.map((activity) => <div key={activity.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f7fbff] p-3">
              <div className="min-w-0"><p className="truncate font-black text-[#092846]">{activity.name}</p><p className="text-xs font-semibold text-[#60758a]">{getActivityLabel(activity.type)} · {activity.durationMinutes}min · {activity.intensity} · {activity.frequencyPerWeek}x/sem</p></div>
              <button onClick={() => removeActivity(activity.id)} className="rounded-xl p-2 text-red-500 hover:bg-red-50" aria-label="Remover atividade"><Trash2 className="h-4 w-4" /></button>
            </div>)}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Resumo por tipo</h3>
          <div className="mt-4 grid gap-2">
            <MiniMetric label="Treinos físicos" value={String(physicalSuggestions.length)} />
            <MiniMetric label="Estudo/faculdade" value={String(cognitiveSuggestions.length)} />
            <MiniMetric label="Alta intensidade" value={String(suggestions.filter((i) => i.intensity === 'alta').length)} />
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <h3 className="font-black">Regra de segurança</h3>
          <p className="mt-2">Crossfit, corrida forte e musculação pesada são reduzidos automaticamente em dias com madrugada, repouso curto, jornada pesada ou apresentação cedo. Estudo e faculdade recebem prioridade em janelas de menor fadiga cognitiva.</p>
        </div>
      </aside>
    </div>
  );
}

function RoutineCard({ item }: { item: RoutineSuggestion }) {
  const colors = item.suitability === 'ideal' ? { bg: '#e9f8ee', fg: '#15963a' } : item.suitability === 'boa' ? { bg: '#eaf2ff', fg: '#2563eb' } : item.suitability === 'moderada' ? { bg: '#fff7ed', fg: '#ea580c' } : { bg: '#fee2e2', fg: '#b91c1c' };
  const Icon = isPhysicalActivity(item.activityType) ? Dumbbell : BookOpen;
  return (
    <div className="rounded-2xl border border-[#e5edf5] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase text-[#60758a]">{item.dayOfWeek}</p><h4 className="text-lg font-black">{item.date}</h4></div>
        <span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: colors.bg, color: colors.fg }}>{item.score}/100</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm font-black text-[#092846]"><Icon className="h-4 w-4" /> {item.activityName}</div>
      <p className="mt-1 text-sm font-bold text-[#425a72]">{item.startTime}–{item.endTime} · {item.durationMinutes}min · intensidade {item.intensity}</p>
      <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">{item.suitability}</span><span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">confiança {item.confidence}</span><span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">{getActivityLabel(item.activityType)}</span></div>
      <p className="mt-2 text-sm leading-6 text-[#60758a]">{item.reason}</p>
      <p className="mt-2 text-xs leading-5 text-amber-700"><b>Cuidado:</b> {item.caution}</p>
    </div>
  );
}

function loadRoutineActivities(): RoutineActivityConfig[] {
  try {
    const raw = localStorage.getItem('crewcheck_routine_activities_v1');
    if (!raw) return defaultRoutineActivities();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : defaultRoutineActivities();
  } catch {
    return defaultRoutineActivities();
  }
}

function makeDraftRoutineActivity(type: RoutineActivityType): RoutineActivityConfig {
  return { id: `draft-${type}`, type, name: getActivityLabel(type), durationMinutes: getActivityDefaultDuration(type), intensity: getActivityDefaultIntensity(type), frequencyPerWeek: 2, preferredPeriod: 'qualquer' };
}

function GymPanel({ gym, load }: { gym: GymRecommendation[]; load: LoadAnalysis }) {
  const best = gym.filter((item) => item.priority !== "low");
  const limited = gym.filter((item) => item.priority === "low");
  const layoverDays = load.days.filter((day) => day.type === "LAYOVER");
  const formalRestDays = load.days.filter((day) => ["DO", "DR", "DOF"].includes(day.type));
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Análise completa para academia</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">A recomendação agora considera a escala inteira: voos, madrugadas, repouso antes/depois, pernoites/inativos, OFF e folgas formais. A ideia é proteger sono e recuperação antes de sugerir treino pesado.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ScoreCard title="Treino viável" value={String(best.length)} icon={CheckCircle2} tone="#15963a" description="Dias bons ou moderados." />
            <ScoreCard title="Pernoites" value={String(layoverDays.length)} icon={BedDouble} tone="#e0a000" description="Avaliados com cautela." />
            <ScoreCard title="Folgas" value={String(formalRestDays.length)} icon={House} tone="#2f80ed" description="Melhores janelas." />
          </div>
        </div>
        <RecommendationBlock title="Melhores janelas para treinar" items={best} empty="Não encontrei dias ideais; priorize descanso e treinos curtos." />
        <RecommendationBlock title="Dias para evitar carga alta" items={limited} empty="Nenhum dia crítico para treino foi identificado." compact />
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Leitura por dia</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {load.days.map((day) => <LoadCard key={`gym-load-${day.date}`} day={day} compact />)}
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Como o sistema escolhe</h3>
          <div className="mt-4 space-y-3 text-sm text-[#425a72]">
            <LegalLine title="Folga formal" text="DO, DR e DOF são os melhores dias para treino completo, desde que a jornada anterior não tenha sido muito pesada." />
            <LegalLine title="OFF" text="Extensão de descanso: bom para treino moderado, mas não trato como folga formal mensal." />
            <LegalLine title="Pernoite/inativo" text="Analisa hotel/localidade e carga anterior; em chegada pesada, sugere mobilidade em vez de musculação forte." />
            <LegalLine title="Voo e madrugada" text="Quanto mais trechos, maior jornada, início cedo, término tarde ou madrugada, menor a prioridade para treino pesado." />
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Regra prática</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">Priorize treino completo em folgas formais. Em pernoite, faça treino curto/moderado. Após madrugada, jornada longa ou repouso justo, prefira alongamento, mobilidade, caminhada leve e sono.</p>
        </div>
      </aside>
    </div>
  );
}


function FatiguePanel({ load, compliance }: { load: LoadAnalysis; compliance: ComplianceResult }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <ScoreCard title="Nota de puxada" value={`${load.intensityScore}/100`} icon={Gauge} tone="#f97316" description={load.grade} />
          <ScoreCard title="Score legal" value={`${compliance.score}/100`} icon={ShieldCheck} tone="#2f80ed" description="Quanto maior, melhor." />
          <ScoreCard title="Repouso médio" value={`${compliance.metrics.averageTurnaround.toFixed(1)}h`} icon={Moon} tone="#7c3aed" description="Entre jornadas calculadas." />
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Dias mais puxados</h3>
          <p className="mt-1 text-sm text-[#60758a]">Ordenados por jornada, voos, trechos, madrugada, início cedo, término tarde e repouso.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {load.hardestDays.map((day) => <LoadCard key={day.date} day={day} />)}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Dias mais leves</h3>
          <p className="mt-1 text-sm text-[#60758a]">Melhores candidatos para academia, compromissos pessoais e recuperação ativa.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {load.easiestDays.map((day) => <LoadCard key={day.date} day={day} compact />)}
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Resumo de fadiga</h3>
          <p className="mt-3 text-sm leading-6 text-[#60758a]">{load.summary}</p>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e6edf4]"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" style={{ width: `${load.intensityScore}%` }} /></div>
          <div className="mt-2 flex justify-between text-xs font-bold text-[#60758a]"><span>leve</span><span>muito puxada</span></div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Sugestões minhas</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[#425a72]">
            <li>• Adicionar configuração de ACT/CCT e tipo de tripulação para reduzir falsos positivos.</li>
            <li>• Criar histórico mensal para comparar se a escala está ficando mais pesada.</li>
            <li>• Incluir botão “contestação/observação” gerando relatório com base legal.</li>
            <li>• Permitir ajuste de preferência de treino: força, cardio, mobilidade ou descanso.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function DesktopSidebar({ activeView, onChange, onNewRoster, onPowerOff }: { activeView: ViewKey; onChange: (view: ViewKey) => void; onNewRoster: () => void; onPowerOff: () => void }) {
  const nav: Array<{ key: ViewKey; label: string; caption: string; icon: LucideIcon }> = [
    { key: "roster", label: "Escala", caption: "agenda completa", icon: CalendarDays },
    { key: "irregularities", label: "Irregularidades", caption: "leis e ACT", icon: ShieldAlert },
    { key: "gym", label: "Rotina", caption: "treino, estudo e vida", icon: Dumbbell },
    { key: "fatigue", label: "Escala puxada", caption: "fadiga e carga", icon: Gauge },
    { key: "statistics", label: "Histórico", caption: "estatísticas salvas", icon: BarChart3 },
    { key: "settings", label: "Configurações", caption: "Google Calendar", icon: Settings },
    { key: "manual", label: "Manual", caption: "ajuda do sistema", icon: BookOpen },
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-72 flex-col bg-[#071f38] text-white shadow-[20px_0_50px_rgba(7,31,56,0.22)] lg:flex">
      <div className="border-b border-white/10 p-5">
        <button onClick={() => onChange("roster")} className="flex w-full items-center gap-3 rounded-2xl bg-white/8 p-3 text-left transition hover:bg-white/12">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-[#071f38]"><Plane className="h-6 w-6" /></div>
          <div>
            <p className="text-base font-black leading-tight">CrewCheck</p>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/65">Premium Roster</p>
          </div>
        </button>
      </div>
      <nav className="flex-1 space-y-2 p-4">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeView;
          return (
            <button key={item.key} onClick={() => onChange(item.key)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-950/20" : "text-cyan-50/78 hover:bg-white/10 hover:text-white"}`}>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${active ? "bg-white/18" : "bg-white/8"}`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="font-black">{item.label}</p>
                <p className="text-xs text-cyan-100/60">{item.caption}</p>
              </div>
            </button>
          );
        })}
      </nav>
      <div className="space-y-3 border-t border-white/10 p-4">
        <button onClick={onNewRoster} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#071f38] transition hover:bg-cyan-50"><CloudUpload className="h-4 w-4" /> Carregar nova escala</button>
        <button onClick={() => onChange("roster")} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-cyan-50/80 transition hover:bg-white/10"><Home className="h-4 w-4" /> Voltar para escala</button>
        <button onClick={onPowerOff} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20"><LogOut className="h-4 w-4" /> Desligar sistema</button>
      </div>
    </aside>
  );
}


function MobileViewTabs({ activeView, onChange, errors }: { activeView: ViewKey; onChange: (view: ViewKey) => void; errors: number }) {
  const tabs: Array<{ key: ViewKey; label: string; icon: LucideIcon; badge?: number }> = [
    { key: "roster", label: "Escala", icon: CalendarDays },
    { key: "irregularities", label: "Irreg.", icon: ShieldAlert, badge: errors },
    { key: "gym", label: "Rotina", icon: Dumbbell },
    { key: "fatigue", label: "Puxada", icon: Gauge },
    { key: "statistics", label: "Hist.", icon: BarChart3 },
    { key: "settings", label: "Config.", icon: Settings },
    { key: "manual", label: "Manual", icon: BookOpen },
  ];
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-7 lg:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.key === activeView;
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} className={`relative rounded-2xl border px-2 py-3 text-xs font-black shadow-sm ${active ? "border-[#092846] bg-[#092846] text-white" : "border-white bg-white text-[#60758a]"}`}>
            <Icon className="mx-auto mb-1 h-5 w-5" />{tab.label}
            {Boolean(tab.badge) && <span className="absolute right-1 top-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${tone}16`, color: tone }}><Icon className="h-7 w-7" /></div>
        <div><p className="text-xs font-bold uppercase tracking-wide text-[#71869b]">{label}</p><p className="mt-1 text-2xl font-black tabular-nums text-[#092846]">{value}</p><p className="text-xs font-medium text-[#71869b]">{hint}</p></div>
      </div>
    </div>
  );
}

function ViewKpis({ activeView, stats, load, errors, warnings, gym, roster }: { activeView: ViewKey; stats: ReturnType<typeof getStats>; load: LoadAnalysis; errors: number; warnings: number; gym: GymRecommendation[]; roster: CrewRoster }) {
  const layovers = roster.days.filter((day) => day.type === "LAYOVER").length;
  const formalDaysOff = roster.days.filter((day) => ["DO", "DR", "DOF"].includes(day.type)).length;
  const bestGym = gym.filter((item) => item.priority === "high" || item.priority === "medium").length;
  const hardDays = load.days.filter((day) => day.fatigueScore >= 70).length;

  const cards: Array<{ icon: LucideIcon; label: string; value: string; hint: string; tone: string }> = activeView === "gym"
    ? [
        { icon: Dumbbell, label: "Dias viáveis", value: String(bestGym), hint: "treino completo/moderado", tone: "#15963a" },
        { icon: House, label: "Folgas formais", value: String(formalDaysOff), hint: "DO / DR / DOF", tone: "#2f80ed" },
        { icon: BedDouble, label: "Pernoites", value: String(layovers), hint: "inativo fora de base", tone: "#e0a000" },
        { icon: Moon, label: "Evitar carga", value: String(gym.filter((item) => item.priority === "low").length), hint: "mobilidade/descanso", tone: "#f97316" },
      ]
    : activeView === "irregularities"
      ? [
          { icon: ShieldCheck, label: "Conformidade", value: `${100 - Math.min(100, errors * 18 + warnings * 6)}/100`, hint: "nota automática", tone: errors ? "#dc2626" : "#15963a" },
          { icon: AlertTriangle, label: "Irregularidades", value: String(errors), hint: "clique para revisar", tone: "#dc2626" },
          { icon: Sparkles, label: "Atenções", value: String(warnings), hint: "dependem de revisão", tone: "#f97316" },
          { icon: CalendarDays, label: "Dias carregados", value: String(roster.days.length), hint: "escala inteira", tone: "#2f80ed" },
        ]
      : activeView === "fatigue"
        ? [
            { icon: Gauge, label: "Nota de puxada", value: `${load.intensityScore}/100`, hint: load.grade, tone: "#f97316" },
            { icon: CheckCircle2, label: "Recuperação", value: `${load.recoveryScore}/100`, hint: "quanto maior melhor", tone: "#15963a" },
            { icon: Flame, label: "Dias pesados", value: String(hardDays), hint: "70/100 ou mais", tone: "#dc2626" },
            { icon: CalendarDays, label: "Dias analisados", value: String(load.days.length), hint: "inclui folgas/pernoites", tone: "#2f80ed" },
          ]
        : activeView === "statistics"
          ? [
              { icon: BarChart3, label: "Histórico", value: "Pessoal", hint: "escalas salvas", tone: "#2f80ed" },
              { icon: Gauge, label: "Comparativo", value: "Geral", hint: "agregado superficial", tone: "#7c3aed" },
              { icon: ShieldCheck, label: "LGPD", value: "Aviso", hint: "uso pessoal", tone: "#15963a" },
              { icon: AlertTriangle, label: "Limite", value: "Não oficial", hint: "não apresentar à empresa", tone: "#f97316" },
            ]
          : [
            { icon: CalendarDays, label: "Eventos", value: String(stats.flightSegments + stats.trainingSessions + stats.meetings + stats.daysOff + stats.reserveDays), hint: "voos e atividades", tone: "#2f80ed" },
            { icon: House, label: "Folgas", value: String(stats.daysOff), hint: "DO / DR / DOF", tone: "#15963a" },
            { icon: BedDouble, label: "Pernoites", value: String(layovers), hint: "dias inativos", tone: "#e0a000" },
            { icon: ShieldAlert, label: "Alertas", value: String(errors + warnings), hint: `${errors} críticos`, tone: errors ? "#dc2626" : "#f97316" },
          ];

  return (
    <section className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => <KpiCard key={`${activeView}-${card.label}`} {...card} />)}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1.5 text-xs font-bold text-[#61778e]"><span>{label}</span>{children}</label>;
}

function DesktopRosterTable({ groups, todayId }: { groups: RosterDayGroup[]; todayId?: string }) {
  const totalEvents = groups.reduce((sum, group) => sum + group.events.length, 0);
  return (
    <div className="hidden overflow-hidden rounded-[1.25rem] border border-white bg-white shadow-[0_14px_45px_rgba(20,54,84,0.07)] lg:block">
      <div className="grid grid-cols-[9.5rem_minmax(24rem,1fr)_11rem_8rem_6rem] border-b border-[#dce6ef] px-5 py-3 text-xs font-black uppercase tracking-wide text-[#173d5f]"><span>Date (UTC)</span><span>Programação do dia</span><span>Flight / Code</span><span>Status</span><span className="text-right">Actions</span></div>
      <div className="divide-y divide-[#e7eef5]">{groups.map((group) => <RosterTableDayRow key={group.id} group={group} isToday={group.events.some((event) => event.id === todayId)} />)}</div>
      <div className="flex items-center justify-between border-t border-[#e7eef5] px-5 py-4 text-sm text-[#60758a]"><span>Exibindo {groups.length} dia(s) e {totalEvents} programação(ões) carregadas da escala.</span><span className="rounded-full bg-[#eef5fb] px-3 py-1 text-xs font-black text-[#092846]">agrupado por dia</span></div>
    </div>
  );
}

function RosterTableDayRow({ group, isToday }: { group: RosterDayGroup; isToday: boolean }) {
  return (
    <div className="grid grid-cols-[9.5rem_minmax(24rem,1fr)_11rem_8rem_6rem] items-stretch px-5 py-3 text-sm transition hover:bg-[#f7fbff]">
      <div className="flex flex-col justify-center font-semibold leading-tight">
        <p className="text-xs font-black uppercase text-[#092846]">{group.weekday} {group.dayNumber} {group.monthLabel}</p>
        <p className="mt-1 text-[#60758a]">{group.time}</p>
        {isToday && <span className="mt-2 w-fit rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-600">Today</span>}
      </div>
      <div className="space-y-2">
        {group.events.map((event) => <RosterTableSubEvent key={event.id} event={event} />)}
      </div>
      <div className="flex flex-col justify-center gap-2 font-bold text-[#173d5f]">
        {group.events.map((event) => <span key={`${event.id}-code`}>{event.code || "—"}</span>)}
      </div>
      <div className="flex flex-col justify-center gap-2">
        {group.events.map((event) => {
          const style = getEventStyle(event);
          return <span key={`${event.id}-status`} className="w-fit rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: style.bg, color: style.solid }}>{event.status}</span>;
        })}
      </div>
      <div className="flex items-center justify-end gap-2"><button className="rounded-lg border border-[#dce6ef] p-2 hover:bg-[#eef5fb]" aria-label="Mais opções"><MoreHorizontal className="h-4 w-4" /></button></div>
    </div>
  );
}

function RosterTableSubEvent({ event }: { event: RosterEvent }) {
  const style = getEventStyle(event);
  const Icon = style.icon;
  return (
    <div className="grid grid-cols-[3rem_7.5rem_minmax(0,1fr)] items-center gap-3 rounded-2xl bg-[#f8fbfd] px-3 py-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm" style={{ backgroundColor: style.solid }}><Icon className="h-5 w-5" /></div>
      <div className="text-sm font-bold text-[#60758a]">{event.time}</div>
      <div className="min-w-0"><p className="truncate font-black" style={{ color: style.solid }}>{event.activity}</p><p className="truncate text-[#60758a]">{event.subtitle}</p></div>
    </div>
  );
}

function MobileRosterList({ groups, todayId, roster }: { groups: RosterDayGroup[]; todayId?: string; roster: CrewRoster }) {
  return (
    <div className="lg:hidden">
      <div className="mb-4 overflow-hidden rounded-[1.6rem] border border-white bg-white shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="bg-[#092846] px-5 py-4 text-center text-white"><p className="text-xs uppercase tracking-[0.24em] text-cyan-100/70">Agenda</p><h2 className="text-xl font-black">{MONTHS_PT[roster.month - 1].toUpperCase()} {roster.year}</h2></div>
      </div>
      <div className="space-y-3">{groups.map((group) => <MobileRosterDayCard key={group.id} group={group} isToday={group.events.some((event) => event.id === todayId)} />)}</div>
    </div>
  );
}

function MobileRosterDayCard({ group, isToday }: { group: RosterDayGroup; isToday: boolean }) {
  return (
    <div className="grid grid-cols-[4.4rem_minmax(0,1fr)] gap-3 rounded-2xl border border-white bg-white p-3 shadow-[0_10px_30px_rgba(20,54,84,0.08)]">
      <div className="border-r border-[#dce6ef] pr-3 text-center leading-tight"><p className="text-xs font-black text-[#60758a]">{group.weekday}</p><p className="text-3xl font-black text-[#092846]">{group.dayNumber}</p><p className="text-xs font-bold text-[#60758a]">{group.monthLabel}</p>{isToday && <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600">Today</span>}</div>
      <div className="min-w-0 space-y-2">
        {group.events.map((event) => <MobileRosterSubEvent key={event.id} event={event} />)}
      </div>
    </div>
  );
}

function MobileRosterSubEvent({ event }: { event: RosterEvent }) {
  const style = getEventStyle(event);
  const Icon = style.icon;
  return (
    <div className="grid grid-cols-[3.2rem_4.6rem_minmax(0,1fr)] items-center gap-2 rounded-2xl bg-[#f8fbfd] p-2">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: style.solid }}><Icon className="h-6 w-6" /></div>
      <div className="text-sm font-bold leading-tight text-[#60758a]">{formatStackedTime(event.time)}</div>
      <div className="min-w-0"><p className="truncate font-black" style={{ color: style.solid }}>{event.activity}</p><p className="truncate text-sm text-[#60758a]">{event.subtitle}</p>{event.code && <p className="mt-1 inline-flex rounded-full bg-[#eef3f8] px-2 py-0.5 text-xs font-bold text-[#60758a]">{event.code}</p>}</div>
    </div>
  );
}


function DatabaseCard({ dbStatus, savedRosters, isSavingDb, onSave }: { dbStatus: DatabaseStatus | null; savedRosters: SavedRosterSummary[]; isSavingDb: boolean; onSave: () => void }) {
  const connected = Boolean(dbStatus?.ok || dbStatus?.connected);
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Banco de dados</h3>
          <p className="mt-1 text-sm text-[#60758a]">Salve a análise na base MySQL/Aiven e mantenha histórico das escalas.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{connected ? "Online" : "Configurar"}</span>
      </div>
      {!connected && <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Configure DATABASE_URL no Render para ativar salvamento. O site continua funcionando localmente sem banco.</p>}
      <Button onClick={onSave} disabled={isSavingDb || !connected} className="w-full rounded-xl bg-[#092846] text-white hover:bg-[#0d365e] disabled:cursor-not-allowed disabled:opacity-60">
        <ShieldCheck className="h-4 w-4" /> {isSavingDb ? "Salvando..." : "Salvar análise"}
      </Button>
      {savedRosters.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#60758a]">Últimas escalas salvas</p>
          {savedRosters.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#e5edf5] bg-[#f8fbfd] p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <b className="truncate text-[#092846]">{item.sourceFileName || item.crewName || "Escala salva"}</b>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-black text-sky-700">{item.score ?? "-"}/100</span>
              </div>
              <p className="mt-1 text-[#60758a]">{String(item.month || '').padStart(2, '0')}/{item.year || ''} · {item.base || '-'} · alertas: {item.criticalAlertsCount}/{item.alertsCount}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ title, description, icon: Icon, button, onClick }: { title: string; description: string; icon: LucideIcon; button: string; onClick: () => void }) {
  return <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-lg font-black">{title}</h3><p className="mt-3 text-sm leading-6 text-[#60758a]">{description}</p></div><Icon className="h-10 w-10 text-blue-100" /></div><Button onClick={onClick} variant="outline" className="w-full rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"><Icon className="h-4 w-4" /> {button}</Button></div>;
}

function MiniApp({ label, text }: { label: string; text: string }) {
  return <div className="rounded-xl border border-[#dce6ef] bg-[#f8fbfd] p-2 text-center"><p className="text-xs font-black text-blue-600">{label}</p><p className="mt-1 text-[11px] font-semibold text-[#60758a]">{text}</p></div>;
}

function SummaryLine({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: string }) {
  return <div className="flex items-center justify-between border-b border-[#edf3f8] pb-2 last:border-0"><span className="flex items-center gap-2 font-semibold text-[#425a72]"><Icon className="h-4 w-4" style={{ color }} />{label}</span><b>{value}</b></div>;
}

function ScoreCard({ title, value, icon: Icon, tone, description }: { title: string; value: string; icon: LucideIcon; tone: string; description: string }) {
  return <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black uppercase tracking-wide text-[#61778e]">{title}</h3><Icon className="h-6 w-6" style={{ color: tone }} /></div><p className="text-3xl font-black" style={{ color: tone }}>{value}</p><p className="mt-1 text-sm text-[#60758a]">{description}</p></div>;
}

function AlertCard({ alert, onOpen }: { alert: ComplianceResult['alerts'][number]; onOpen: () => void }) {
  const isError = alert.severity === "error";
  return (
    <button onClick={onOpen} className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${isError ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isError ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>{isError ? <AlertTriangle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`font-black ${isError ? "text-red-900" : "text-amber-950"}`}>{alert.title}</h4>
            {alert.date && <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">{alert.date}</span>}
            {alert.classification && <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-black">{alert.classification === "confirmada" ? "Confirmada" : alert.classification === "leitura_inconsistente" ? "Leitura incerta" : "Atenção"}</span>}
            {alert.confidence && <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-black">Confiança: {alert.confidence}</span>}
          </div>
          <p className={`mt-1 text-sm leading-6 ${isError ? "text-red-800" : "text-amber-900"}`}>{alert.description}</p>
          {alert.details && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#60758a]">{alert.details}</p>}
          <p className="mt-2 text-xs font-black text-[#092846]">Clique para abrir explicação completa{alert.date ? ' e acessar o dia da escala' : ''}.</p>
        </div>
        <MoreHorizontal className="mt-2 h-5 w-5 text-[#60758a]" />
      </div>
    </button>
  );
}

function IrregularityDetailPage({ alert, onBack, onOpenDay }: { alert: ComplianceResult['alerts'][number]; onBack: () => void; onOpenDay: () => void }) {
  const isError = alert.severity === "error";
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className={`rounded-[1.25rem] border bg-white p-6 shadow-[0_14px_45px_rgba(20,54,84,0.07)] ${isError ? "border-red-100" : "border-amber-100"}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button onClick={onBack} className="rounded-xl border border-[#d8e4ee] px-4 py-2 text-sm font-black text-[#092846] hover:bg-[#f7fbff]">← Voltar às irregularidades</button>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${isError ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{isError ? "Irregularidade" : "Ponto de atenção"}</span>
        </div>
        <h3 className="text-2xl font-black text-[#092846]">{alert.title}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {alert.date && <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">Dia citado: {alert.date}</span>}
          {alert.classification && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-[#092846]">{alert.classification === "confirmada" ? "Irregularidade confirmada" : alert.classification === "leitura_inconsistente" ? "Leitura incerta — revisar PDF" : "Ponto de atenção"}</span>}
          {alert.confidence && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-[#092846]">Confiança: {alert.confidence}</span>}
        </div>
        <div className="mt-5 space-y-4 text-sm leading-7 text-[#425a72]">
          <div className="rounded-2xl bg-[#f7fbff] p-4"><p className="font-black text-[#092846]">O que o sistema encontrou</p><p className="mt-1">{alert.description}</p></div>
          {alert.details && <div className="rounded-2xl bg-[#f7fbff] p-4"><p className="font-black text-[#092846]">Detalhes do cálculo</p><p className="mt-1 whitespace-pre-wrap">{alert.details}</p></div>}
          {alert.evidence && <div className="rounded-2xl bg-[#f7fbff] p-4"><p className="font-black text-[#092846]">Evidência de leitura</p><p className="mt-1 whitespace-pre-wrap">{alert.evidence}</p></div>}
          {alert.legalReference && <div className="rounded-2xl bg-[#f7fbff] p-4"><p className="font-black text-[#092846]">Base usada</p><p className="mt-1">{alert.legalReference}</p></div>}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="font-black">Como interpretar</p><p className="mt-1">O CrewCheck só classifica como irregularidade automática quando consegue calcular o item pelo PDF. Quando depender de ACT/CCT, tipo de tripulação, GRF/SGRF, extensão registrada, manual do operador ou interpretação sindical/empresa, o alerta fica como revisão.</p></div>
        </div>
      </section>
      <aside className="space-y-3">
        {alert.date && <Button onClick={onOpenDay} className="w-full rounded-xl bg-[#092846] text-white hover:bg-[#0d365e]"><CalendarDays className="h-4 w-4" /> Abrir dia na escala</Button>}
        <Button onClick={onBack} variant="outline" className="w-full rounded-xl border-[#d8e4ee]"><ShieldAlert className="h-4 w-4" /> Ver outros alertas</Button>
      </aside>
    </div>
  );
}



function StatisticsPanel({ storedStats, savedRosters }: { storedStats: StoredStatsResponse | null; savedRosters: SavedRosterSummary[] }) {
  if (!storedStats) {
    return (
      <section className="rounded-[1.25rem] border border-white bg-white p-6 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <h3 className="text-2xl font-black text-[#092846]">Histórico e estatísticas</h3>
        <p className="mt-2 text-sm leading-6 text-[#60758a]">Salve suas escalas no banco para gerar estatísticas pessoais e um quadro comparativo geral.</p>
      </section>
    );
  }

  const personal = storedStats.personal.summary;
  const global = storedStats.global.summary;
  return (
    <div className="space-y-4">
      <section className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-[0_14px_45px_rgba(20,54,84,0.05)]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="text-lg font-black">Estatísticas pessoais e comparativo superficial</h3>
            <p className="mt-1 text-sm leading-6">{storedStats.notice}</p>
            <p className="mt-1 text-sm leading-6">Os dados são auxiliares, agregados e destinados apenas à organização pessoal. Não use estes números como prova, reclamação formal ou apresentação à empresa.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <StatsSummaryCard title="Seu histórico" subtitle="Escalas salvas na sua conta" summary={personal} tone="#2f80ed" />
        <StatsSummaryCard title="Quadro comparativo geral" subtitle="Amostra agregada e superficial" summary={global} tone="#7c3aed" />
      </section>

      <section className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-[#092846]">Evolução das suas escalas</h3>
            <p className="mt-1 text-sm text-[#60758a]">Visão mensal simplificada das escalas armazenadas.</p>
          </div>
          <span className="rounded-full bg-[#eef5fb] px-3 py-1 text-xs font-black text-[#092846]">{storedStats.personal.periods.length} período(s)</span>
        </div>
        {storedStats.personal.periods.length === 0 ? (
          <p className="rounded-2xl bg-[#f7fbff] p-4 text-sm text-[#60758a]">Nenhuma escala salva ainda. Após enviar uma escala, o CrewCheck tenta salvar automaticamente; este botão fica como reforço/manual.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[#60758a]"><tr><th className="py-3">Período</th><th>Eventos/voos</th><th>Folgas</th><th>Pernoites</th><th>Academia</th><th>Dias pesados</th><th>Alertas</th><th>Puxada</th></tr></thead>
              <tbody className="divide-y divide-[#e7eef5]">
                {storedStats.personal.periods.map((period) => (
                  <tr key={period.id} className="text-[#092846]"><td className="py-3 font-black">{period.period}</td><td>{period.flightSegments}</td><td>{period.daysOff}</td><td>{period.layovers}</td><td>{period.gymGoodDays}</td><td>{period.heavyDays}</td><td>{period.criticalAlertsCount}/{period.alertsCount}</td><td>{period.intensityScore}/100</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black text-[#092846]">Escalas recentes armazenadas</h3>
          <div className="mt-4 space-y-2">
            {savedRosters.length === 0 ? <p className="text-sm text-[#60758a]">Nenhum registro recente encontrado.</p> : savedRosters.map((item) => <div key={item.id} className="rounded-2xl bg-[#f7fbff] p-3 text-sm"><p className="font-black text-[#092846]">{String(item.month || '').padStart(2, '0')}/{item.year || '----'} · {item.base || 'Base'}</p><p className="mt-1 text-xs text-[#60758a]">Score {item.score ?? '-'} · Puxada {item.intensityScore ?? '-'} · Alertas {item.criticalAlertsCount ?? 0}/{item.alertsCount ?? 0}</p></div>)}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black text-[#092846]">Como ler os números</h3>
          <div className="mt-4 space-y-3 text-sm leading-6 text-[#60758a]">
            <p><b className="text-[#092846]">Seu histórico:</b> usa apenas escalas salvas na sua conta.</p>
            <p><b className="text-[#092846]">Comparativo geral:</b> usa registros agregados da base, sem servir como referência oficial.</p>
            <p><b className="text-[#092846]">LGPD:</b> o uso é limitado à sua organização pessoal e análise funcional da escala.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatsSummaryCard({ title, subtitle, summary, tone }: { title: string; subtitle: string; summary: StoredStatsResponse['personal']['summary']; tone: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-black text-[#092846]">{title}</h3><p className="mt-1 text-sm text-[#60758a]">{subtitle}</p></div><span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: `${tone}16`, color: tone }}>{summary.rostersCount} escala(s)</span></div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatMini label="Puxada média" value={`${summary.avgIntensity}/100`} />
        <StatMini label="Alertas críticos" value={String(summary.avgCriticalAlerts)} />
        <StatMini label="Voos/eventos" value={String(summary.avgFlightSegments)} />
        <StatMini label="Folgas" value={String(summary.avgDaysOff)} />
        <StatMini label="Pernoites" value={String(summary.avgLayovers)} />
        <StatMini label="Academia" value={String(summary.avgGymGoodDays)} />
      </div>
      <p className="mt-4 text-xs font-semibold text-[#71869b]">Período: {summary.firstPeriod || '-'} até {summary.lastPeriod || '-'}</p>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#f7fbff] p-3"><p className="text-xs font-bold uppercase text-[#71869b]">{label}</p><p className="mt-1 text-lg font-black text-[#092846]">{value}</p></div>;
}

function LegalLine({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl bg-[#f7fbff] p-3"><p className="font-black text-[#092846]">{title}</p><p className="mt-1 text-[#60758a]">{text}</p></div>;
}

function RecommendationBlock({ title, items, empty, compact = false }: { title: string; items: GymRecommendation[]; empty: string; compact?: boolean }) {
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <h3 className="text-xl font-black">{title}</h3>
      {items.length === 0 ? <p className="mt-3 rounded-2xl bg-[#f7fbff] p-4 text-sm text-[#60758a]">{empty}</p> : <div className={`mt-4 grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>{items.map((item) => <GymCard key={`${item.date}-${item.priority}`} item={item} />)}</div>}
    </div>
  );
}

function GymCard({ item }: { item: GymRecommendation }) {
  const style = item.priority === "high" ? { bg: "#e9f8ee", fg: "#15963a" } : item.priority === "medium" ? { bg: "#eaf2ff", fg: "#2563eb" } : { bg: "#fff0df", fg: "#e36c0a" };
  const confidence = item.confidence || (item.dayType === 'OTHER' ? 'baixa' : 'alta');
  return (
    <div className="rounded-2xl border border-[#e5edf5] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase text-[#60758a]">{item.dayType}</p><h4 className="text-lg font-black">{item.date}</h4></div>
        <span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: style.bg, color: style.fg }}>{item.recoveryScore}/100</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm font-bold text-[#092846]"><Dumbbell className="h-4 w-4" />{item.suggestedTime} · {item.suggestedDuration}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">{item.planType || 'moderado'}</span>
        <span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">Confiança {confidence}</span>
        <span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">Carga {item.loadScore}/100</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#60758a]">{item.reason}</p>
      {item.focus && <p className="mt-2 text-xs leading-5 text-[#425a72]"><b>Foco:</b> {item.focus}</p>}
      {item.caution && <p className="mt-1 text-xs leading-5 text-amber-700"><b>Cuidado:</b> {item.caution}</p>}
    </div>
  );
}

function LoadCard({ day, compact = false }: { day: DayLoadAnalysis; compact?: boolean }) {
  const color = day.fatigueScore >= 75 ? "#dc2626" : day.fatigueScore >= 55 ? "#f97316" : day.fatigueScore >= 30 ? "#2563eb" : "#15963a";
  return (
    <div className="rounded-2xl border border-[#e5edf5] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[#60758a]">{day.dayOfWeek}</p><h4 className="text-lg font-black">{day.date}</h4><p className="mt-1 text-sm font-semibold text-[#425a72]">{day.label}</p></div><span className="rounded-full px-3 py-1 text-xs font-black text-white" style={{ backgroundColor: color }}>{day.fatigueScore}/100</span></div>
      {!compact && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><MiniMetric label="Jornada" value={`${day.dutyHours}h`} /><MiniMetric label="Voo" value={`${day.flightHours}h`} /><MiniMetric label="Trechos" value={String(day.sectors)} /></div>}
      <div className="mt-3 flex flex-wrap gap-1.5">{day.reasons.slice(0, compact ? 2 : 4).map((reason) => <span key={reason} className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-semibold text-[#60758a]">{reason}</span>)}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#eef5fb] px-2 py-2"><p className="font-bold text-[#60758a]">{label}</p><p className="mt-1 font-black text-[#092846]">{value}</p></div>;
}

function buildDailyRosterGroups(events: RosterEvent[]): RosterDayGroup[] {
  const byDate = new Map<string, RosterEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.dateLabel) || [];
    list.push(event);
    byDate.set(event.dateLabel, list);
  }

  return Array.from(byDate.entries())
    .map(([dateLabel, list]) => {
      const sorted = adjustSequentialDisplayTimes([...list].sort((a, b) => timeToSortValue(extractStartTime(a.time)) - timeToSortValue(extractStartTime(b.time))));
      const first = sorted[0];
      return {
        id: `day-${dateLabel}`,
        date: first.date,
        dateLabel,
        weekday: first.weekday,
        dayNumber: first.dayNumber,
        monthLabel: first.monthLabel,
        time: dayGroupTimeLabel(sorted),
        events: sorted,
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function adjustSequentialDisplayTimes(events: RosterEvent[]): RosterEvent[] {
  let previousEnd: number | null = null;
  return events.map((event) => {
    const parsed = parseDisplayTimeRange(event.time);
    if (!parsed) return event;

    let { start, end } = parsed;
    const normalizedEnd = normalizeDisplayEnd(start, end);
    const isAdjustable = event.typeLabel !== "Flight";

    if (isAdjustable && previousEnd !== null && start <= previousEnd && previousEnd - start <= 20) {
      const newStart = previousEnd + 1;
      const newEnd = normalizedEnd <= newStart ? newStart + Math.max(30, normalizedEnd - start || 60) : normalizedEnd;
      const adjusted = { ...event, time: `${minutesToDisplayTime(newStart)} – ${minutesToDisplayTime(newEnd)}` };
      previousEnd = Math.max(previousEnd, newEnd);
      return adjusted;
    }

    previousEnd = previousEnd === null ? normalizedEnd : Math.max(previousEnd, normalizedEnd);
    return event;
  });
}

function dayGroupTimeLabel(events: RosterEvent[]): string {
  const ranges = events.map((event) => parseDisplayTimeRange(event.time)).filter((range): range is { start: number; end: number } => Boolean(range));
  if (!ranges.length) return "All Day";
  const start = Math.min(...ranges.map((range) => range.start));
  const end = Math.max(...ranges.map((range) => normalizeDisplayEnd(range.start, range.end)));
  return `${minutesToDisplayTime(start)} – ${minutesToDisplayTime(end)}`;
}

function parseDisplayTimeRange(time: string): { start: number; end: number } | null {
  const matches = String(time || '').match(/\b\d{1,2}:\d{2}\b/g);
  if (!matches || matches.length < 2) return null;
  return { start: timeToSortValue(matches[0]), end: timeToSortValue(matches[1]) };
}

function extractStartTime(time: string): string {
  return String(time || '').match(/\b\d{1,2}:\d{2}\b/)?.[0] || '';
}

function normalizeDisplayEnd(start: number, end: number): number {
  return end < start ? end + 1440 : end;
}

function minutesToDisplayTime(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatStackedTime(time: string): ReactNode {
  if (time === 'All Day') return 'All Day';
  const matches = String(time || '').match(/\b\d{1,2}:\d{2}\b/g);
  if (!matches || matches.length < 2) return time;
  return <><span>{matches[0]}</span><br /><span>{matches[1]}</span></>;
}

function buildRosterEvents(roster: CrewRoster): RosterEvent[] {
  return [...roster.days]
    .sort((a, b) => {
      const diff = parseRosterDate(a.date).getTime() - parseRosterDate(b.date).getTime();
      if (diff !== 0) return diff;
      return timeToSortValue(a.dutyReport) - timeToSortValue(b.dutyReport);
    })
    .flatMap((day, dayIndex) => {
      const date = parseRosterDate(day.date);
      const base = buildBaseEvent(day, date);
      const supplemental = supplementalActivitiesForDay(day, base, dayIndex);

      // v10: programações de voo são concatenadas em um único cartão por duty/dia,
      // no estilo CrewLounge: BSB-POA-CNF-POA, NAT-GRU-BSB etc.
      // Isso evita cartões falsos/soltos e facilita a conferência operacional.
      if (day.legs?.length) {
        const first = day.legs[0];
        const last = day.legs[day.legs.length - 1];
        const route = routeChain(day.legs);
        const cities = cityChain(day.legs);
        const codes = flightCodeSummary(day.legs);
        const activityPrefix = flightActivityPrefix(day);
        const time = `${day.dutyReport || first.departureTime} – ${day.dutyDebrief || last.arrivalTime}`;
        const grouped: RosterEvent = {
          ...base,
          id: `${day.date}-flight-group-${dayIndex}-${codes}`,
          leg: first,
          time,
          activity: activityPrefix ? `${activityPrefix} + ${route}` : route,
          subtitle: activityPrefix ? `${cities} · Programação concatenada` : cities,
          code: activityPrefix ? `${activityPrefixCode(day)} · ${codes}` : codes,
          typeLabel: "Flight",
          status: activityPrefix ? "Scheduled" : "Scheduled",
        };
        return [grouped];
      }
      if (supplemental.length > 1 || (supplemental.length === 1 && day.type === "OTHER")) return supplemental;
      return [{ ...base, id: `${day.date}-${day.type}-${dayIndex}-${day.pairingCode || 'duty'}`, ...eventTextForDay(day) }];
    });
}

function flightActivityPrefix(day: RosterDay): string {
  const code = getActivityCodes(day).find((item) => Boolean(getRosterCodeDefinition(item)));
  if (!code) return "";
  const def = getRosterCodeDefinition(code);
  return def ? `${def.title} / ${def.description}` : code;
}

function activityPrefixCode(day: RosterDay): string {
  return getActivityCodes(day).find((item) => Boolean(getRosterCodeDefinition(item))) || "";
}

function routeChain(legs: FlightLeg[]): string {
  if (!legs.length) return "—";
  const points = [legs[0].origin];
  for (const leg of legs) {
    if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  }
  return points.join(" – ");
}

function cityChain(legs: FlightLeg[]): string {
  if (!legs.length) return "";
  const points = [legs[0].origin];
  for (const leg of legs) {
    if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  }
  return points.map((code) => airportCity(code)).join(" – ");
}

function flightCodeSummary(legs: FlightLeg[]): string {
  const codes = Array.from(new Set(legs.map((leg) => leg.flightNumber)));
  return codes.length <= 3 ? codes.join(" · ") : `${codes[0]} +${codes.length - 1}`;
}

function buildBaseEvent(day: RosterDay, date: Date): Omit<RosterEvent, "id" | "activity" | "subtitle" | "code" | "typeLabel" | "status"> {
  return { day, date, dateLabel: day.date, weekday: WEEKDAYS_SHORT[date.getDay()], dayNumber: String(date.getDate()).padStart(2, "0"), monthLabel: MONTHS_SHORT[date.getMonth()], time: day.dutyReport && day.dutyDebrief ? `${day.dutyReport} – ${day.dutyDebrief}` : "All Day" };
}

function supplementalActivitiesForDay(day: RosterDay, base: Omit<RosterEvent, "id" | "activity" | "subtitle" | "code" | "typeLabel" | "status">, dayIndex: number): RosterEvent[] {
  const raw = `${day.pairingCode || ""} ${day.rawText || ""}`.toUpperCase();
  const events: RosterEvent[] = [];
  const seen = new Set<string>();
  const codes = findRosterCodes(raw);

  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);

    // Folgas formais não podem nascer como subprogramação de um dia de treinamento/voo.
    // O OCR/parser pode encontrar DO/DR/DOF dentro de textos descritivos, traduções ou
    // fragmentos do PDF; nesses casos a tela acabava criando uma folga inexistente no
    // mesmo horário de CBF/EMER. Só exibimos DAY_OFF como subevento quando o próprio
    // dia foi classificado como folga.
    const definition = getRosterCodeDefinition(code);
    if (definition?.category === "DAY_OFF" && !isDayOffRosterDay(day)) continue;

    const time = extractActivityWindow(day, code) || base.time;
    const eventText = activityEventText(code);
    if (!eventText) continue;
    events.push({
      ...base,
      id: `${day.date}-${code}-${dayIndex}`,
      time,
      ...eventText,
    });
  }

  return events;
}

function isDayOffRosterDay(day: RosterDay): boolean {
  return ["DO", "DOF", "DR", "OFF"].includes(String(day.type || '').toUpperCase());
}

function activityEventText(code: string): Pick<RosterEvent, "activity" | "subtitle" | "code" | "typeLabel" | "status"> | null {
  return eventTextFromRosterCode(code);
}

function extractActivityWindow(day: RosterDay, code: string): string | null {
  const raw = day.rawText || "";
  const idx = raw.toUpperCase().indexOf(code.toUpperCase());
  if (idx < 0) return null;
  const fragment = raw.slice(idx, idx + 90);
  const times = fragment.match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)?.map((time) => time.replace('(+1)', '')) || [];
  if (times.length >= 2) return `${times[0]} – ${times[1]}`;
  return null;
}

function eventTextForDay(day: RosterDay): Pick<RosterEvent, "activity" | "subtitle" | "code" | "typeLabel" | "status"> {
  if (day.type === "LAYOVER" && /CONTINUACAO_MADRUGADA/i.test(day.rawText || "")) {
    return {
      activity: "Chegada / fim de jornada",
      subtitle: day.hotel ? `Chegada em ${day.hotel} e fim da jornada após voo noturno` : "Continuação da jornada da véspera",
      code: day.pairingCode || "FIM-JORNADA",
      typeLabel: "Inativo",
      status: "Madrugada",
    };
  }
  if (day.type === "LAYOVER") return { activity: "Inativo / Pernoite", subtitle: day.hotel ? `Pernoite em ${day.hotel}` : `Dia em branco após programação`, code: day.pairingCode || "INATIVO", typeLabel: "Inativo", status: "Inativo" };
  if (day.type === "OTHER" && !day.dutyReport && !day.dutyDebrief && !day.legs?.length && !day.pairingCode) return { activity: "Sem programação lida", subtitle: "Dia incluído para completar a escala inteira", code: "—", typeLabel: "Sem programação", status: "Livre" };
  if (day.hotel) return { activity: "Hotel Stay", subtitle: day.hotel || `Pernoite · ${day.base}`, code: day.pairingCode || "—", typeLabel: "Hotel", status: "Hotel" };

  const rosterCode = getRosterCode(day) || day.pairingCode || day.type;
  const mapped = eventTextFromRosterCode(rosterCode);
  if (mapped) return mapped;

  if (["DO", "DOF", "DR"].includes(day.type)) return { activity: "Folga formal", subtitle: "Folga publicada na escala", code: day.type, typeLabel: "Day Off", status: "Day Off" };
  if (day.type === "OFF") return { activity: "OFF", subtitle: "Extensão de repouso; não entra como folga formal mensal", code: day.type, typeLabel: "Day Marker", status: "Rest" };
  if (["HSB", "HSBE"].includes(day.type)) return { activity: `${day.type} / Sobreaviso`, subtitle: "Home Stand By", code: day.pairingCode || day.type, typeLabel: "Standby", status: "Standby" };
  if (["ASB", "RES"].includes(day.type)) return { activity: `${day.type} / Reserva`, subtitle: day.type === "ASB" ? "Airport Stand By" : "Reserva", code: day.pairingCode || day.type, typeLabel: "Reserve", status: "Reserve" };
  return { activity: day.pairingCode || day.type || "Duty", subtitle: `Base ${day.base}`, code: day.pairingCode || "—", typeLabel: "Duty", status: "Duty" };
}

function isPsFlightEvent(event: RosterEvent): boolean {
  const code = String(event.code || event.day.pairingCode || event.day.type || '').toUpperCase();
  return code === 'PS' || Boolean(event.day.legs?.some((leg) => String(leg.workType || '').toUpperCase() === 'PS'));
}

function getEventStyle(event: RosterEvent): { icon: LucideIcon; solid: string; bg: string } {
  const key = event.typeLabel;
  if (key === "Flight" && isPsFlightEvent(event)) return { icon: Plane, solid: "#64748b", bg: "#f1f5f9" };
  if (key === "Flight") return { icon: Plane, solid: "#0b2b4c", bg: "#eaf2ff" };
  if (key === "Hotel" || key === "Inativo") return { icon: BedDouble, solid: "#e0a000", bg: "#fff4cc" };
  if (key === "Folga" || key === "Descanso" || key === "Day Off") return { icon: House, solid: "#15963a", bg: "#e9f8ee" };
  if (key === "Sobreaviso" || key === "Reserva" || key === "Reserve" || key === "Standby") return { icon: UserRound, solid: "#e36c0a", bg: "#fff0df" };
  if (key === "Training" || key === "Ground Duty") return { icon: GraduationCap, solid: "#e11d48", bg: "#fff1f2" };
  if (key === "Simulator") return { icon: GraduationCap, solid: "#7c3aed", bg: "#f0e8ff" };
  if (key === "Transport") return { icon: Plane, solid: "#9a7a42", bg: "#f8f0df" };
  if (key === "Meeting") return { icon: Users, solid: "#0f8d96", bg: "#e7fbfd" };
  if (key === "Sem programação") return { icon: CalendarDays, solid: "#64748b", bg: "#f1f5f9" };
  if (key === "Ausência" || key === "Justificado" || key === "Day Marker") return { icon: ClipboardList, solid: "#f97316", bg: "#fff7ed" };
  if (key === "Interrupção") return { icon: AlertTriangle, solid: "#f97316", bg: "#fff7ed" };
  if (key === "Médico" || key === "Medical") return { icon: ShieldCheck, solid: "#0f8d96", bg: "#e7fbfd" };
  return { icon: BriefcaseBusiness, solid: "#0f8d96", bg: "#e7fbfd" };
}

function getRosterCode(day: RosterDay): string {
  const direct = getRosterCodeDefinition(day.pairingCode)?.code || getRosterCodeDefinition(day.type)?.code;
  if (direct) return direct;
  const source = `${day.pairingCode || ""} ${day.type || ""} ${day.rawText || ""}`.toUpperCase();
  return findRosterCodes(source)[0] || "";
}

function timeToSortValue(time: string | null | undefined): number {
  if (!time) return 9999;
  const [hour, minute] = time.replace('(+1)', '').split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function getStats(roster: CrewRoster, compliance: ComplianceResult, events: RosterEvent[]) {
  const trainingSessions = events.filter((event) => event.typeLabel === "Training").length;
  const meetings = events.filter((event) => event.typeLabel === "Meeting").length;
  const flightSegments = events.filter((event) => event.typeLabel === "Flight").length;
  const absences = events.filter((event) => ["Ausência", "Justificado", "Médico"].includes(event.typeLabel)).length;
  const interruptions = events.filter((event) => event.typeLabel === "Interrupção").length;
  return { absences, interruptions, flightHours: roster.totals?.flightHours ?? compliance.metrics.totalFlightHours, dutyHours: roster.totals?.dutyHours ?? compliance.metrics.totalDutyHours, daysOff: compliance.metrics.daysOff || events.filter((event) => ["Day Off", "Folga"].includes(event.typeLabel)).length, reserveDays: (compliance.metrics.totalStandby + compliance.metrics.reserveCount) || events.filter((event) => ["Reserve", "Sobreaviso", "Reserva"].includes(event.typeLabel)).length, trainingSessions, meetings, flightSegments };
}

function getComplianceStatus(compliance: ComplianceResult) {
  if (compliance.overallStatus === "violation") return { label: "IRREGULARIDADES", bg: "#fee2e2", fg: "#b91c1c", icon: ShieldCheck };
  if (compliance.overallStatus === "warning") return { label: "ATENÇÃO", bg: "#ffedd5", fg: "#c2410c", icon: Sparkles };
  return { label: "CONFORME", bg: "#dcfce7", fg: "#15803d", icon: CheckCircle2 };
}

function viewTitle(view: ViewKey) {
  const titles: Record<ViewKey, string> = { roster: "My Roster", irregularities: "Irregularidades", gym: "Rotina Inteligente", fatigue: "Escala Puxada", statistics: "Histórico", settings: "Configurações", manual: "Manual" };
  return titles[view];
}

function viewSubtitle(view: ViewKey) {
  const subtitles: Record<ViewKey, string> = {
    roster: "Veja a escala interpretada automaticamente a partir do PDF, com filtros, voos, folgas, reservas e treinamentos.",
    irregularities: "Confira irregularidades e pontos de atenção com ACT aplicada por função, RBAC 117, Lei do Aeronauta e regras trabalhistas parametrizadas.",
    gym: "Organize treino, estudo, faculdade e atividades pessoais com duração, intensidade e janelas seguras conforme a escala.",
    fatigue: "Ranking dos dias mais cansativos, nota de puxada da escala e leitura de risco de fadiga.",
    statistics: "Estatísticas pessoais das escalas salvas e comparativo geral superficial, com aviso de uso não oficial.",
    settings: "Escolha o calendário Google, conecte a conta e ative atualização automática após upload da escala.",
    manual: "Guia rápido de uso do CrewCheck, leitura da escala, privacidade e sincronização de calendário.",
  };
  return subtitles[view];
}

function viewHeroIcon(view: ViewKey) {
  const icons: Record<ViewKey, ReactNode> = { roster: <CalendarDays className="h-7 w-7" />, irregularities: <ShieldAlert className="h-7 w-7" />, gym: <Dumbbell className="h-7 w-7" />, fatigue: <Gauge className="h-7 w-7" />, statistics: <BarChart3 className="h-7 w-7" />, settings: <Settings className="h-7 w-7" />, manual: <BookOpen className="h-7 w-7" /> };
  return icons[view];
}

function buildFallbackLoadAnalysis(roster: CrewRoster): LoadAnalysis {
  const days: DayLoadAnalysis[] = roster.days.map((day) => ({ date: day.date, dayOfWeek: day.dayOfWeek, type: day.type, label: day.type, fatigueScore: day.dutyHours ? Math.min(100, Math.round(day.dutyHours * 6)) : 10, loadLabel: "Moderado", dutyHours: day.dutyHours || 0, flightHours: day.flyingHours || 0, sectors: day.legs?.length || 0, restBefore: null, restAfter: null, isNightDuty: false, isEarlyStart: false, isLateFinish: Boolean(day.isNextDay), isDayOff: ["OFF", "DO", "DOF", "DR", "LAYOVER"].includes(day.type), gymScore: 50, reasons: ["análise simplificada"] }));
  return { intensityScore: 50, recoveryScore: 50, grade: "Moderada", summary: "Análise simplificada.", hardestDays: days.slice(0, 5), easiestDays: days.slice(0, 5), days };
}

function resolvedCrewName(roster: CrewRoster, user: ReturnType<typeof getStoredUser>): string {
  const rosterName = String(roster.crewName || '').trim();
  if (rosterName && !/^tripulante$/i.test(rosterName)) return rosterName;
  const userName = String(user?.name || '').trim();
  if (userName && !/^tripulante$/i.test(userName)) return userName;
  const emailPrefix = String(user?.email || '').split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return emailPrefix || 'Tripulante';
}

function parseRosterDate(value: string): Date { if (value.includes("/")) { const [day, month, year] = value.split("/").map(Number); return new Date(year, month - 1, day); } return new Date(value); }
function daysInMonth(month: number, year: number) { return String(new Date(year, month, 0).getDate()).padStart(2, "0"); }
function formatHours(value?: number) { const totalMinutes = Math.max(0, Math.round((value || 0) * 60)); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return `${hours}:${String(minutes).padStart(2, "0")}`; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CC"; }
function titleCase(value: string) { return value.toLowerCase().replace(/(^|\s)\S/g, (match) => match.toUpperCase()); }
function airportCity(code: string) { const names: Record<string, string> = { BSB: "Brasília", GRU: "Guarulhos", CGH: "Congonhas", MCZ: "Maceió", VCP: "Viracopos", FOR: "Fortaleza", CNF: "Confins", PMW: "Palmas", FLN: "Florianópolis", MAB: "Marabá", CPV: "Campina Grande", GYN: "Goiânia", JPA: "João Pessoa", NAT: "Natal", EZE: "Buenos Aires / Ezeiza", POA: "Porto Alegre", VIX: "Vitória", REC: "Recife" }; return names[code] || code; }
function airportSubtitle(origin: string, destination: string) { return `${airportCity(origin)} – ${airportCity(destination)}`; }
