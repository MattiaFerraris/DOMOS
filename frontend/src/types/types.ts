// Backend che controlla il dispositivo (instrada i comandi sul controller giusto)
export type DeviceSource = "tapo" | "zigbee";

// Tipo generico multivendor per i dispositivi smart
export interface SmartDevice {
  deviceId: string;
  alias: string;
  isOn: boolean;
  offline?: boolean;
  deviceModel: string;
  deviceType?: string; // Arriva dal cloud
  brightness?: number;
  color?: string;
  source?: DeviceSource; // "tapo" (default) o "zigbee" (Philips Hue via MQTT)
}

// ── Nenko (luce sensoriale via dongle nRF52840 → 802.15.4) ────────
export interface NenkoPreset {
  name: string; // id interno (chiave in nenko-buttons.json)
  label: string; // etichetta mostrata sul pulsante
  tipo: string; // "colore" | "effetto"
  rgb?: string; // hex "#rrggbb" (solo per i colori)
}

export interface NenkoState {
  color?: string; // nome dell'ultimo preset inviato
}

// Aggiornamenti applicabili a una luce
export interface LightUpdates {
  state?: boolean;
  color?: string;
  brightness?: number;
}

// Timer one-shot pianificato lato server
export interface OneShotTimer {
  id: string;
  deviceId: string;
  targetState: boolean; // true = accendi, false = spegni
  fireAt: number; // timestamp epoch (ms) in cui scatta
}

// Schedulazione ricorrente (accendi/spegni a orario/giorni fissi)
export interface RecurringSchedule {
  id: string;
  deviceId: string;
  targetState: boolean;
  time: string; // "HH:MM"
  days: number[]; // 0=Domenica .. 6=Sabato
  enabled: boolean;
}

// Consumo energetico normalizzato
export interface DeviceEnergy {
  supported: boolean;
  powerW?: number;
  todayKwh?: number;
  monthKwh?: number;
  voltage?: number;
}

// Informazioni dispositivo normalizzate
export interface DeviceInfo {
  rssi?: number;
  signal?: number;
  overheated?: boolean;
  firmware?: string;
  ssid?: string;
}

// Determina se un dispositivo è una luce LED a partire dal modello
export function isLightDevice(device: SmartDevice): boolean {
  // I dispositivi Zigbee gestiti (Philips Hue) sono luci.
  if (device.source === "zigbee") return true;
  const model = device.deviceModel.toUpperCase();
  return model.includes("L") || model.includes("BULB");
}

// Determina la marca del dispositivo (Hue / Kasa / Tapo)
export function getBrand(device: SmartDevice): "HUE" | "KASA" | "TAPO" {
  if (device.source === "zigbee") return "HUE";
  const isKasa =
    device.deviceType?.toUpperCase().startsWith("IOT.") ||
    device.deviceModel.toUpperCase().startsWith("HS");
  return isKasa ? "KASA" : "TAPO";
}
