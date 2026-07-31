import type {
  SmartDevice,
  DeviceSource,
  OneShotTimer,
  RecurringSchedule,
  DeviceEnergy,
  DeviceInfo,
  NenkoPreset,
  NenkoState,
} from "../types/types";

const API_BASE = import.meta.env.VITE_API_BASE;

// Forma grezza di un dispositivo Tapo/Kasa come arriva dal backend
interface RawDevice {
  deviceId: string;
  alias: string;
  deviceModel: string;
  deviceType?: string;
  device_on?: boolean;
  offline?: boolean;
  brightness?: number;
  color?: string;
}

interface DeviceListResponse {
  status: string;
  data: RawDevice[];
}

// Forma grezza di un dispositivo Zigbee (zigbee2mqtt) come arriva dal backend
interface RawZigbeeDevice {
  friendlyName: string;
  ieeeAddress: string;
  vendor?: string;
  model?: string;
  description?: string;
  offline?: boolean;
  state?: { state?: boolean; brightness?: number; color?: string };
}

interface ZigbeeListResponse {
  status: string;
  data: RawZigbeeDevice[];
}

// Preset colore (nomi usati da LightControls) → hex, richiesto dal backend Zigbee
const COLOR_NAME_TO_HEX: Record<string, string> = {
  white: "#ffffff",
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff",
  yellow: "#ffff00",
};

// Normalizza un colore (nome o hex) in hex "#rrggbb"
function toHex(color: string): string {
  if (/^#?[0-9a-fA-F]{6}$/.test(color)) {
    return color.startsWith("#") ? color : `#${color}`;
  }
  return COLOR_NAME_TO_HEX[color.toLowerCase()] ?? "#ffffff";
}

// Recupera i dispositivi Tapo/Kasa e li normalizza in SmartDevice
async function fetchTapoDevices(): Promise<SmartDevice[]> {
  const res = await fetch(`${API_BASE}/tapo/list`);
  const data: DeviceListResponse = await res.json();
  if (data.status !== "OK") return [];

  return data.data.map((d) => ({
    ...d,
    isOn: d.device_on || false,
    brightness: d.brightness || 100,
    color: d.color || "white",
    offline: d.offline || false,
    source: "tapo" as DeviceSource,
  }));
}

// Recupera i dispositivi Zigbee (Philips Hue) e li normalizza in SmartDevice
async function fetchZigbeeDevices(): Promise<SmartDevice[]> {
  try {
    const res = await fetch(`${API_BASE}/zigbee/list`);
    const data: ZigbeeListResponse = await res.json();
    if (data.status !== "OK") return [];

    return data.data.map((d) => ({
      // Su Zigbee l'identificatore comandabile è il friendlyName
      deviceId: d.friendlyName,
      alias: d.friendlyName,
      deviceModel: d.model || "Zigbee",
      deviceType: d.description ?? d.vendor,
      isOn: d.state?.state ?? false,
      brightness: d.state?.brightness ?? 100,
      color: d.state?.color ?? "white",
      offline: d.offline ?? false,
      source: "zigbee" as DeviceSource,
    }));
  } catch {
    // Broker MQTT non raggiungibile: ignora i device Zigbee, mostra solo gli altri
    return [];
  }
}

// Recupera tutti i dispositivi (Tapo/Kasa + Zigbee) in un'unica lista
export async function fetchDevices(): Promise<SmartDevice[]> {
  const [tapo, zigbee] = await Promise.all([
    fetchTapoDevices(),
    fetchZigbeeDevices(),
  ]);
  return [...tapo, ...zigbee];
}

// Accende/spegne un dispositivo (instrada sul backend giusto)
export async function setPower(
  deviceId: string,
  state: boolean,
  source: DeviceSource = "tapo",
): Promise<void> {
  const endpoint =
    source === "zigbee" ? `${API_BASE}/zigbee/power` : `${API_BASE}/tapo/power`;
  // Lo zigbee identifica il device come 'device', il tapo come 'deviceId'
  const body =
    source === "zigbee" ? { device: deviceId, state } : { deviceId, state };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Network error");
}

// Applica stato/colore/luminosità a una luce LED (instrada sul backend giusto)
export async function setLight(
  deviceId: string,
  state: boolean,
  color: string,
  brightness: number,
  source: DeviceSource = "tapo",
): Promise<void> {
  const endpoint =
    source === "zigbee" ? `${API_BASE}/zigbee/light` : `${API_BASE}/tapo/light`;
  const body =
    source === "zigbee"
      ? { device: deviceId, state, color: toHex(color), brightness }
      : { deviceId, state, color, brightness };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Network error");
}

// La lista preset arriva dal file nenko-buttons.json
export async function fetchNenkoPresets(): Promise<NenkoPreset[]> {
  try {
    const res = await fetch(`${API_BASE}/nenko/presets`);
    const data = await res.json();
    return data.status === "OK" ? data.data : [];
  } catch {
    return [];
  }
}

export async function fetchNenkoState(): Promise<NenkoState> {
  try {
    const res = await fetch(`${API_BASE}/nenko/state`);
    const data = await res.json();
    return data.status === "OK" ? data.data : {};
  } catch {
    return {};
  }
}

// Invia un colore/effetto di preset
export async function sendNenkoPreset(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/nenko/preset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Network error");
}

// ── Energia & Info ────────────────────────────────────────────────
export async function fetchEnergy(deviceId: string): Promise<DeviceEnergy> {
  const res = await fetch(
    `${API_BASE}/tapo/energy?deviceId=${encodeURIComponent(deviceId)}`,
  );
  const data = await res.json();
  return data.status === "OK" ? data.data : { supported: false };
}

export async function fetchDeviceInfo(deviceId: string): Promise<DeviceInfo> {
  const res = await fetch(
    `${API_BASE}/tapo/info?deviceId=${encodeURIComponent(deviceId)}`,
  );
  const data = await res.json();
  return data.status === "OK" ? data.data : {};
}

// ── Timer one-shot ────────────────────────────────────────────────
export async function listTimers(): Promise<OneShotTimer[]> {
  const res = await fetch(`${API_BASE}/scheduler/timers`);
  const data = await res.json();
  return data.status === "OK" ? data.data : [];
}

export async function addTimer(
  deviceId: string,
  delayMinutes: number,
  targetState: boolean,
): Promise<void> {
  const res = await fetch(`${API_BASE}/scheduler/timer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, delayMinutes, targetState }),
  });
  if (!res.ok) throw new Error("Network error");
}

export async function cancelTimer(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/scheduler/timer/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Network error");
}

// ── Schedulazioni ricorrenti ──────────────────────────────────────
export async function listSchedules(): Promise<RecurringSchedule[]> {
  const res = await fetch(`${API_BASE}/scheduler/schedules`);
  const data = await res.json();
  return data.status === "OK" ? data.data : [];
}

export async function addSchedule(
  input: Omit<RecurringSchedule, "id">,
): Promise<void> {
  const res = await fetch(`${API_BASE}/scheduler/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Network error");
}

export async function updateSchedule(
  id: string,
  patch: Partial<Omit<RecurringSchedule, "id">>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/scheduler/schedule/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Network error");
}

export async function deleteSchedule(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/scheduler/schedule/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Network error");
}
