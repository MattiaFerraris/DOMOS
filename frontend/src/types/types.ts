// Tipo generico multivendor per i dispositivi smart
export interface SmartDevice {
  deviceId: string;
  alias: string;
  isOn: boolean;
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

// Timer pianificato lato client per una presa
export interface DeviceTimer {
  deviceId: string;
  targetState: boolean; // true = accendi, false = spegni
  fireAt: number; // timestamp epoch (ms) in cui scatta
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
