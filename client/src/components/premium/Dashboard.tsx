import React from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  FolderSync,
  Gauge,
  GraduationCap,
  Home as HomeIcon,
  Lock,
  Menu,
  Plane,
  Radar,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getSavedLanguage, getTranslations } from '@/lib/i18n';

interface DashboardProps {
  user: {
    name: string;
    company: string;
    avatar?: string;
    base?: string;
  };
  nextEvent?: {
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
  onNavigate: (view: string) => void;
  canAccessC32FAcademy?: boolean;
  pendingOffline?: number;
  hasRoster?: boolean;
  alertsCount?: number;
  daysLoaded?: number;
  complianceScore?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  user,
  nextEvent,
  onNavigate,
  canAccessC32FAcademy = false,
  pendingOffline = 0,
  hasRoster = false,
  alertsCount = 0,
  daysLoaded = 0,
  complianceScore,
}) => {
  const i18n = getTranslations(getSavedLanguage());
  const displayName = user.name || i18n.crewMember;
  const firstName = displayName.split(/\s+/).filter(Boolean).slice(0, 2).join(' ') || 'Crew';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'CC';

  const menuItems = [
    { icon: FileText, label: i18n.newRoster, caption: 'PDF, AIMS ou iFlight', color: 'from-cyan-300 to-blue-500', onClick: () => onNavigate('import') },
    { icon: Calendar, label: i18n.myRoster, caption: 'linha do tempo premium', color: 'from-blue-400 to-indigo-600', onClick: () => onNavigate('roster') },
    { icon: FolderSync, label: i18n.myRoutine, caption: 'descanso, treino e estudo', color: 'from-emerald-300 to-teal-600', onClick: () => onNavigate('routine') },
    ...(canAccessC32FAcademy ? [{ icon: GraduationCap, label: 'C32F', caption: 'apostila e check A32F', color: 'from-violet-300 to-fuchsia-600', onClick: () => onNavigate('c32f') }] : []),
    { icon: AlertCircle, label: i18n.irregularities, caption: 'descanso e ACT', color: 'from-rose-400 to-red-600', onClick: () => onNavigate('irregularities') },
    { icon: BarChart3, label: 'Meu mês', caption: 'horas, voos e folgas', color: 'from-sky-300 to-cyan-600', onClick: () => onNavigate('reports') },
    { icon: Clock, label: i18n.history, caption: 'histórico sem duplicar', color: 'from-amber-300 to-orange-600', onClick: () => onNavigate('history') },
    { icon: Plane, label: 'iFlight LATAM', caption: 'sincronização mascarada', color: 'from-orange-300 to-amber-600', onClick: () => onNavigate('iflight') },
    { icon: FileText, label: i18n.notes, caption: 'privado no dispositivo', color: 'from-yellow-300 to-amber-500', onClick: () => onNavigate('notes') },
    { icon: Settings, label: i18n.settings, caption: 'tema, idioma e conta', color: 'from-slate-300 to-slate-600', onClick: () => onNavigate('settings') },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden overflow-y-auto bg-[#030914] text-white crewcheck-commercial-dashboard">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_4%,rgba(14,165,233,0.33),transparent_31%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.26),transparent_30%),linear-gradient(180deg,#030914_0%,#07111f_43%,#020817_100%)]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.16),transparent_44%)]" />
        <div className="absolute -bottom-28 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-[100dvh] w-full max-w-[96rem] grid-cols-1 gap-5 px-4 pb-32 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:pb-10 lg:pt-6 2xl:grid-cols-[20rem_minmax(0,1fr)_18rem]">
        <aside className="hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl lg:block">
          <div className="flex items-center gap-4">
            <img src="/icons/crewcheck-icon.svg" alt="CrewCheck" className="h-16 w-16 rounded-3xl shadow-2xl shadow-cyan-950/40" />
            <div>
              <h1 className="text-2xl font-black tracking-tight">CrewCheck</h1>
              <p className="mt-1 text-[0.64rem] font-black uppercase tracking-[0.22em] text-cyan-100/60">Roster Intelligence</p>
            </div>
          </div>

          <button onClick={() => onNavigate('iflight')} className="mt-6 flex w-full items-center justify-between rounded-3xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-left text-sm font-bold text-cyan-50 transition hover:bg-cyan-300/15">
            <span><Sparkles className="mr-2 inline h-4 w-4 text-cyan-200" /> Premium · LGPD</span>
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="mt-6 space-y-3">
            <FeatureLine icon={Wifi} title="100% Offline" text="Escala, rotina e notas funcionam no dispositivo." />
            <FeatureLine icon={RefreshCw} title="Sync inteligente" text={pendingOffline ? `${pendingOffline} item(ns) pendente(s).` : 'Atualiza quando voltar online.'} />
            <FeatureLine icon={ShieldCheck} title="Privacidade LGPD" text="Sem salvar senha corporativa; MFA sempre no portal oficial." />
            <FeatureLine icon={Lock} title="Conta protegida" text="Dados mínimos, sessão local e controle de exportação." />
          </div>

          <button onClick={() => onNavigate('settings')} className="mt-6 w-full rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-sm font-black">{initials}</div>
              <div>
                <p className="font-black leading-tight">{firstName}</p>
                <p className="text-xs text-slate-400">{user.base || 'Base'} · perfil premium</p>
              </div>
            </div>
          </button>
        </aside>

        <main className="min-w-0 space-y-5">
          <section className="relative overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-[linear-gradient(135deg,rgba(255,255,255,.14),rgba(125,211,252,.10),rgba(255,255,255,.05))] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl sm:p-7">
            <div className="absolute -right-12 top-4 h-44 w-44 rounded-full border-[14px] border-cyan-200/10" />
            <Plane className="pointer-events-none absolute -right-3 top-8 h-32 w-32 rotate-12 text-cyan-100/25 drop-shadow-2xl sm:h-40 sm:w-40 xl:text-cyan-100/35" />
            <div className="relative z-10 max-w-2xl">
              <p className="text-[0.7rem] font-black uppercase tracking-[0.32em] text-cyan-100/70">Cockpit pessoal</p>
              <h2 className="mt-2 max-w-xl text-3xl font-black leading-[0.95] tracking-tight sm:text-5xl">{firstName}</h2>
              <p className="mt-3 text-sm font-semibold text-slate-300 sm:text-base">CrewCheck Premium · {user.base || 'BSB'} · escala, rotina, alertas e calendário em um só lugar.</p>
              <div className="mt-5 grid max-w-xl grid-cols-3 gap-2 sm:gap-3">
                <MiniStatus icon={Wifi} value="Offline" label="pronto" />
                <MiniStatus icon={ShieldCheck} value="LGPD" label="privado" />
                <MiniStatus icon={RefreshCw} value="Sync" label="seguro" />
              </div>
            </div>
          </section>

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_17rem]">
            <NextProgramBoardingPass nextEvent={nextEvent} hasRoster={hasRoster} onOpenRoster={() => onNavigate('roster')} onSync={() => onNavigate('iflight')} />
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <SideKpi icon={Calendar} label="Dias carregados" value={String(daysLoaded || '—')} />
              <SideKpi icon={Bell} label="Alertas" value={String(alertsCount)} tone={alertsCount ? 'text-rose-200' : 'text-emerald-200'} />
              <SideKpi icon={Gauge} label="Conformidade" value={complianceScore ? `${complianceScore}/100` : '—'} />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {menuItems.map((item) => <MenuCard key={item.label} {...item} />)}
          </section>
        </main>

        <aside className="hidden space-y-4 2xl:block">
          <SideCard icon={ShieldCheck} title="Privacy by design" text="Sem senha corporativa salva. O usuário autentica no portal oficial e o CrewCheck importa apenas a escala necessária." />
          <SideCard icon={TrendingUp} title="Produto vendável" text="Dashboard premium, plano offline, histórico, rotina, relatórios e proposta clara para assinatura futura." />
          <button onClick={() => onNavigate('settings')} className="w-full rounded-[1.65rem] border border-white/10 bg-white/[0.055] p-5 text-left shadow-xl shadow-black/20 backdrop-blur-xl transition hover:bg-white/[0.08]">
            <Settings className="mb-4 h-8 w-8 text-cyan-200" />
            <p className="font-black">Perfil premium</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">Foto, idioma, tema, base e preferências de calendário.</p>
          </button>
        </aside>
      </div>

      <nav className="crewcheck-dashboard-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#08111f]/90 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl shadow-black backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <NavItem icon={HomeIcon} label={i18n.home} active onClick={() => onNavigate('home')} />
          <NavItem icon={Calendar} label={i18n.roster} onClick={() => onNavigate('roster')} />
          <NavItem icon={Plane} label="iFlight" onClick={() => onNavigate('iflight')} />
          <NavItem icon={Bell} label={i18n.alerts} badge={alertsCount || undefined} onClick={() => onNavigate('alerts')} />
          <NavItem icon={Menu} label={i18n.more} onClick={() => onNavigate('more')} />
        </div>
      </nav>
    </div>
  );
};

