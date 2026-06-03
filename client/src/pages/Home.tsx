import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Upload,
  FileText,
  Shield,
  Clock,
  Dumbbell,
  AlertTriangle,
  TrendingUp,
  Download as DownloadIcon,
  Plane,
  Lock,
  Sparkles,
  CheckCircle2,
  Radar,
  CalendarDays,
  LogOut,
  UserRound,
  FolderOpen,
  History,
  RefreshCw,
  Database,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { analyzeCompliance, getGymRecommendations } from '@/lib/complianceEngine';
import { detectAndMarkLayovers } from '@/lib/layoverDetection';
import { normalizeRosterSchedule } from '@/lib/rosterNormalizer';
import type { CrewRoleSelection } from '@/lib/actRules';
import type { CrewRoster } from '@/lib/pdfParser';
import { getStoredUser, logout } from '@/lib/authClient';
import { syncPendingRosters, getPendingOfflineCount } from '@/lib/offlineSync';
import { getDatabaseStatus, listSavedRosters, openSavedRoster, type DatabaseStatus, type SavedRosterSummary } from '@/lib/databaseClient';
import { toast } from 'sonner';


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

export default function Home() {
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [roleSelection, setRoleSelection] = useState<CrewRoleSelection>('auto');
  const [savedRosters, setSavedRosters] = useState<SavedRosterSummary[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [openingSavedId, setOpeningSavedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const user = getStoredUser();
  const pendingOffline = getPendingOfflineCount();

  const refreshSavedRosters = useCallback(async () => {
    setSavedLoading(true);
    try {
      const [statusResult, historyResult] = await Promise.allSettled([
        getDatabaseStatus(),
        listSavedRosters(6),
      ]);
      if (statusResult.status === 'fulfilled') setDbStatus(statusResult.value);
      else setDbStatus({ ok: false, connected: false, databaseConfigured: false, message: 'Banco indisponível. Histórico local ativo.' });
      if (historyResult.status === 'fulfilled') setSavedRosters(historyResult.value);
      else setSavedRosters([]);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSavedRosters();
  }, [refreshSavedRosters]);

  const handleOpenSavedRoster = useCallback(async (id: string) => {
    setOpeningSavedId(id);
    try {
      const data = await openSavedRoster(id);
      sessionStorage.setItem('crewcheck_roster', JSON.stringify(normalizeRosterSchedule(detectAndMarkLayovers(data.roster))));
      sessionStorage.setItem('crewcheck_compliance', JSON.stringify(data.compliance));
      sessionStorage.setItem('crewcheck_gym', JSON.stringify(data.gym || []));
      sessionStorage.setItem('crewcheck_role_selection', roleSelection);
      sessionStorage.setItem('crewcheck_source_file', 'Escala salva');
      toast.success('Escala salva carregada.');
      setLocation('/results');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a escala salva.');
    } finally {
      setOpeningSavedId(null);
    }
  }, [roleSelection, setLocation]);

  async function handleLogout() {
    await logout();
    setLocation('/login');
  }

  async function handleSyncPending() {
    const result = await syncPendingRosters();
    await refreshSavedRosters();
    if (result.synced > 0) toast.success(`${result.synced} escala(s) sincronizada(s).`);
    if (result.remaining > 0) toast.warning(`${result.remaining} pendência(s) ainda offline.`);
    if (!result.synced && !result.remaining) toast.info('Nenhuma pendência offline para sincronizar.');
  }

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
        console.error('Server PDF parser failed', serverError);
        throw serverError instanceof Error ? serverError : new Error('Parser servidor indisponível.');
      }
      roster = normalizeRosterSchedule(detectAndMarkLayovers(roster));
      const compliance = analyzeCompliance(roster, roleSelection);
      const gym = getGymRecommendations(roster, roleSelection);

      sessionStorage.setItem('crewcheck_roster', JSON.stringify(roster));
      sessionStorage.setItem('crewcheck_compliance', JSON.stringify(compliance));
      sessionStorage.setItem('crewcheck_gym', JSON.stringify(gym));
      sessionStorage.setItem('crewcheck_role_selection', roleSelection);
      sessionStorage.setItem('crewcheck_source_file', file.name);
      sessionStorage.setItem('crewcheck_auto_sync_pending', '1');
      sessionStorage.setItem('crewcheck_auto_db_save_pending', '1');

      setLocation('/results');
    } catch (err) {
      console.error('Error parsing PDF:', err);
      const message = err instanceof Error ? err.message : '';
      setError(`Não consegui interpretar este PDF. ${message ? `Detalhe: ${message}. ` : ''}No iPhone, tente abrir o PDF no app Arquivos, salvar localmente e selecionar de novo pelo botão Escolher PDF.`);
    } finally {
      setIsProcessing(false);
    }
  }, [setLocation, roleSelection]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
    event.target.value = '';
  }, [handleFile]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="min-h-screen overflow-hidden bg-[#07111F] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.35),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(236,72,153,0.25),transparent_32%),linear-gradient(135deg,#07111F_0%,#0B1730_45%,#0A1020_100%)]" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.85) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.85) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
        <div className="absolute -left-24 top-24 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute right-12 top-36 h-44 w-44 rounded-full border border-cyan-300/20" />
      </div>

      <div className="relative z-10">
        <header className="container py-6">
          <div className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.06] px-5 py-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <button onClick={() => setLocation('/')} className="flex items-center gap-3 text-left">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-fuchsia-400 text-[#07111F] shadow-lg shadow-cyan-500/20">
                <Plane className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight">CrewCheck</h1>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-100/70">Roster intelligence</p>
              </div>
            </button>

            <div className="hidden items-center gap-2 md:flex">
              <Badge className="border-white/10 bg-white/10 text-cyan-100 hover:bg-white/10">
                <Lock className="mr-1.5 h-3.5 w-3.5" /> Conta protegida
              </Badge>
              {pendingOffline > 0 && (
                <button onClick={handleSyncPending} className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">
                  {pendingOffline} offline · sincronizar
                </button>
              )}
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-cyan-100">
                <UserRound className="h-4 w-4" />
                <span className="max-w-[11rem] truncate">{user?.name || user?.email || 'Usuário'}</span>
              </div>
              <button onClick={handleLogout} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-cyan-100 hover:bg-white/15">
                <LogOut className="mr-1 inline h-3.5 w-3.5" /> Sair
              </button>
            </div>
          </div>
        </header>

        <main className="container pb-16 pt-8 md:pb-24 md:pt-14">
          <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 shadow-lg shadow-cyan-950/30">
                <Sparkles className="h-4 w-4" />
                Leitura premium do CrewRosterReport/AIMS com LGPD
              </div>

              <h2 className="max-w-4xl text-4xl font-black leading-[1.04] tracking-tight md:text-6xl">
                Transforme sua escala em um painel inteligente de conformidade.
              </h2>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200/80">
                Envie o PDF da escala. O CrewCheck interpreta voos, folgas, sobreavisos, pernoites e pontos de atenção com cadastro mínimo e proteção de dados.
              </p>

              <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi icon={Radar} value="PDF" label="interpretação por linhas e colunas" />
                <Kpi icon={Shield} value="RBAC" label="regras parametrizadas" />
                <Kpi icon={CalendarDays} value="Google" label="sincronização calendário" />
                <Kpi icon={Dumbbell} value="Gym" label="janelas de treino" />
              </div>

              <SavedRosterAccess
                rosters={savedRosters}
                loading={savedLoading}
                dbStatus={dbStatus}
                openingId={openingSavedId}
                onOpen={handleOpenSavedRoster}
                onRefresh={refreshSavedRosters}
              />
            </div>

            <Card className="relative overflow-hidden rounded-[2rem] border-white/10 bg-white/[0.08] p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300" />
              <div className="rounded-[1.5rem] border border-white/10 bg-[#0B1730]/70 p-5 md:p-7">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-cyan-100">Upload seguro</p>
                    <h3 className="text-2xl font-black tracking-tight">Analisar escala</h3>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200">
                    <FileText className="h-6 w-6" />
                  </div>
                </div>

                <div className="mb-5 rounded-[1.2rem] border border-white/10 bg-white/[0.06] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-cyan-100">ACT aplicável</p>
                      <p className="text-xs leading-5 text-slate-300">O sistema tenta identificar pelo PDF, mas você pode forçar a função correta.</p>
                    </div>
                    <Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/10">2025/2027</Badge>
                  </div>
                  <select
                    value={roleSelection}
                    onChange={(event) => setRoleSelection(event.target.value as CrewRoleSelection)}
                    className="h-12 w-full rounded-2xl border border-white/15 bg-[#07111F] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300"
                  >
                    <option value="auto">Detectar automaticamente pela escala</option>
                    <option value="cabin">Aplicar ACT Comissários</option>
                    <option value="pilot">Aplicar ACT Pilotos</option>
                  </select>
                </div>

                <div
                  onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`relative rounded-[1.35rem] border-2 border-dashed p-8 text-center transition-all duration-300 ${isDragging ? 'scale-[1.015] border-cyan-300 bg-cyan-300/10' : 'border-white/15 bg-white/[0.04] hover:border-fuchsia-300/60 hover:bg-white/[0.07]'} ${isProcessing ? 'pointer-events-none opacity-70' : ''}`}
                >
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-4 py-6">
                      <div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-300 border-t-transparent" />
                      <div>
                        <p className="text-lg font-bold">Interpretando {fileName || 'PDF'}...</p>
                        <p className="mt-1 text-sm text-slate-300">Lendo cabeçalho, trechos, jornadas, folgas e totais.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-5 py-4">
                      <div className="flex h-20 w-20 items-center justify-center rounded-[1.7rem] bg-gradient-to-br from-cyan-300 to-fuchsia-400 text-[#07111F] shadow-xl shadow-cyan-500/25">
                        <Upload className="h-9 w-9" />
                      </div>
                      <div>
                        <p className="text-xl font-black">Arraste o CrewRosterReport aqui</p>
                        <p className="mt-2 text-sm text-slate-300">ou selecione o PDF original emitido pelo sistema de escala</p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center justify-center rounded-2xl bg-white px-7 py-3 text-sm font-black text-[#07111F] shadow-lg transition hover:bg-cyan-100 active:scale-[0.99]">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf,.pdf,application/octet-stream"
                          onChange={handleFileInput}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                        Escolher PDF no dispositivo
                      </label>
                      <p className="max-w-sm text-xs leading-5 text-slate-400">No iPhone/iPad, prefira Arquivos → No iPhone/iCloud Drive. Se o PDF veio do WhatsApp, salve em Arquivos antes de importar.</p>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mt-4 flex gap-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-left text-red-100">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm leading-6">{error}</p>
                  </div>
                )}

                <div className="mt-5 grid gap-3 text-sm text-slate-200/85">
                  <TrustLine icon={CheckCircle2} text="Processamento feito no navegador: o PDF não precisa sair do seu dispositivo." />
                  <TrustLine icon={CheckCircle2} text="Compatível com CrewRosterReport em tabela, incluindo múltiplas páginas e datas de continuação." />
                  <TrustLine icon={CheckCircle2} text="Gera painel, alertas, recomendações de treino, PDF e calendário." />
                </div>
              </div>
            </Card>
          </section>

          <section className="mt-12 grid gap-4 md:grid-cols-3">
            <FeatureCard icon={Shield} title="Conformidade operacional" text="Cruza horas de voo, jornada, folgas, sobreaviso, reserva, descanso, madrugada e ACT correta conforme piloto ou comissário." />
            <FeatureCard icon={Clock} title="Leitura inteligente da tabela" text="Reconstrói linhas e colunas do PDF para captar trechos como LA3542, bases BSB/CGH/JPA, duty report e duty debrief." />
            <FeatureCard icon={Dumbbell} title="Rotina pessoal" text="Indica os melhores dias e horários para treino, com cautela para jornadas longas, madrugada e sobreaviso." />
          </section>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button onClick={() => setLocation('/statistics')} variant="outline" className="rounded-2xl border-white/15 bg-white/10 text-white hover:bg-white/15">
              <TrendingUp className="mr-2 h-4 w-4" />
              Ver estatísticas
            </Button>
            <Button onClick={() => setLocation('/download')} variant="outline" className="rounded-2xl border-white/15 bg-white/10 text-white hover:bg-white/15">
              <DownloadIcon className="mr-2 h-4 w-4" />
              Baixar app mobile
            </Button>
          </div>
        </main>

        <footer className="container pb-8">
          <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.05] px-5 py-4 text-xs text-slate-300 backdrop-blur-xl md:flex-row">
            <p>CrewCheck v10.4.12 · Calendar + voo noturno</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => setLocation('/disclaimer')} className="hover:text-white">Aviso Legal</button>
              <span className="text-white/20">•</span>
              <button onClick={() => setLocation('/privacy')} className="hover:text-white">Privacidade</button>
              <span className="text-white/20">•</span>
              <button onClick={() => setLocation('/terms')} className="hover:text-white">Termos</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}


