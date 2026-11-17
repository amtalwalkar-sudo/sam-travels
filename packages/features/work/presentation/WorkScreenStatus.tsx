export type WorkScreenStatusProps = Readonly<{
  ready: boolean;
  error?: string;
}>;

export function WorkScreenStatus({ ready, error = "" }: WorkScreenStatusProps) {
  return (
    <section className={ready && !error ? "work-local-status is-ready" : "work-local-status"} aria-live={error ? "assertive" : "polite"}>
      <span className="work-local-status-indicator" aria-hidden="true" />
      <span>{error || (ready ? "Local workspace ready" : "Preparing your workspace…")}</span>
    </section>
  );
}
