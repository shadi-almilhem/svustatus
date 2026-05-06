import { StatusBannerContainer, StatusBannerIcon } from "@/components/blocks/status-banner";
import { StatusBar } from "@/components/blocks/status-bar";
import {
  StatusComponent,
  StatusComponentBody,
  StatusComponentHeader,
  StatusComponentIcon,
  StatusComponentStatus,
  StatusComponentTitle,
  StatusComponentUptime,
} from "@/components/blocks/status-component";
import { StatusFeed } from "@/components/blocks/status-feed";
import {
  Status,
  StatusContent,
  StatusDescription,
  StatusHeader,
  StatusTitle,
} from "@/components/blocks/status-layout";
import { StatusLocaleSwitcher } from "@/components/blocks/status-locale-switcher";
import { StatusBlocksI18nProvider } from "@/components/blocks/status-i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { copy, getInitialLocale, locales, makeStatusLabels } from "@/lib/status-i18n";
import { cn } from "@/lib/utils";
import {
  STATUS_DATA_URL,
  displayName,
  fetchStatusPayload,
  formatDateTime,
  formatLatency,
  formatRelativeCheck,
  formatStatusCode,
  getSystemStatus,
  toStatusBarData,
  toStatusReports,
  type Locale,
  type MonitorStatus,
  type StatusPayload,
} from "@/lib/status-data";
import {
  Activity,
  AlertTriangle,
  Clock3,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  Moon,
  RefreshCw,
  Sun,
  Wifi,
} from "lucide-react";
import { GithubLogo } from "@phosphor-icons/react/GithubLogo";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";

const REPOSITORY_URL = "https://github.com/shadi-almilhem/svustatus";
const AUTHOR_URL = "https://shadialmilhem.com";
const THEME_STORAGE_KEY = "svustatus-theme";

type ThemeMode = "light" | "dark";

