import type {
  SmartDevice,
  OneShotTimer,
  RecurringSchedule,
  DeviceEnergy,
  DeviceInfo,
} from "../types/types";

const API_BASE = "http://localhost:3000/api";

// Forma grezza di un dispositivo come arriva dal backend
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

// Recupera la lista dei dispositivi e normalizza i campi dal backend
export async function fetchDevices(): Promise<SmartDevice[]> {
  const res = await fetch(`${API_BASE}/tapo/list`);
  const data: DeviceListResponse = await res.json();

  if (data.status !== "OK") return [];

  return data.data.map((d) => ({
    ...d,
    // MAPPATURA CRUCIALE: Il backend manda 'device_on', React usa 'isOn'
    isOn: d.device_on || false,
    brightness: d.brightness || 100,
    color: d.color || "white",
    offline: d.offline || false,
  }));
}

// Accende/spegne una presa smart
export async function setPower(
  deviceId: string,
  state: boolean,
): Promise<void> {
  const response = await fetch(`${API_BASE}/tapo/power`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, state }),
  });
  if (!response.ok) throw new Error("Network error");
}

// Applica stato/colore/luminosità a una luce LED
export async function setLight(
  deviceId: string,
  state: boolean,
  color: string,
  brightness: number,
): Promise<void> {
  const response = await fetch(`${API_BASE}/tapo/light`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, state, color, brightness }),
  });
  if (!response.ok) throw new Error("Network error");
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
