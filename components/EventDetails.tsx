import React from 'react';
import { MapPin, Clock, Navigation } from 'lucide-react';
import type { Sede } from '../config/sedes';

const EventDetails: React.FC<{ sede: Sede }> = ({ sede }) => {
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(sede.mapaQuery)}&output=embed`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sede.mapaQuery)}`;

  return (
    <section className="card rounded-3xl overflow-hidden grid md:grid-cols-2">
      <div className="p-6 sm:p-7 space-y-5">
        <h3 className="text-lg font-extrabold">Cómo llegar y qué esperar</h3>

        <div className="flex gap-3">
          <MapPin size={20} className="text-wine shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold">{sede.hotel}</p>
            <p className="text-sm font-semibold text-muted">{sede.direccion}</p>
            <a href={mapLink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold text-plum hover:underline">
              <Navigation size={14} /> Abrir en Maps
            </a>
          </div>
        </div>

        <div className="flex gap-3">
          <Clock size={20} className="text-ember shrink-0 mt-0.5" />
          <div className="w-full">
            <p className="font-extrabold">{sede.fechaTexto}</p>
            <ol className="mt-2 space-y-1.5">
              {sede.agenda.map((b) => (
                <li key={b.hora} className="flex gap-3 text-sm">
                  <span className="w-12 shrink-0 font-extrabold tabular-nums">{b.hora}</span>
                  <span className="font-semibold text-muted">
                    {b.titulo}
                    {b.quien && <span className="block text-ink font-bold">{b.quien}</span>}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs font-semibold text-muted">Cierre a las {sede.horaFin}.</p>
          </div>
        </div>

        {sede.lineas.length > 0 && (
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted mb-2">Líneas terapéuticas</p>
            <div className="flex flex-wrap gap-2">
              {sede.lineas.map((l) => (
                <span key={l} className="rounded-full bg-cream border border-line px-3 py-1 text-sm font-bold">{l}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="min-h-[300px] bg-cream">
        <iframe title={`Mapa de ${sede.hotel}`} src={mapSrc} loading="lazy" className="w-full h-full min-h-[300px] border-0" allowFullScreen />
      </div>
    </section>
  );
};

export default EventDetails;
