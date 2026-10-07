"use client";

import { useEffect, useState } from "react";
import type { Hotspot } from "@/lib/types";

/**
 * Skärmbild med de numrerade markeringarna. Klick öppnar bilden i helskärm.
 * Har en markering koordinater (x/y/w/h i procent) ritas en klickbar ruta ovanpå,
 * annars förlitar vi oss på siffrorna som redan finns i bilden.
 */
export function Screenshot({
  src,
  alt,
  hotspots,
  active,
  onHotspot,
}: {
  src: string;
  alt: string;
  hotspots: Hotspot[];
  active?: number | null;
  onHotspot?: (n: number) => void;
}) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom]);

  const positioned = hotspots.filter((h) => h.x !== undefined && h.y !== undefined);

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block w-full cursor-zoom-in"
          aria-label="Visa skärmbilden större"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="block h-auto w-full" />
        </button>
        {positioned.map((h) => (
          <button
            key={h.n}
            type="button"
            onClick={() => onHotspot?.(h.n)}
            aria-label={`Markering ${h.n}: ${h.label}`}
            className={`absolute rounded-md border-2 transition ${
              active === h.n ? "border-marker bg-marker/15 ring-4 ring-marker/30" : "border-marker/70 hover:bg-marker/10"
            }`}
            style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w ?? 6}%`, height: `${h.h ?? 6}%` }}
          />
        ))}
        <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-navy/80 px-2 py-1 text-xs font-medium text-white">
          Klicka för att förstora
        </span>
      </div>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Förstorad skärmbild"
          className="fixed inset-0 z-50 flex flex-col bg-slate-950/90"
          onClick={() => setZoom(false)}
        >
          <div className="flex justify-end p-3">
            <button
              type="button"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-navy"
              onClick={() => setZoom(false)}
              autoFocus
            >
              Stäng ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="mx-auto h-auto max-w-none min-w-full lg:min-w-0 lg:max-w-[1600px]" />
          </div>
        </div>
      )}
    </>
  );
}
