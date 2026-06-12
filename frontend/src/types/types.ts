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
  onTimeSec?: number;
  overheated?: boolean;
  firmware?: string;
  ssid?: string;
}

// Determina se un dispositivo è una luce LED a partire dal modello
export function isLightDevice(device: SmartDevice): boolean {
  const model = device.deviceModel.toUpperCase();
  return model.includes("L") || model.includes("BULB");
}

// Determina la marca del dispositivo (Kasa vs Tapo)
export function getBrand(device: SmartDevice): "KASA" | "TAPO" {
  const isKasa =
    device.deviceType?.toUpperCase().startsWith("IOT.") ||
    device.deviceModel.toUpperCase().startsWith("HS");
  return isKasa ? "KASA" : "TAPO";
}
