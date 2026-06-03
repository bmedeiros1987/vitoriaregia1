import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import AuthPage from "./pages/AuthPage";
import Home from "./pages/Home";
import Results from "./pages/Results";
import NotFound from "./pages/NotFound";
import InfoPage from "./pages/InfoPage";
import { getMe, isAuthenticated } from "./lib/authClient";

function Protected({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!isAuthenticated()) {
      setLocation("/login");
      return;
    }
    getMe()
      .catch(() => setLocation("/login"))
      .finally(() => mounted && setReady(true));
    return () => {
      mounted = false;
    };
  }, [setLocation]);

  if (!isAuthenticated()) return null;
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06101d] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[.08] px-6 py-5 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-3 h-10 w-10 animate-pulse rounded-2xl bg-cyan-300/30" />
          <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-100/70">Validando acesso</p>
          <p className="mt-1 text-sm text-slate-300">Carregando CrewCheck Premium...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      <Route path="/">{() => <Protected><Home /></Protected>}</Route>
      <Route path="/results">{() => <Protected><Results /></Protected>}</Route>
      <Route path="/statistics">{() => <Protected><InfoPage page="statistics" /></Protected>}</Route>
      <Route path="/download">{() => <Protected><InfoPage page="download" /></Protected>}</Route>
      <Route path="/disclaimer">{() => <InfoPage page="disclaimer" />}</Route>
      <Route path="/privacy">{() => <InfoPage page="privacy" />}</Route>
      <Route path="/terms">{() => <InfoPage page="terms" />}</Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Toaster richColors position="top-right" />
      <Router />
      <div className="fixed bottom-2 right-2 z-[9999] rounded-full border border-slate-300/40 bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-950/75 dark:text-slate-300">
        CrewCheck v10.4.12 · Calendar + voo noturno
      </div>
    </ErrorBoundary>
  );
}
