import React, { useCallback, useEffect, useState } from 'react';
import RegistrationForm from './components/RegistrationForm';
import Ticket from './components/Ticket';
import AdiAssistant from './components/AdiAssistant';
import EventDetails from './components/EventDetails';
import AdminPanel from './components/AdminPanel';
import { AppState, User } from './types';
import { SEDES, EVENTO, getSede, eventoTerminado, type Sede } from './config/sedes';
import { api } from './api';

const BASE = import.meta.env.BASE_URL; // /vital-d/
import { Mail, Link as LinkIcon, UserPlus, CheckCircle2, MapPin, CalendarDays, ArrowRight } from 'lucide-react';

const sedeFromId = (id: string): Sede | null =>
  id.startsWith('VDA-') ? SEDES.acapulco : id.startsWith('VDQ-') ? SEDES.queretaro : null;

// Cada sede tiene su dirección: /vital-d/acapulco/ y /vital-d/queretaro/. El boleto va como ?t=VDA-XXXXXX
const setUrl = (params: Record<string, string | null>) => {
  try {
    const url = new URL(window.location.href);
    if ('sede' in params) url.pathname = params.sede ? `${BASE}${params.sede}/` : BASE;
    url.searchParams.delete('sede');
    if ('t' in params) (params.t === null ? url.searchParams.delete('t') : url.searchParams.set('t', params.t!));
    window.history.replaceState({}, '', url.toString());
  } catch { /* algunos visores bloquean el historial */ }
};

