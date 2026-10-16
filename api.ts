// Comunicación con el backend (Google Apps Script). La app es estática y no guarda secretos.
import QRCode from 'qrcode';
import { BACKEND_URL, type Sede } from './config/sedes';
import type { User } from './types';

async function call<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!BACKEND_URL || BACKEND_URL.includes('PEGAR')) {
    return { success: false, message: 'Falta conectar el backend (BACKEND_URL en config/sedes.ts).' } as T;
  }
  const res = await fetch(BACKEND_URL, {
    method: 'POST',
    redirect: 'follow',
    // text/plain evita el preflight CORS que Apps Script no responde
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const sedeInfo = (s: Sede) => ({
  ciudad: s.ciudad, fechaTexto: s.fechaTexto, fechaISO: s.fechaISO, hora: s.hora, horaFin: s.horaFin,
  hotel: s.hotel, direccion: s.direccion, lineas: s.lineas,
});

export const qrPng = (id: string) =>
  QRCode.toDataURL(id, { width: 480, margin: 1, color: { dark: '#221C33', light: '#FFFFFF' } });

export const api = {
  count: (s: Sede) => call<{ success: boolean; count: number }>('count', { sede: s.id }),
  register: (s: Sede, d: { nombre: string; correo: string; especialidad: string }) =>
    call<{ success: boolean; existing?: boolean; full?: boolean; message?: string; user?: User }>('register', {
      sede: s.id, ...d,
    }),
  byEmail: (s: Sede, correo: string) => call<{ success: boolean; user?: User; message?: string }>('byEmail', { sede: s.id, correo }),
  byId: (id: string) => call<{ success: boolean; user?: User; message?: string }>('byId', { id }),
  sendTicket: async (user: User, s: Sede, resend = false) =>
    call<{ success: boolean; message?: string }>('sendTicket', { id: user.id, qrPng: await qrPng(user.id), sedeInfo: sedeInfo(s), resend }),
  liveToken: (id: string) => call<{ success: boolean; token?: string; apiVersion?: string; message?: string }>('liveToken', { id }),
  login: (email: string, password: string) => call<{ success: boolean; token?: string; message?: string }>('login', { email, password }),
  checkin: (token: string, id: string) => call<any>('checkin', { token, id }),
  stats: (token: string) => call<any>('stats', { token }),
};