function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const labels = useMemo(() => makeStatusLabels(locale), [locale]);
  const text = copy[locale];
  const direction = locale === "ar" ? "rtl" : "ltr";
  const systemStatus = getSystemStatus(payload?.monitors ?? []);
  const reports = useMemo(
    () => toStatusReports(payload?.incidents ?? [], locale),
    [payload?.incidents, locale],
  );
  const overallUptime = useMemo(
    () => getOverallUptime(payload?.monitors ?? [], locale),
    [payload?.monitors, locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [direction, locale]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStatus() {
      try {
        setIsLoading(true);
        setError(null);
        setPayload(await fetchStatusPayload(controller.signal));
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unknown error");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadStatus();
    return () => controller.abort();
  }, []);

  return (
    <StatusBlocksI18nProvider value={labels}>
      <TooltipProvider>
        <main className="min-h-svh bg-background text-foreground" dir={direction}>
          <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
            <header className="flex items-center justify-between gap-4 border-border border-b pb-5">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src="/svu-status-logo.png"
                  alt=""
                  className="size-11 shrink-0 rounded-lg"
                />
                <div className="min-w-0">
                  <div className="text-muted-foreground text-xs uppercase">
                    {text.eyebrow}
                  </div>
                  <div className="truncate font-semibold text-xl">{text.appName}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={text.repository}
                  title={text.repository}
                >
                  <GithubLogo className="size-4" />
                </a>
                <ThemeToggle
                  theme={theme}
                  label={labels.ariaToggleTheme}
                  onToggle={() => toggleTheme(theme, setTheme)}
                />
                <a
                  className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  href={STATUS_DATA_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={text.source}
                  title={text.source}
                >
                  <GitBranch className="size-4" />
                </a>
                <StatusLocaleSwitcher
                  value={locale}
                  locales={locales}
                  onValueChange={(value) => setLocale(value as Locale)}
                />
              </div>
            </header>

            <Status
              variant={systemStatus}
              className="flex-1 gap-7 py-8 sm:py-10"
            >
              <StatusHeader className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div className="max-w-2xl">
                  <StatusTitle className="text-3xl sm:text-4xl">
                    {text.title}
                  </StatusTitle>
                  <StatusDescription className="mt-3 max-w-xl text-base">
                    {text.description}
                  </StatusDescription>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-72">
                  <Metric icon={<Activity />} label={text.services}>
                    {new Intl.NumberFormat(locale).format(payload?.monitors.length ?? 0)}
                  </Metric>
                  <Metric icon={<Wifi />} label={text.uptime}>
                    {overallUptime}
                  </Metric>
                </div>
              </StatusHeader>

              <StatusBannerContainer
                status={systemStatus}
                className="rounded-lg px-4 py-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {isLoading ? (
                      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
                    ) : error ? (
                      <AlertTriangle className="size-5 text-destructive" />
                    ) : (
                      <StatusBannerIcon className="size-5" />
                    )}
                    <div>
                      <div className="font-semibold">
                        {getBannerCopy(systemStatus, text, isLoading, error)}
                      </div>
                      <div className="mt-0.5 text-muted-foreground text-sm">
                        {error
                          ? text.dataUnavailableDetail
                          : `${text.lastChecked}: ${formatDateTime(
                              payload?.generatedAt,
                              locale,
                              payload?.timezone ?? "Asia/Dubai",
                            )}`}
                      </div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                    <Clock3 className="size-4" />
                    {formatRelativeCheck(payload?.generatedAt, locale)}
                  </div>
                </div>
              </StatusBannerContainer>

              <StatusContent className="space-y-8">
                <section className="space-y-4" aria-labelledby="services-title">
                  <div className="flex items-center justify-between gap-4">
                    <h2 id="services-title" className="font-semibold text-lg">
                      {text.services}
                    </h2>
                    {isLoading && (
                      <span className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                        <RefreshCw className="size-4 animate-spin" />
                        {text.lastChecked}
                      </span>
                    )}
                  </div>

                  {error ? (
                    <EmptyState
                      title={text.dataUnavailable}
                      description={text.dataUnavailableDetail}
                    />
                  ) : payload?.monitors.length ? (
                    <div className="space-y-5">
                      {payload.monitors.map((monitor) => (
                        <MonitorRow
                          key={monitor.id}
                          monitor={monitor}
                          locale={locale}
                          timezone={payload.timezone}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState title={text.pending} description={text.noChecks} />
                  )}
                </section>

                <section className="space-y-4" aria-labelledby="events-title">
                  <h2 id="events-title" className="font-semibold text-lg">
                    {text.recentEvents}
                  </h2>
                  <StatusFeed statusReports={reports} maintenances={[]} />
                </section>
              </StatusContent>
            </Status>

            <footer className="border-border border-t">
              <a
                className="flex min-h-12 items-center justify-center gap-1.5 px-3 text-muted-foreground text-sm transition hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                href={AUTHOR_URL}
                target="_blank"
                rel="noreferrer"
              >
                <span>{text.madeBy}</span>
                <span className="border-muted-foreground/35 border-b border-dashed pb-0.5 text-foreground">
                  {text.authorName}
                </span>
              </a>
            </footer>
          </div>
        </main>
      </TooltipProvider>
    </StatusBlocksI18nProvider>
  );
}

function ThemeToggle({
  theme,
  label,
  onToggle,
}: {
  theme: ThemeMode;
  label: string;
  onToggle: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className="group/theme-toggle inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <span className="relative size-4 overflow-hidden">
        <Sun
          className={cn(
            "absolute inset-0 size-4 transition duration-300",
            theme === "dark" ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
          aria-hidden="true"
        />
        <Moon
          className={cn(
            "absolute inset-0 size-4 transition duration-300",
            theme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0",
          )}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

function MonitorRow({
  monitor,
  locale,
  timezone,
}: {
  monitor: MonitorStatus;
  locale: Locale;
  timezone: string;
}) {
  const text = copy[locale];
  const data = useMemo(() => toStatusBarData(monitor.daily), [monitor.daily]);
  const variant = monitor.currentStatus === "empty" ? "info" : monitor.currentStatus;

  return (
    <StatusComponent
      variant={variant}
      className="rounded-lg border bg-card px-4 py-4"
    >
      <StatusComponentHeader className="items-start gap-4">
        <div className="flex min-w-0 items-start gap-2">
          <StatusComponentIcon className="mt-1 shrink-0" />
          <div className="min-w-0">
            <StatusComponentTitle className="truncate text-base">
              {displayName(monitor.name, locale)}
            </StatusComponentTitle>
            <a
              className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-muted-foreground text-xs hover:text-foreground"
              href={monitor.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="truncate">{monitor.url}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-3 pt-0.5">
          <StatusComponentUptime>{monitor.uptimeLabel}</StatusComponentUptime>
          <StatusComponentStatus />
        </div>
      </StatusComponentHeader>

      <StatusComponentBody className="pt-3">
        <StatusBar data={data} />
        <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
          <span>{text.uptime}</span>
          <span>{formatDateTime(monitor.latest?.checkedAt, locale, timezone)}</span>
        </div>
        <dl className="grid gap-2 pt-2 text-sm sm:grid-cols-3">
          <Detail label={text.latestHttp}>
            {formatStatusCode(monitor.latest?.status ?? null, locale)}
          </Detail>
          <Detail label={text.latency}>
            {formatLatency(monitor.latest?.latencyMs ?? null, locale)}
          </Detail>
          <Detail label={text.attempts}>
            {monitor.latest
              ? new Intl.NumberFormat(locale).format(monitor.latest.attempt)
              : "--"}
          </Detail>
        </dl>
      </StatusComponentBody>
    </StatusComponent>
  );
}

function Metric({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <span className="[&>svg]:size-3.5">{icon}</span>
        {label}
      </div>
      <div className="mt-1 font-semibold text-xl">{children}</div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-8 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
        <AlertTriangle className="size-5 text-muted-foreground" />
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
        {description} 
      </p>
    </div>
  );
}

function getBannerCopy(
  status: "success" | "degraded" | "error" | "info",
  text: (typeof copy)[Locale],
  isLoading: boolean,
  error: string | null,
) {
  if (isLoading) return text.pending;
  if (error) return text.dataUnavailable;
  if (status === "error") return text.outage;
  if (status === "info") return text.pending;
  return text.allClear;
}

function getOverallUptime(monitors: MonitorStatus[], locale: Locale) {
  const values = monitors
    .map((monitor) => monitor.uptimePercent)
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) return "--%";

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(average)}%`;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function toggleTheme(
  currentTheme: ThemeMode,
  setTheme: React.Dispatch<React.SetStateAction<ThemeMode>>,
) {
  const nextTheme = currentTheme === "dark" ? "light" : "dark";

  const updateTheme = () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    flushSync(() => {
      setTheme(nextTheme);
      applyTheme(nextTheme);
    });
  };

  const documentWithTransition = document as Document & {
    startViewTransition?: (callback: () => void) => void;
  };
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!documentWithTransition.startViewTransition || prefersReducedMotion) {
    updateTheme();
    return;
  }

  documentWithTransition.startViewTransition(updateTheme);
}

export default App;