const routeFromPath = () => {
  const seg = window.location.pathname.slice(BASE.length).split('/')[0].toLowerCase();
  return seg;
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.SELECT_SEDE);
  const [sede, setSede] = useState<Sede | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [sending, setSending] = useState(false);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const loadCount = useCallback(async (s: Sede) => {
    try {
      const r = await api.count(s);
      if (r.success) {
        setCount(r.count);
        if (r.count >= s.cupo) setState((st) => (st === AppState.REGISTERING ? AppState.CLOSED : st));
      }
    } catch { /* el conteo es informativo */ }
  }, []);

  const openSede = useCallback((s: Sede) => {
    setSede(s);
    setUser(null);
    setUrl({ sede: s.id, t: null });
    setState(eventoTerminado(s) ? AppState.CLOSED : AppState.REGISTERING);
    loadCount(s);
  }, [loadCount]);

  // Ruteo inicial por parámetros de la URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const route = routeFromPath();
    if (p.get('mode') === 'admin' || route === 'staff') { setState(AppState.ADMIN_LOGIN); return; }

    const t = (p.get('t') || '').toUpperCase();
    const s = getSede(route) || getSede(p.get('sede')) || (t ? sedeFromId(t) : null);
    if (!s) { setState(AppState.SELECT_SEDE); return; }

    if (t) {
      setSede(s);
      api.byId(t)
        .then((r) => {
          if (r.success && r.user) { setUser(r.user); setState(AppState.CONFIRMED); }
          else { toast('No encontramos ese boleto. Puede buscarlo con su correo.'); openSede(s); }
        })
        .catch(() => openSede(s));
      return;
    }
    openSede(s);
  }, [openSede, toast]);

  const confirmUser = (u: User) => {
    setUser(u);
    setState(AppState.CONFIRMED);
    setUrl({ sede: u.sede, t: u.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRegister = async (data: { nombre: string; correo: string; especialidad: string }) => {
    if (!sede) return;
    try {
      const r = await api.register(sede, data);
      if (!r.success || !r.user) {
        if (r.full) setState(AppState.CLOSED);
        toast(r.message || 'No fue posible completar el registro.');
        return;
      }
      const u = r.user;
      confirmUser(u);
      if (r.existing) toast('Este correo ya estaba registrado. Este es su boleto.');
      loadCount(sede);
      // El correo sale en segundo plano; la confirmación en pantalla no lo espera
      api.sendTicket(u, sede)
        .then((m) => toast(m.success ? `Boleto enviado a ${u.email}` : 'Registro listo. El correo no salió; puede reenviarlo abajo.'))
        .catch(() => toast('Registro listo. El correo no salió; puede reenviarlo abajo.'));
    } catch {
      toast('Error de conexión. Intente nuevamente.');
    }
  };

  const handleLookup = async (correo: string) => {
    if (!sede) return;
    try {
      const r = await api.byEmail(sede, correo);
      if (r.success && r.user) confirmUser(r.user);
      else toast(r.message || 'No encontramos un registro con ese correo.');
    } catch {
      toast('Error de conexión. Intente nuevamente.');
    }
  };

  const resend = async () => {
    if (!user || !sede) return;
    setSending(true);
    try {
      const r = await api.sendTicket(user, sede, true);
      toast(r.message || (r.success ? 'Boleto enviado' : 'No se pudo enviar el correo.'));
    } catch {
      toast('Error de conexión al enviar el correo.');
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!user) return;
    const url = `${window.location.origin}${BASE}${user.sede}/?t=${user.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace a su boleto copiado');
    } catch {
      toast(url);
    }
  };

  const registerAnother = () => {
    if (sede) openSede(sede);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ───────── Vistas de admin ─────────
  if (state === AppState.ADMIN_LOGIN || state === AppState.ADMIN_SCANNER) {
    return <AdminPanel />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="spectrum-bar h-1.5 w-full" />

      {/* Encabezado */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => { setUrl({ sede: null, t: null }); setUser(null); setSede(null); setState(AppState.SELECT_SEDE); }}
          className="flex items-center gap-3 text-left"
          aria-label="Ir al inicio"
        >
          <img src={`${BASE}vitald_logo.webp`} alt="" className="h-11 w-auto" />
          <span className="leading-tight">
            <span className="block text-[15px] font-extrabold tracking-tight">{EVENTO.nombre}</span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{sede ? sede.ciudad : 'Acapulco · Querétaro'}</span>
          </span>
        </button>
        <img src={`${BASE}adium_logo.png`} alt="Adium" className="h-9 w-auto" />
      </header>

      {/* Avisos */}
      <div className="fixed top-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-50 space-y-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="fade-in card rounded-xl px-4 py-3 text-sm font-semibold flex gap-3 items-start pointer-events-auto">
            <span className="mt-1.5 h-2 w-2 rounded-full bg-ember shrink-0" />
            <span className="break-words">{t.msg}</span>
          </div>
        ))}
      </div>

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Selector de sede */}
        {state === AppState.SELECT_SEDE && (
          <section className="rise max-w-2xl mx-auto text-center">
            <img src={`${BASE}vitald_logo.webp`} alt="Vital D" className="w-40 sm:w-48 mx-auto mb-4" />
            <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight">{EVENTO.nombre}</h1>
            <p className="text-muted font-semibold mt-1">{EVENTO.concepto}</p>
            <p className="mt-6 mb-3 text-sm font-bold uppercase tracking-[0.14em] text-muted">Elija su sede</p>
            <div className="grid sm:grid-cols-2 gap-4 text-left">
              {Object.values(SEDES).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSede(s)}
                  className="card rounded-2xl p-5 hover:border-plum transition group"
                >
                  <span className="block text-xl font-extrabold">{s.ciudad}</span>
                  <span className="mt-2 flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} className="text-ember" />{s.fechaTexto.replace(' de 2026', '')} · {s.hora}</span>
                  <span className="mt-1 flex items-center gap-2 text-sm font-semibold text-muted"><MapPin size={16} className="text-wine" />{s.hotel}</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-plum">
                    {eventoTerminado(s) ? 'Evento realizado' : 'Confirmar asistencia'} <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Registro / cerrado */}
        {(state === AppState.REGISTERING || state === AppState.CLOSED) && sede && (
          <section className="rise grid lg:grid-cols-[1fr_440px] gap-8 items-start">
            <div className="text-center lg:text-left pt-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-plum">Aparte la fecha</p>
              <h1 className="mt-2 text-[28px] sm:text-[32px] leading-tight font-extrabold tracking-tight">
                {EVENTO.nombre} <span className="spectrum-text">{sede.ciudad}</span>
              </h1>
              <p className="mt-3 text-lg font-extrabold">{sede.fechaTexto} · <span className="whitespace-nowrap">{sede.hora}</span></p>
              <p className="text-wine font-extrabold uppercase tracking-wide text-sm mt-1">{sede.hotel}</p>
              <p className="mt-4 text-muted font-semibold max-w-md mx-auto lg:mx-0">
                Una mañana de actualización médica con desayuno, pláticas por línea terapéutica y panel de expertos.
              </p>
              {state === AppState.REGISTERING && count !== null && (
                <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white border border-line px-4 py-1.5 text-sm font-bold">
                  <span className="h-2 w-2 rounded-full bg-leaf" />
                  {count < sede.cupoPublico
                    ? `${sede.cupoPublico - count} de ${sede.cupoPublico} lugares disponibles`
                    : 'Últimos lugares disponibles'}
                </p>
              )}
            </div>
            <RegistrationForm
              sede={sede}
              closed={state === AppState.CLOSED}
              closedReason={eventoTerminado(sede) ? 'past' : 'full'}
              onRegister={handleRegister}
              onLookup={handleLookup}
            />
          </section>
        )}

        {/* Confirmado */}
        {state === AppState.CONFIRMED && user && sede && (
          <div className="rise flex flex-col gap-8">
            <section className="text-center">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-leaf bg-white border border-line rounded-full px-3 py-1">
                <CheckCircle2 size={14} /> Asistencia confirmada
              </span>
              <h2 className="mt-3 text-2xl sm:text-[26px] font-extrabold tracking-tight">Le damos la bienvenida, {user.name}</h2>
              <p className="text-muted font-semibold mt-1">Soy {EVENTO.anfitriona}, su anfitriona. Pregúnteme lo que necesite sobre el evento.</p>
              <AdiAssistant user={user} sede={sede} />
            </section>

            <section className="flex flex-col items-center">
              <Ticket user={user} sede={sede} />
              <p className="mt-4 text-sm font-semibold text-muted flex items-center gap-1.5">
                <Mail size={15} className="text-plum" /> Boleto enviado a <strong className="text-ink">{user.email}</strong>
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={resend} disabled={sending}
                  className="inline-flex items-center gap-2 rounded-full bg-white border border-line px-4 py-2 text-sm font-bold hover:border-plum disabled:opacity-50">
                  <Mail size={15} /> {sending ? 'Enviando…' : 'Reenviar a mi correo'}
                </button>
                <button type="button" onClick={copyLink}
                  className="inline-flex items-center gap-2 rounded-full bg-white border border-line px-4 py-2 text-sm font-bold hover:border-plum">
                  <LinkIcon size={15} /> Copiar enlace
                </button>
                <button type="button" onClick={registerAnother}
                  className="inline-flex items-center gap-2 rounded-full bg-ink text-white px-4 py-2 text-sm font-bold hover:bg-[#3A3058]">
                  <UserPlus size={15} /> Registrar a otro médico
                </button>
              </div>
            </section>

            <EventDetails sede={sede} />
          </div>
        )}
      </main>

      <footer className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 text-xs font-semibold text-muted flex flex-col sm:flex-row gap-1 justify-between">
        <span>{EVENTO.marca}</span>
        <span>{EVENTO.nombre} 2026</span>
      </footer>
    </div>
  );
};

export default App;