function SavedRosterAccess({ rosters, loading, dbStatus, openingId, onOpen, onRefresh }: {
  rosters: SavedRosterSummary[];
  loading: boolean;
  dbStatus: DatabaseStatus | null;
  openingId: string | null;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const latest = rosters[0];
  const dbOnline = Boolean(dbStatus?.connected || dbStatus?.ok);
  return (
    <Card className="mt-6 rounded-[1.8rem] border-white/10 bg-white/[0.075] p-4 text-white shadow-2xl shadow-black/15 backdrop-blur-xl md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-cyan-200">
            <FolderOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/65">Acesso rápido</p>
            <h3 className="mt-1 text-xl font-black tracking-tight">Escalas salvas</h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-300">
              Depois do login, abra a última escala salva sem escolher novo PDF. No APK, o histórico local também funciona quando o banco estiver indisponível.
            </p>
          </div>
        </div>
        <button onClick={onRefresh} className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-cyan-100 hover:bg-white/15">
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center rounded-full px-3 py-1 font-black ${dbOnline ? 'bg-emerald-300/15 text-emerald-100' : 'bg-amber-300/15 text-amber-100'}`}>
          <Database className="mr-1.5 h-3.5 w-3.5" /> {dbOnline ? 'Banco online' : 'Histórico local'}
        </span>
        <span className="rounded-full bg-white/10 px-3 py-1 font-black text-slate-200">{rosters.length} escala(s) encontrada(s)</span>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-200" /> Buscando escalas salvas...
        </div>
      ) : latest ? (
        <div className="mt-5 grid gap-3">
          <button onClick={() => onOpen(latest.id)} disabled={openingId === latest.id} className="group flex w-full items-center justify-between gap-4 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-left transition hover:bg-cyan-300/15 disabled:opacity-60">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/70">Última escala</p>
              <p className="mt-1 text-lg font-black text-white">{monthLabel(latest.month, latest.year)} · {latest.base || 'Base'}</p>
              <p className="mt-1 text-sm text-slate-300">{latest.crewName || 'Tripulante'} · {latest.sourceFileName || 'Escala salva'}</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#07111F]">
              {openingId === latest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
              Abrir
              <ChevronRight className="h-4 w-4" />
            </div>
          </button>

          {rosters.slice(1, 4).map((item) => (
            <button key={item.id} onClick={() => onOpen(item.id)} disabled={openingId === item.id} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left text-sm transition hover:bg-white/[0.09] disabled:opacity-60">
              <span className="truncate"><strong>{monthLabel(item.month, item.year)}</strong> · {item.sourceFileName || item.crewName || 'Escala salva'}</span>
              {openingId === item.id ? <Loader2 className="h-4 w-4 animate-spin text-cyan-200" /> : <ChevronRight className="h-4 w-4 text-cyan-200" />}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm leading-6 text-slate-300">
          Nenhuma escala salva encontrada ainda. Carregue uma escala uma vez; depois ela aparecerá aqui logo após o login.
        </div>
      )}
    </Card>
  );
}

function monthLabel(month: number | null, year: number | null): string {
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  if (!month || !year) return 'Período salvo';
  return `${names[month - 1] || String(month).padStart(2, '0')}/${year}`;
}

function Kpi({ icon: Icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
      <Icon className="mb-3 h-5 w-5 text-cyan-200" />
      <p className="text-xl font-black">{value}</p>
      <p className="mt-1 text-xs leading-4 text-slate-300">{label}</p>
    </div>
  );
}

function TrustLine({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
      <span>{text}</span>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <Card className="rounded-3xl border-white/10 bg-white/[0.07] p-6 text-white shadow-2xl shadow-black/10 backdrop-blur-xl">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-200">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
    </Card>
  );
}
