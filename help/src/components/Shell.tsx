import { Logo } from "./ui";

/** Sidram. I inbäddat läge (?embed=1, t.ex. i en panel i LUP-produkten) visas ingen header. */
export function Shell({ embed = false, children }: { embed?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {!embed && (
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Logo />
            <a href="https://app.lupnumber.com/site" className="text-sm font-medium text-muted hover:text-navy">
              Till LUPNUMBER →
            </a>
          </div>
        </header>
      )}
      <main className={`mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 ${embed ? "py-4" : "py-6 sm:py-8"}`}>{children}</main>
      {!embed && (
        <footer className="border-t border-line bg-white py-4 text-center text-xs text-muted">
          LUP Hjälp · Bilderna kommer från testplatsen DEMO LUP
        </footer>
      )}
    </div>
  );
}
