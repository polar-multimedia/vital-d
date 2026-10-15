import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Lock, LogOut, RefreshCw } from 'lucide-react';
import { api as backend } from '../api';
import { SEDES } from '../config/sedes';

type Result =
  | { status: 'loading' }
  | { status: 'ok' | 'repeat' | 'error'; message: string; guest?: string; ciudad?: string; id?: string };

interface Stats {
  sedes: { id: string; ciudad: string; cupo: number; fecha: string }[];
  stats?: Record<string, { registrados: number; asistieron: number }>;
}

const TOKEN_KEY = 'vitald-admin-token';
const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const writeToken = (t: string | null) => {
  try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* sin almacenamiento */ }
};

const AdminPanel: React.FC = () => {
  const [token, setToken] = useState<string | null>(readToken);
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [manual, setManual] = useState('');
  const busy = useRef(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const guard = useCallback((r: any) => {
    if (r?.expired) { writeToken(null); setToken(null); throw new Error('expired'); }
    return r;
  }, []);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const r = guard(await backend.stats(token));
      setStats({ ...r, sedes: Object.values(SEDES).map((s) => ({ id: s.id, ciudad: s.ciudad, cupo: s.cupo, fecha: s.fechaTexto })) });
    } catch { /* sin conexión */ }
  }, [token, guard]);

  const checkIn = useCallback(async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    try { scannerRef.current?.pause(true); } catch { /* la cámara aún no está encendida */ }
    setResult({ status: 'loading' });
    try {
      const r = guard(await backend.checkin(token!, code));
      setResult({
        status: r.success ? 'ok' : r.alreadyCheckedIn ? 'repeat' : 'error',
        message: r.message,
        guest: r.guestName,
        ciudad: r.ciudad,
        id: r.id,
      });
      if (r.success) loadStats();
    } catch {
      setResult({ status: 'error', message: 'Sin conexión con el servidor' });
    } finally {
      setTimeout(() => {
        busy.current = false;
        try { scannerRef.current?.resume(); } catch { /* el escáner se cerró */ }
      }, 2500);
    }
  }, [token, guard, loadStats]);

  useEffect(() => {
    if (!token) return;
    loadStats();
    const el = document.getElementById('reader');
    if (!el) return;
    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] },
      false,
    );
    scannerRef.current = scanner;
    scanner.render((text) => checkIn(text), () => {});
    const interval = setInterval(loadStats, 30000);
    return () => {
      clearInterval(interval);
      scanner.clear().catch(() => {});
      scannerRef.current = null;
    };
  }, [token, checkIn, loadStats]);

  const login = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoggingIn(true);
    setLoginError('');
    try {
      const r = await backend.login(String(f.get('email') || ''), String(f.get('password') || ''));
      if (r.success && r.token) { writeToken(r.token); setToken(r.token); }
      else setLoginError(r.message || 'Acceso denegado');
    } catch {
      setLoginError('Sin conexión con el servidor');
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = () => { writeToken(null); setToken(null); setResult(null); };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <form onSubmit={login} className="card rounded-2xl p-7 w-full max-w-sm space-y-4">
          <div className="text-center">
            <Lock className="mx-auto text-plum" size={36} />
            <h1 className="text-xl font-extrabold mt-2">Acceso del staff</h1>
            <p className="text-sm font-semibold text-muted">Vital D · registro en puerta</p>
          </div>
          <input name="email" type="email" placeholder="Correo" className="field" autoComplete="username" required autoFocus />
          <input name="password" type="password" placeholder="Contraseña" className="field" autoComplete="current-password" required />
          {loginError && <p className="text-sm font-bold text-wine">{loginError}</p>}
          <button type="submit" disabled={loggingIn} className="btn-primary w-full py-3.5">{loggingIn ? 'Verificando…' : 'Ingresar'}</button>
        </form>
      </div>
    );
  }

  const tone =
    result && result.status !== 'loading'
      ? { ok: 'border-leaf bg-[#EAF6EF]', repeat: 'border-sun bg-[#FFF6D9]', error: 'border-wine bg-[#FBE9EA]' }[result.status]
      : 'border-line bg-white';

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-md mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-plum">Registro en puerta</p>
            <h1 className="text-xl font-extrabold">Vital D</h1>
          </div>
          <button type="button" onClick={logout} className="inline-flex items-center gap-1 text-sm font-bold text-wine">
            <LogOut size={15} /> Salir
          </button>
        </header>

        {stats && (
          <div className="grid grid-cols-2 gap-3">
            {stats.sedes.map((s) => {
              const st = stats.stats?.[s.id];
              return (
                <div key={s.id} className="card rounded-xl p-3">
                  <p className="text-sm font-extrabold">{s.ciudad}</p>
                  <p className="text-[22px] font-extrabold tabular-nums leading-tight">
                    {st?.asistieron ?? '–'}<span className="text-muted text-sm font-bold"> llegaron</span>
                  </p>
                  <p className="text-xs font-bold">{st?.registrados ?? '–'} registrados</p>
                  <p className="text-xs font-semibold text-muted">Cupo {s.cupo}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="card rounded-2xl p-3">
          <div id="reader" className="w-full overflow-hidden rounded-xl" />
        </div>

        <div className={`rounded-2xl border-2 p-5 min-h-[120px] flex items-center justify-center text-center ${tone}`} aria-live="assertive">
          {!result && <p className="font-semibold text-muted">Escanee el QR del boleto</p>}
          {result?.status === 'loading' && <Loader2 className="animate-spin text-plum" size={32} />}
          {result && result.status !== 'loading' && (
            <div>
              {result.status === 'ok' && <CheckCircle2 className="mx-auto text-leaf" size={40} />}
              {result.status === 'repeat' && <AlertTriangle className="mx-auto text-[#B98600]" size={40} />}
              {result.status === 'error' && <XCircle className="mx-auto text-wine" size={40} />}
              {result.guest && <p className="text-lg font-extrabold mt-2">{result.guest}</p>}
              <p className="font-extrabold uppercase tracking-wide text-sm mt-1">
                {result.status === 'ok' ? 'Acceso autorizado' : result.status === 'repeat' ? 'Boleto ya utilizado' : 'Acceso denegado'}
              </p>
              <p className="text-sm font-semibold text-muted mt-1">
                {result.message}{result.ciudad ? ` · Sede ${result.ciudad}` : ''}
              </p>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { checkIn(manual.trim()); setManual(''); } }}
          className="flex gap-2"
        >
          <input value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="Código manual: VDA-XXXXXX" className="field font-mono" />
          <button type="submit" className="btn-primary px-4">Validar</button>
        </form>

        <div className="flex items-center justify-between text-sm font-bold text-muted">
          <button type="button" onClick={loadStats} className="inline-flex items-center gap-1 hover:text-ink"><RefreshCw size={14} /> Actualizar</button>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
