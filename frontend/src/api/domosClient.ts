import type { SmartDevice } from "../types/types";

const API_BASE = "http://localhost:3000/api";

// Forma grezza di un dispositivo come arriva dal backend
interface RawDevice {
  deviceId: string;
  alias: string;
  deviceModel: string;
  deviceType?: string;
  device_on?: boolean;
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
