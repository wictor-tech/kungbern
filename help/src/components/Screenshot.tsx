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
  annotated = false,
}: {
  src: string;
  alt: string;
  hotspots: Hotspot[];
  active?: number | null;
  /** Siffrorna finns redan i bilden – rita bara den aktiva markeringen. */
  annotated?: boolean;
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
        {positioned
          .filter((h) => !annotated || h.n === active)
          .map((h) => {
            const on = h.n === active;
            return (
              <span
                key={h.n}
                aria-hidden
                className={`pointer-events-none absolute rounded-md transition ${
                  on ? "bg-lup/10 ring-4 ring-lup/70 ring-offset-2" : "ring-2 ring-marker/80"
                }`}
                style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w ?? 6}%`, height: `${h.h ?? 6}%` }}
              >
                {!annotated && (
                  <span
                    className={`absolute -top-3 -left-3 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow ${
                      on ? "bg-lup" : "bg-marker"
                    }`}
                  >
                    {h.n}
                  </span>
                )}
              </span>
            );
          })}
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
