import { Capacitor, registerPlugin } from "@capacitor/core";

export type ReadinessItem = {
  id: string;
  title: string;
  description: string;
  granted: boolean;
  required: boolean;
};

type DeviceReadinessApi = {
  getStatus(): Promise<{
    items: ReadinessItem[];
    manufacturer: string;
    model: string;
    androidVersion: number;
  }>;
  openSetting(options: { setting: string }): Promise<{
    opened: boolean;
    usedFallback: boolean;
  }>;
};

const DeviceReadiness = registerPlugin<DeviceReadinessApi>("DeviceReadiness");

/** Platform adapter: keep Capacitor plugin access outside presentation components. */
export function isAndroidRuntime(): boolean {
  return Capacitor.getPlatform() === "android";
}

export function getDeviceReadinessStatus() {
  return DeviceReadiness.getStatus();
}

export function openDeviceReadinessSetting(setting: string) {
  return DeviceReadiness.openSetting({ setting });
}
