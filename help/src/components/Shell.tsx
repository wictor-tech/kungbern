import Link from "next/link";

/** Sidram. I inbäddat läge (?embed=1, t.ex. i en panel i LUP-produkten) visas ingen header. */
export function Shell({ embed = false, children }: { embed?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {!embed && (
        <header className="sticky top-0 z-40 border-b border-line/70 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
            {/* LUP-kvadraten, som på lupnumber.com. */}
            <Link href="/" className="group flex items-center gap-3" aria-label="LUP Hjälp – till startsidan">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center bg-sky text-lg font-extrabold tracking-tight text-white italic"
              >
                LUP
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-bold text-navy">Hjälpcenter</span>
                <span className="block text-xs text-muted">för LUPNUMBER</span>
              </span>
            </Link>
            <a
              href="https://app.lupnumber.com/site"
              className="glow ml-auto inline-flex min-h-10 items-center rounded-full bg-lup px-4 text-sm font-bold text-white transition hover:bg-lup-dark sm:px-5"
            >
              Till LUPNUMBER<span aria-hidden className="ml-1.5 hidden sm:inline">→</span>
            </a>
          </div>
        </header>
      )}
      <main className={`mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 ${embed ? "py-4" : "py-6 sm:py-8"}`}>{children}</main>
      {!embed && (
        <footer className="bg-navy text-white/75">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm sm:px-6">
            <span>
              <strong className="font-extrabold text-white italic">LUP</strong> Hjälpcenter · skärmbilderna kommer från demoplatsen i
              app.lupnumber.com
            </span>
            <span>Hittar du inte svaret? Tryck 👎 i en guide så hjälper supporten dig.</span>
          </div>
        </footer>
      )}
    </div>
  );
}
