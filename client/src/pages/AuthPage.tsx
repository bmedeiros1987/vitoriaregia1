import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Cloud,
  Lock,
  Mail,
  Plane,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { login, register, requestPasswordReset } from '@/lib/authClient';

type AuthMode = 'login' | 'register' | 'reset';

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });

  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    try {
      if (mode === 'reset') {
        await requestPasswordReset(form.email);
        toast.success('Se o e-mail estiver cadastrado, enviaremos uma senha provisória premium.');
        setMode('login');
        return;
      }
      if (mode === 'register') {
        await register({
          email: form.email,
          password: form.password,
          confirmPassword: form.confirmPassword,
          role: 'crew',
        });
        toast.success('Cadastro criado. Enviamos um e-mail premium com uma senha provisória.');
      } else {
        await login(form.email, form.password);
        toast.success('Login realizado.');
      }
      setLocation('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível acessar.');
    } finally {
      setIsLoading(false);
    }
  }

  const title = mode === 'register' ? 'Comece com segurança.' : mode === 'reset' ? 'Recupere o acesso.' : 'Bem-vindo de volta.';
  const description = mode === 'register'
    ? 'Informe apenas e-mail, senha e confirmação. BP, base e função serão preenchidos automaticamente após carregar a escala.'
    : mode === 'reset'
      ? 'Informe seu e-mail cadastrado. Enviaremos uma senha provisória profissional e temporária para recuperar o acesso.'
      : 'Entre para carregar nova escala, consultar histórico e sincronizar pendências.';

  return (
    <div className="min-h-screen overflow-hidden bg-[#06101d] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(56,189,248,.35),transparent_28%),radial-gradient(circle_at_80%_5%,rgba(168,85,247,.28),transparent_30%),linear-gradient(135deg,#06101d,#0a1b32_52%,#040915)]" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="absolute -left-28 top-24 h-80 w-80 rounded-full border border-cyan-200/10" />
        <div className="absolute bottom-16 right-14 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-5 py-8 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
        <section className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-white/[.07] px-4 py-2 text-sm text-cyan-100 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <Sparkles className="h-4 w-4" />
            CrewCheck Premium · acesso protegido
          </div>
          <h1 className="mt-7 max-w-3xl text-6xl font-black leading-[1.02] tracking-tight">
            Sua escala, conformidade e recuperação em um painel premium.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200/80">
            Cadastro mínimo, e-mail profissional, senha provisória de emergência e preenchimento automático de BP, base e função a partir do PDF.
          </p>

          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3">
            <Feature icon={ShieldCheck} title="LGPD e privacidade" text="Dados mínimos, senha com hash e uso restrito à análise da escala." />
            <Feature icon={WifiOff} title="Modo offline" text="Analisa e guarda pendências até sincronizar." />
            <Feature icon={Cloud} title="MySQL/Aiven" text="Banco real com deduplicação por checksum." />
            <Feature icon={CalendarDays} title="Calendário premium" text="ICS com voos, cidades e lembretes." />
          </div>
        </section>

        <section className="mx-auto w-full max-w-[31rem]">
          <div className="mb-6 flex items-center justify-center gap-3 lg:justify-start">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-fuchsia-400 text-[#06101d] shadow-lg shadow-cyan-400/20">
              <Plane className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black">CrewCheck</h2>
              <p className="text-xs uppercase tracking-[0.26em] text-cyan-100/70">Roster Intelligence</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[.09] shadow-2xl shadow-black/30 backdrop-blur-2xl">
            <div className="h-1 bg-gradient-to-r from-cyan-300 via-blue-400 to-fuchsia-400" />
            <div className="p-5 md:p-7">
              <div className="mb-5 flex rounded-2xl bg-black/20 p-1">
                <button type="button" onClick={() => setMode('login')} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition ${mode === 'login' ? 'bg-white text-[#092846]' : 'text-white/70 hover:text-white'}`}>Entrar</button>
                <button type="button" onClick={() => setMode('register')} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black transition ${mode === 'register' ? 'bg-white text-[#092846]' : 'text-white/70 hover:text-white'}`}>Criar cadastro</button>
              </div>

              <div className="mb-6">
                <p className="text-sm font-bold text-cyan-100">{mode === 'register' ? 'Cadastro obrigatório' : mode === 'reset' ? 'Senha provisória' : 'Acesso ao sistema'}</p>
                <h3 className="mt-1 text-3xl font-black tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
              </div>

              <form onSubmit={submit} className="space-y-3">
                <Field icon={Mail} label="E-mail">
                  <input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className="field-input" placeholder="tripulante@exemplo.com" />
                </Field>

                {mode !== 'reset' && (
                  <Field icon={Lock} label="Senha">
                    <input required minLength={6} type="password" value={form.password} onChange={(e) => update('password', e.target.value)} className="field-input" placeholder="mínimo 6 caracteres" />
                  </Field>
                )}

                {mode === 'register' && (
                  <Field icon={Lock} label="Confirmar senha">
                    <input required minLength={6} type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} className="field-input" placeholder="repita a senha escolhida" />
                  </Field>
                )}

                <Button disabled={isLoading} type="submit" className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-500 text-base font-black text-[#04101f] shadow-lg shadow-cyan-950/30 hover:opacity-95">
                  {isLoading ? 'Aguarde...' : mode === 'reset' ? 'Enviar senha provisória' : mode === 'register' ? 'Criar cadastro seguro' : 'Entrar no CrewCheck'}
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </form>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                {mode !== 'reset' ? <button type="button" onClick={() => setMode('reset')} className="font-bold text-cyan-100 hover:text-white">Esqueci minha senha</button> : <button type="button" onClick={() => setMode('login')} className="font-bold text-cyan-100 hover:text-white">Voltar para entrar</button>}
                {mode === 'login' && <button type="button" onClick={() => setMode('register')} className="font-bold text-cyan-100 hover:text-white">Criar conta</button>}
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-4 text-xs leading-5 text-cyan-50">
                <div className="mb-1 flex items-center gap-2 font-black"><BadgeCheck className="h-4 w-4" /> Premium offline-first</div>
                O CrewCheck aplica boas práticas de LGPD: cadastro mínimo, senha protegida por hash e dados usados somente para análise, histórico e exportações solicitadas.
                <div className="mt-3 flex flex-wrap gap-3 font-black">
                  <a href="/privacy" className="text-cyan-100 underline decoration-cyan-100/40 underline-offset-4 hover:text-white">Política de Privacidade</a>
                  <a href="/terms" className="text-cyan-100 underline decoration-cyan-100/40 underline-offset-4 hover:text-white">Termos de Uso</a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[.07] p-4 backdrop-blur-xl"><Icon className="h-5 w-5 text-cyan-200" /><h3 className="mt-3 font-black">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-300">{text}</p></div>;
}

function Field({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return <label className="block rounded-2xl border border-white/10 bg-white/[.06] px-4 py-3 focus-within:border-cyan-300/50"><span className="mb-1.5 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70"><Icon className="h-3.5 w-3.5" /> {label}</span>{children}</label>;
}
