import React from 'react';
import QRCode from 'react-qr-code';
import { CheckCircle2 } from 'lucide-react';
import type { User } from '../types';
import { EVENTO, type Sede } from '../config/sedes';

const Ticket: React.FC<{ user: User; sede: Sede }> = ({ user, sede }) => (
  <div className="w-full max-w-sm card rounded-3xl overflow-hidden relative">
    <div className="spectrum-bar h-2" />
    <div className="px-6 pt-5 pb-4 text-center">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-plum">Invitación personal</p>
      <h3 className="text-lg font-extrabold mt-1">{EVENTO.nombre} · {sede.ciudad}</h3>
    </div>

    <div className="relative px-6">
      <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-paper border border-line" />
      <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-paper border border-line" />
      <div className="border-t-2 border-dashed border-line" />
    </div>

    <div className="px-6 pt-5 pb-6 text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">Asistente</p>
      <p className="text-lg font-extrabold leading-snug">{user.name}</p>

      <div className="relative mt-4 inline-block">
        <div className={`p-3 bg-white rounded-2xl border border-line ${user.checkedIn ? 'opacity-40' : ''}`}>
          <QRCode value={user.id} size={168} level="M" fgColor="#221C33" />
        </div>
        {user.checkedIn && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 border-[3px] border-leaf text-leaf bg-white/90 rounded-lg px-3 py-1 text-2xl font-extrabold uppercase tracking-widest">
              Asistió
            </span>
          </span>
        )}
      </div>

      <p className="mt-3 inline-block rounded-full bg-paper px-3 py-1 font-mono font-bold tracking-[0.15em] text-sm">{user.id}</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
        <div className="rounded-xl bg-cream border border-line px-3 py-2">
          <dt className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Fecha</dt>
          <dd className="font-extrabold">{sede.fechaTexto.replace(/^\S+\s/, '').replace(' de 2026', '')}</dd>
        </div>
        <div className="rounded-xl bg-cream border border-line px-3 py-2">
          <dt className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Cita</dt>
          <dd className="font-extrabold">{sede.hora}</dd>
        </div>
        <div className="col-span-2 rounded-xl bg-cream border border-line px-3 py-2">
          <dt className="text-[11px] font-extrabold uppercase tracking-wider text-muted">Sede</dt>
          <dd className="font-extrabold">{sede.hotel}</dd>
        </div>
      </dl>
    </div>

    <div className="bg-cream border-t border-line px-6 py-3 text-center text-xs font-bold text-muted flex items-center justify-center gap-1.5">
      {user.checkedIn ? <><CheckCircle2 size={14} className="text-leaf" /> Entrada registrada</> : 'Presente este código al llegar'}
    </div>
  </div>
);

export default Ticket;
