import type { ReactNode } from "react";
import "./work-screen.css";

/**
 * Replaceable Work presentation host.
 *
 * The shell owns layout only. Each region is an opaque slot supplied by its
 * owner; the shell does not inspect workflow state, feature data, form values,
 * persistence, or application services.
 */
export export type WorkScreenShellProps = Readonly<{
  heading: ReactNode;
  status?: ReactNode;
  workflow: ReactNode;
  extensions?: ReactNode;
}>;

export function WorkScreenShell({ heading, status, workflow, extensions }: WorkScreenShellProps) {
  return (
    <div className="work-screen-shell" data-presentation-contract="work-shell-v1">
      <header className="work-screen-header">{heading}</header>
      {status !== undefined && <div className="work-screen-status">{status}</div>}
      <section className="work-screen-workflow" aria-label="Current work">{workflow}</section>
      {extensions !== undefined && <div className="work-screen-extensions">{extensions}</div>}
    </div>
  );
}