function NextProgramBoardingPass({ nextEvent, hasRoster, onOpenRoster, onSync }: { nextEvent?: DashboardProps['nextEvent']; hasRoster: boolean; onOpenRoster: () => void; onSync: () => void }) {
  return (
    <div className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/20 backdrop-blur-2xl">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.65rem] font-black uppercase tracking-[0.26em] text-cyan-100/60">Próxima programação</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{nextEvent?.route || nextEvent?.title || (hasRoster ? 'Escala carregada' : 'Importe sua escala')}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-400">{nextEvent?.date || 'PDF, AIMS ou iFlight'} · {nextEvent?.source || 'CrewCheck local'}</p>
            </div>
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-100 sm:flex"><Plane className="h-7 w-7" /></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <GlassPill label="Apresentação" value={nextEvent?.time || '—'} />
            <GlassPill label="Fim" value={nextEvent?.endTime || '—'} />
            <GlassPill label="Status" value={nextEvent?.status || (hasRoster ? 'Programado' : 'Aguardando')} />
            <GlassPill label="Portão" value={nextEvent?.gate || '—'} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={hasRoster ? onOpenRoster : onSync} className="rounded-2xl bg-cyan-200 px-4 py-3 text-sm font-black text-[#04111f] shadow-lg shadow-cyan-950/20 transition active:scale-95">{hasRoster ? 'Abrir detalhes' : 'Sincronizar agora'}</button>
            <button onClick={onSync} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-white/10 active:scale-95">iFlight mascarado</button>
          </div>
        </div>
        <div className="border-t border-white/10 bg-cyan-300/[0.07] p-5 lg:border-l lg:border-t-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-cyan-100/60">tempo restante</p>
          <p className="mt-2 text-4xl font-black tracking-tight">{nextEvent?.countdown || '—'}</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">Terminal {nextEvent?.terminal || '—'} · atualize status quando houver provedor configurado.</p>
        </div>
      </div>
    </div>
  );
}

