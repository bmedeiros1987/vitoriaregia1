import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  DownloadCloud,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CrewRoster } from '@/lib/pdfParser';

interface IFlightIntegrationViewProps {
  onBack: () => void;
  onSuccess: () => void;
  onFileUpload?: (file: File) => Promise<void>;
  onRosterImport?: (roster: CrewRoster, sourceFileName?: string) => Promise<void>;
}

type IFlightStatus = 'idle' | 'portal' | 'fetching' | 'success' | 'error';

type IFlightPortalOptions = {
  autoClicks: boolean;
  fromDate: string;
  toDate: string;
  periodMonth: string;
  periodYear: string;
  format: 'pdf';
  includeLegend: boolean;
  clickSend: false;
  privacyMode: 'lgpd_no_credentials';
  actions: string[];
};

type NativeIFlightPayload = {
  ok?: boolean;
  roster?: CrewRoster;
  dataBase64?: string;
  filename?: string;
  sourceFileName?: string;
  message?: string;
  error?: string;
};

declare global {
  interface Window {
    CrewCheckIFlight?: {
      openPortalAndImport?: (
        url: string,
        options?: IFlightPortalOptions,
      ) => Promise<NativeIFlightPayload | string> | NativeIFlightPayload | string;
    };
  }
}

const IFLIGHT_URL = 'https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage';
const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Apr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Aug',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dec',
};

function lastDayOfMonth(year: string, month: string) {
  const yearNumber = Number(year) || new Date().getFullYear();
  const monthNumber = Number(month) || new Date().getMonth() + 1;
  return String(new Date(yearNumber, monthNumber, 0).getDate()).padStart(2, '0');
}

function formatIFlightDate(day: string, month: string, year: string) {
  return `${day}-${MONTH_NAMES[month] || 'Jan'}-${year || new Date().getFullYear()}`;
}

async function parseBase64Pdf(filename: string, dataBase64: string): Promise<CrewRoster> {
  const response = await fetch('/api/parse-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, dataBase64 }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.roster) {
    throw new Error(payload?.message || payload?.detail || 'Não consegui interpretar o PDF baixado pelo iFlight.');
  }
  return payload.roster as CrewRoster;
}

