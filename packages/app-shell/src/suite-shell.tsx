import type { CSSProperties, ReactNode } from "react";
import { getSuiteApps, type SuiteAppId } from "@personal-suite/app-registry";

export function SuiteBar({ currentApp }: { currentApp: SuiteAppId }) {
  const apps = getSuiteApps();
  const current = apps.find((app) => app.id === currentApp) ?? apps[0];

  return (
    <header className="personal-suite-bar" style={{ "--suite-accent": current.accent } as CSSProperties}>
      <a className="personal-suite-mark" href={apps[0].href} aria-label="Open Personal Suite home">
        <span aria-hidden="true">∴</span>
      </a>
      <span className="personal-suite-current">{current.shortName}</span>
      <nav className="personal-suite-links" aria-label="Switch personal app">
        {apps.slice(1).map((app) => (
          <a
            key={app.id}
            href={app.href}
            aria-current={app.id === currentApp ? "page" : undefined}
            style={{ "--app-accent": app.accent } as CSSProperties}
          >
            {app.shortName}
          </a>
        ))}
      </nav>
      <details className="personal-suite-menu">
        <summary aria-label="Switch personal app">Apps</summary>
        <div>
          {apps.map((app) => (
            <a key={app.id} href={app.href} aria-current={app.id === currentApp ? "page" : undefined}>
              <i style={{ backgroundColor: app.accent }} aria-hidden="true" />
              <span>{app.name}</span>
            </a>
          ))}
        </div>
      </details>
    </header>
  );
}

export function SuiteShell({
  currentApp,
  children,
}: {
  currentApp: SuiteAppId;
  children: ReactNode;
}) {
  const current = getSuiteApps().find((app) => app.id === currentApp);

  return (
    <div
      className="personal-suite-shell"
      data-suite-app={currentApp}
      style={{ "--suite-accent": current?.accent ?? "#ffffff" } as CSSProperties}
    >
      <SuiteBar currentApp={currentApp} />
      <div className="personal-suite-content">{children}</div>
    </div>
  );
}
