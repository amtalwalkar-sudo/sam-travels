import { useState, type ReactNode } from "react";
import { defineApplicationShell } from "../../../../packages/presentation/src/shell-contracts";
import { DeviceReadinessPrompt } from "./DeviceReadinessPrompt";

export const primaryShellDefinition = defineApplicationShell({
  id: "sam-travels.primary-shell",
  version: 2,
  initialScreen: "Drive",
  navigation: [
    { screen: "Drive", label: "Drive", icon: "drive" },
    { screen: "Timeline", label: "Timeline", icon: "timeline" },
    { screen: "Performance", label: "Performance", icon: "performance" },
    { screen: "Admin", label: "Admin", icon: "admin" },
  ] as const,
});
export type PrimaryScreen = typeof primaryShellDefinition.navigation[number]["screen"];
type IconName = typeof primaryShellDefinition.navigation[number]["icon"];

export function NavigationIcon({ name }: { name: IconName }) {
  const shared = {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, "aria-hidden": true as const,
  };
  switch (name) {
    case "drive":
      return <svg {...shared}><path d="M5 16.5 6.8 9h10.4l1.8 7.5" /><path d="M4 16.5h16v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="m7 9 1.2-3h7.6L17 9" /><circle cx="7.5" cy="16.5" r="1" /><circle cx="16.5" cy="16.5" r="1" /></svg>;
    case "timeline":
      return <svg {...shared}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16M8 13h2M8 16h5" /></svg>;
    case "performance":
      return <svg {...shared}><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
    case "admin":
      return <svg {...shared}><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></svg>;
  }
}

export function ApplicationShell({ activeScreen, onNavigate, settingsContent, children }: {
  activeScreen: PrimaryScreen;
  onNavigate: (screen: PrimaryScreen) => void;
  settingsContent: ReactNode;
  children: ReactNode;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return <main className="shell">
    <DeviceReadinessPrompt />
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">ST</div>
        <div><strong>Sam Travels</strong><span>{activeScreen}</span></div>
      </div>
      <button className="settings-trigger" type="button" onClick={() => setSettingsOpen(open => !open)}
        aria-label="Settings" aria-expanded={settingsOpen} aria-controls="application-settings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2A1.7 1.7 0 0 0 7.8 17l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2A1.7 1.7 0 0 0 5.4 6.8l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a1.7 1.7 0 0 1 3.4 0v.2A1.7 1.7 0 0 0 17 4.4l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 1.9Z" /></svg>
      </button>
    </header>
    {settingsOpen && <aside id="application-settings" className="settings-panel" aria-label="Application settings">
      <div className="settings-panel-heading"><div><small>APPLICATION</small><h2>Settings</h2></div>
        <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></div>
      {settingsContent}
    </aside>}
    <div className="screen-scroll">{children}</div>
    <nav className="bottom-navigation" aria-label="Primary navigation">
      {primaryShellDefinition.navigation.map(item => <button key={item.screen}
        className={activeScreen === item.screen ? "bottom-navigation-item active" : "bottom-navigation-item"}
        onClick={() => { onNavigate(item.screen); setSettingsOpen(false); }}
        aria-current={activeScreen === item.screen ? "page" : undefined}>
        <NavigationIcon name={item.icon} /><span>{item.label}</span>
      </button>)}
    </nav>
  </main>;
}
