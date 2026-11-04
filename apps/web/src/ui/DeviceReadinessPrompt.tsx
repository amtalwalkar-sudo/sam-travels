import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceReadinessStatus, isAndroidRuntime, openDeviceReadinessSetting, type ReadinessItem } from "../platform/device-readiness";

export function DeviceReadinessPrompt() {
  const [items, setItems] = useState<ReadinessItem[]>([]);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [showRecommended, setShowRecommended] = useState(false);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(true);
  const dismissed = useRef(false);
  const autoOpened = useRef(false);

  const refresh = useCallback(async () => {
    if (!isAndroidRuntime()) return;
    try {
      const status = await getDeviceReadinessStatus();
      setItems(status.items);
      setDeviceLabel([status.manufacturer, status.model].filter(Boolean).join(" "));
      const missingRequired = status.items.some((item) => item.required && !item.granted);
      if (missingRequired && !dismissed.current) {
        autoOpened.current = true;
        setOpen(true);
      } else if (!missingRequired && autoOpened.current) {
        autoOpened.current = false;
        setOpen(false);
      }
      setChecking(false);
    } catch {
      setChecking(false);
      setMessage("Phone settings could not be checked. Tap Phone settings to retry.");
    }
  }, []);

  useEffect(() => {
    if (!isAndroidRuntime()) return;
    void refresh();
    const onResume = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [refresh]);

  const openPhoneSetting = async (item: ReadinessItem) => {
    setMessage("");
    try {
      await openDeviceReadinessSetting(item.id);
    } catch {
      setMessage("Could not open that settings page. In Android Settings, open Apps and select Sam Travels.");
    }
  };

  if (!isAndroidRuntime()) return null;
  const missing = items.filter((item) => !item.granted);
  const requiredMissing = missing.filter((item) => item.required);
  const recommendedMissing = missing.filter((item) => !item.required);
  const visibleItems = showRecommended ? missing : requiredMissing.length ? requiredMissing : recommendedMissing;

  return (
    <>
      <button className="device-readiness-trigger" type="button" onClick={() => {
        dismissed.current = false;
        setShowRecommended(true);
        setOpen(true);
        setChecking(true);
        void refresh();
      }} aria-label="Review phone settings">
        <span className={requiredMissing.length ? "device-readiness-dot attention" : "device-readiness-dot"} />
        Phone settings{requiredMissing.length > 0 ? ` · ${requiredMissing.length}` : ""}
      </button>
      {open && (
        <div className="device-readiness-backdrop" role="presentation">
          <section className="device-readiness-dialog" role="dialog" aria-modal="true" aria-labelledby="device-readiness-title">
            <div className="device-readiness-heading">
              <div><small>DEVICE SETUP</small><h2 id="device-readiness-title">Get your phone ready</h2></div>
              <button className="device-readiness-close" type="button" onClick={() => { dismissed.current = true; setOpen(false); }} aria-label="Close">×</button>
            </div>
            <p className="device-readiness-intro">Tap a missing setting to open the closest matching Android settings screen. Return here and Sam Travels will check it again.</p>
            {deviceLabel && <p className="device-readiness-device">Detected device: {deviceLabel}</p>}
            {checking && <p className="device-readiness-hint">Checking phone settings…</p>}
            {!checking && visibleItems.length === 0 && <div className="device-readiness-all-good">All relevant settings are ready.</div>}
            <div className="device-readiness-list">
              {visibleItems.map((item) => (
                <button className="device-readiness-item" key={item.id} type="button" onClick={() => void openPhoneSetting(item)}>
                  <span className={item.required ? "device-readiness-mark required" : "device-readiness-mark"}>{item.required ? "!" : "↗"}</span>
                  <span className="device-readiness-copy">
                    <strong>{item.title}</strong><small>{item.description}</small>
                    <em>{item.required ? "Essential for driver location actions" : "Recommended for optional background reliability"}</em>
                  </span>
                  <span className="device-readiness-action">Open</span>
                </button>
              ))}
            </div>
            {message && <p className="device-readiness-error" role="alert">{message}</p>}
            {recommendedMissing.length > 0 && requiredMissing.length > 0 && (
              <button className="device-readiness-more" type="button" onClick={() => setShowRecommended((value) => !value)}>
                {showRecommended ? "Show essential settings only" : `Also show ${recommendedMissing.length} recommended setting(s)`}
              </button>
            )}
            <div className="device-readiness-footer">
              <span>Settings are verified when you return.</span>
              <button type="button" onClick={() => { dismissed.current = true; setOpen(false); }}>Continue to app</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