const IFlightIntegrationView: React.FC<IFlightIntegrationViewProps> = ({ onBack, onSuccess, onFileUpload, onRosterImport }) => {
  const now = new Date();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<IFlightStatus>('idle');
  const [message, setMessage] = useState('Toque em Baixar escala. Se a sessão iFlight já estiver aberta, o CrewCheck segue direto para Roster; se pedir login/MFA, você faz manualmente no portal oficial.');
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [includeLegend, setIncludeLegend] = useState(false);
  const [autoClicks, setAutoClicks] = useState(true);

  const isBusy = status === 'fetching' || status === 'portal';
  const hasNativeBridge = typeof window !== 'undefined' && Boolean(window.CrewCheckIFlight?.openPortalAndImport);
  const months = useMemo(() => ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'], []);
  const fromDate = formatIFlightDate('01', periodMonth, periodYear);
  const toDate = formatIFlightDate(lastDayOfMonth(periodYear, periodMonth), periodMonth, periodYear);

  const portalOptions: IFlightPortalOptions = {
    autoClicks,
    fromDate,
    toDate,
    periodMonth,
    periodYear,
    format: 'pdf',
    includeLegend,
    clickSend: false,
    privacyMode: 'lgpd_no_credentials',
    actions: ['wait_user_login_mfa', 'open_roster', 'open_roster_report', 'fill_period', 'select_pdf', 'set_lt', 'run_report', 'capture_pdf_download'],
  };

  const finishRosterImport = async (roster: CrewRoster, sourceFileName: string) => {
    if (!onRosterImport) {
      setStatus('success');
      setMessage('Escala recebida. Abra a tela de escala para conferir.');
      onSuccess();
      return;
    }
    setStatus('fetching');
    setMessage('PDF recebido. Interpretando escala e montando painel...');
    await onRosterImport(roster, sourceFileName);
    setStatus('success');
    setMessage('Escala iFlight importada com sucesso.');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('fetching');
    setMessage(`Processando ${file.name}...`);
    try {
      if (onFileUpload) {
        await onFileUpload(file);
        setStatus('success');
        setMessage('Escala iFlight importada com sucesso.');
        onSuccess();
        return;
      }
      setStatus('success');
      setMessage('PDF selecionado. Conclua a análise na tela de escala.');
      onSuccess();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível importar o PDF do iFlight.');
    } finally {
      e.target.value = '';
    }
  };

  async function handleOpenPortalFlow() {
    if (hasNativeBridge && window.CrewCheckIFlight?.openPortalAndImport) {
      setStatus('portal');
      setMessage('Portal iFlight aberto dentro do CrewCheck. Se já estiver logado, vou direto para Roster > Roster Report > PDF/LT > Run.');
      try {
        const nativeResult = await window.CrewCheckIFlight.openPortalAndImport(IFLIGHT_URL, portalOptions);
        const payload: NativeIFlightPayload = typeof nativeResult === 'string' ? JSON.parse(nativeResult) : nativeResult;
        if (!payload?.ok) throw new Error(payload?.error || payload?.message || 'O portal foi fechado sem retornar o PDF da escala.');
        if (payload.roster) {
          await finishRosterImport(payload.roster, payload.sourceFileName || payload.filename || `iFlight_${periodYear}_${periodMonth}.pdf`);
          return;
        }
        if (payload.dataBase64) {
          const filename = payload.filename || `iFlight_${periodYear}_${periodMonth}.pdf`;
          const roster = await parseBase64Pdf(filename, payload.dataBase64);
          await finishRosterImport(roster, filename);
          return;
        }
        throw new Error('O portal retornou sem PDF e sem escala interpretada.');
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Não foi possível concluir a importação pelo portal.';
        const isSso403 = /app_not_configured_for_user|service is not configured|403/i.test(rawMessage);
        const errorMessage = isSso403
          ? 'O iFlight/Google retornou 403. Verifique se a conta corporativa correta tem permissão. Como fallback, baixe o PDF no portal e importe manualmente.'
          : rawMessage;
        setStatus('error');
        setMessage(errorMessage);
        toast.error(errorMessage);
      }
      return;
    }

    setStatus('portal');
    setMessage('No navegador Web, o CrewCheck não consegue controlar outro domínio nem capturar download por segurança. Baixe o PDF no iFlight e importe aqui.');
    window.open(IFLIGHT_URL, '_blank', 'noopener,noreferrer');
    toast.info('Baixe o PDF no iFlight e volte para importar manualmente.');
  }

  const statusTone = status === 'success'
    ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50'
    : status === 'error'
      ? 'border-rose-300/30 bg-rose-400/10 text-rose-50'
      : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-50';

  return (
    <div className="min-h-screen overflow-hidden bg-[#030914] pb-24 text-white crewcheck-iflight-screen">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(249,115,22,0.18),transparent_30rem),radial-gradient(circle_at_86%_4%,rgba(14,165,233,0.16),transparent_28rem),linear-gradient(180deg,#030914_0%,#07111f_58%,#020817_100%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-5 py-6">
        <header className="flex items-center justify-between gap-4 rounded-[1.6rem] border border-white/10 bg-white/[0.065] px-4 py-3 shadow-2xl shadow-black/25 backdrop-blur-2xl">
          <button onClick={onBack} className="flex min-w-0 items-center gap-3 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-orange-100"><ChevronLeft className="h-5 w-5" /></span>
            <span className="min-w-0">
              <h2 className="truncate text-lg font-black">iFlight dentro do CrewCheck</h2>
              <p className="mt-1 truncate text-xs font-black uppercase tracking-[0.18em] text-orange-100/60">login e MFA manuais · PDF em LT</p>
            </span>
          </button>
          <img src="/icons/crewcheck-icon.svg" alt="CrewCheck" className="h-11 w-11 rounded-2xl" />
        </header>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.065] p-5 shadow-2xl shadow-black/25 backdrop-blur-2xl sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-100/65">importação objetiva</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Puxar escala do iFlight</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Login e MFA continuam no portal oficial. Se você já estiver autenticado, o app entra direto na tela da escala.</p>
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${statusTone}`}>{isBusy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}{message}</div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button onClick={handleOpenPortalFlow} disabled={status === 'fetching'} className="flex min-h-[4rem] items-center justify-center gap-3 rounded-2xl bg-cyan-300 px-5 py-4 text-base font-black text-[#07111f] shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70">
                  <DownloadCloud className="h-5 w-5" /> {hasNativeBridge ? 'Puxar escala agora' : 'Abrir iFlight'}
                </button>
                <button onClick={() => fileInputRef.current?.click()} disabled={status === 'fetching'} className="flex min-h-[4rem] items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-base font-black text-white transition hover:bg-white/15 disabled:cursor-wait disabled:opacity-70">
                  <Upload className="h-5 w-5" /> Importar PDF
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileUpload} disabled={status === 'fetching'} className="sr-only" />
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-cyan-300/15 bg-[#07111f]/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-cyan-100"><CalendarDays className="h-4 w-4" /> Período</div>
              <div className="grid gap-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70">Mês</span>
                  <select value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300">
                    {months.map((month) => <option key={month} value={month}>{month}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70">Ano</span>
                  <input value={periodYear} onChange={(event) => setPeriodYear(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300" />
                </label>
                <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3 text-xs leading-5 text-slate-300">
                  <strong className="text-white">{fromDate}</strong> até <strong className="text-white">{toDate}</strong><br />Formato: <strong className="text-white">PDF</strong> · Fuso: <strong className="text-white">LT</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-3">
          <ToggleCard checked={autoClicks} onChange={setAutoClicks} title="Automático" text="Abre Roster, escolhe PDF/LT e aciona Run após login ou sessão já aberta." />
          <ToggleCard checked={includeLegend} onChange={setIncludeLegend} title="Include Legend" text="Marca legenda no relatório quando existir." />
          <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-50/80"><ShieldCheck className="mb-2 h-5 w-5" /><strong>LGPD:</strong> somente o PDF gerado pelo usuário é importado.</div>
        </section>

        <section className="mt-4 rounded-[1.7rem] border border-white/10 bg-white/[0.055] p-4 text-sm leading-6 text-slate-300 shadow-xl shadow-black/20 backdrop-blur-2xl">
          <AlertCircle className="mr-2 inline h-4 w-4 text-orange-200" />
          Caminho usado no Android: Menu → Roster → Roster Calendar → Roster Report → PDF → LT → Run. O botão Send não é usado.
        </section>

        <a href={IFLIGHT_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/15">
          Abrir portal no navegador <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
};

function ToggleCard({ checked, onChange, title, text }: { checked: boolean; onChange: (value: boolean) => void; title: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-4 text-sm text-slate-200 shadow-xl shadow-black/15 backdrop-blur-xl">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" className="mt-1 h-4 w-4 accent-cyan-300" />
      <span><strong className="text-white">{title}</strong><br /><span className="text-slate-400">{text}</span></span>
    </label>
  );
}

export default IFlightIntegrationView;
