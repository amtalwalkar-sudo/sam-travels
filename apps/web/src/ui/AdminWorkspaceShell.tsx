import { useState, type ReactNode } from "react";
import "./AdminWorkspaceShell.css";

export type AdminSectionContribution = Readonly<{
  id: string;
  label: string;
  content: ReactNode;
}>;

export type AdminWorkspaceShellProps = Readonly<{
  sections: readonly AdminSectionContribution[];
  identityPanel?: ReactNode;
  initialExpandedSection?: string | null;
}>;

/** Replaceable Admin-only navigation and layout; it knows nothing about business services or records. */
export function AdminWorkspaceShell({
  sections,
  identityPanel,
  initialExpandedSection = "finance",
}: AdminWorkspaceShellProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(initialExpandedSection);

  return <section className="admin-replacement-shell" aria-label="Admin workspace">
    <header className="admin-replacement-header">
      <div>
        <p className="admin-replacement-eyebrow">BUSINESS ADMINISTRATION</p>
        <h2>Admin</h2>
        <p className="admin-replacement-description">Manage business records and operations in one place.</p>
      </div>
      <span className="admin-replacement-local">LOCAL RECORDS</span>
    </header>
    {identityPanel && <div className="admin-replacement-identity">{identityPanel}</div>}
    <nav className="admin-replacement-sections" aria-label="Admin sections">
      {sections.map(section => {
        const expanded = expandedSection === section.id;
        const triggerId = `admin-section-trigger-${section.id}`;
        const panelId = `admin-section-panel-${section.id}`;
        return <section className={expanded ? "admin-replacement-section is-expanded" : "admin-replacement-section"} key={section.id}>
          <h3 className="admin-replacement-section-heading">
            <button id={triggerId} className="admin-replacement-section-trigger" type="button"
              aria-expanded={expanded} aria-controls={panelId}
              onClick={() => setExpandedSection(current => current === section.id ? null : section.id)}>
              <span>{section.label}</span>
              <span className="admin-replacement-chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
          </h3>
          <div id={panelId} className="admin-replacement-section-content" hidden={!expanded}
            role="region" aria-labelledby={triggerId}>
            {expanded ? section.content : null}
          </div>
        </section>;
      })}
    </nav>
  </section>;
}