function FeatureLine({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-3xl border border-white/8 bg-white/[0.035] p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200"><Icon className="h-5 w-5" /></div>
      <div><p className="text-sm font-black">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-400">{text}</p></div>
    </div>
  );
}

function MiniStatus({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-center backdrop-blur-xl">
      <Icon className="mx-auto mb-1 h-4 w-4 text-cyan-200" />
      <p className="text-sm font-black">{value}</p>
      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">{label}</p>
    </div>
  );
}

function GlassPill({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-3"><p className="truncate text-[0.58rem] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-black text-white">{value}</p></div>;
}

function MenuCard({ icon: Icon, label, caption, color, onClick }: { icon: LucideIcon; label: string; caption: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group min-h-[7.2rem] rounded-[1.45rem] border border-white/10 bg-white/[0.045] p-3 text-left shadow-xl shadow-black/15 transition hover:-translate-y-0.5 hover:bg-white/[0.075] active:scale-95 sm:p-4">
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-[#06101d] shadow-lg shadow-black/20 transition group-hover:scale-105`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[0.74rem] font-black leading-tight text-white sm:text-sm">{label}</p>
      <p className="mt-1 hidden text-[10px] font-bold leading-4 text-slate-500 sm:block">{caption}</p>
    </button>
  );
}

function SideKpi({ icon: Icon, label, value, tone = 'text-cyan-200' }: { icon: LucideIcon; label: string; value: string; tone?: string }) {
  return <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/15 backdrop-blur-xl"><Icon className={`h-6 w-6 ${tone}`} /><p className="mt-3 text-[0.62rem] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-white">{value}</p></div>;
}

function SideCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-[1.65rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
      <Icon className="mb-4 h-9 w-9 text-cyan-200" />
      <p className="font-black">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function NavItem({ icon: Icon, label, active, badge, onClick }: { icon: LucideIcon; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex min-w-12 flex-col items-center gap-1 rounded-2xl px-2 py-1 transition ${active ? 'text-cyan-300' : 'text-slate-500'}`}>
      <span className={`relative flex h-9 w-9 items-center justify-center rounded-2xl ${active ? 'bg-cyan-300/15' : ''}`}>
        <Icon className="h-5 w-5" />
        {badge ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-black text-white">{badge}</span> : null}
      </span>
      <span className="text-[10px] font-black">{label}</span>
    </button>
  );
}

export default Dashboard;
