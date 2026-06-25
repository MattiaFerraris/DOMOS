import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

export interface ZigbeeDeviceState {
  state?: boolean;
  brightness?: number;
  color?: string;
}

// Dispositivo annunciato da zigbee2mqtt su bridge/devices.
export interface ZigbeeDevice {
  friendlyName: string;
  ieeeAddress: string;
  type: string; // Coordinator | Router | EndDevice
  vendor?: string;
  model?: string;
  description?: string;
  supported: boolean;
  state: ZigbeeDeviceState;
  offline: boolean;
}

// ── Conversioni luminosità (Zigbee 0-254  ↔  UI 0-100%) ───────────
const toPercent = (raw: number): number =>
  Math.round((Math.max(0, Math.min(254, raw)) / 254) * 100);
const toRaw = (pct: number): number =>
  Math.round((Math.max(0, Math.min(100, pct)) / 100) * 254);

// ── Conversioni colore → esadecimale per la UI ────────────────────
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const channelToHex = (v: number) =>
  Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, '0');

// CIE xy (color space delle Philips Hue) → hex sRGB saturato.
function xyToHex(x: number, y: number): string {
  if (y <= 0) return '#ffffff';
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  let r = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
  let g = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
  let b = X * 0.0557 - Y * 0.204 + Z * 1.057;
  const gamma = (c: number) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  r = gamma(r);
  g = gamma(g);
  b = gamma(b);
  // Normalizza sul canale più alto per restituire la tinta a piena saturazione.
  const max = Math.max(r, g, b);
  if (max > 1) {
    r /= max;
    g /= max;
    b /= max;
  }
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

// HSV Zigbee (hue 0-360, saturazione 0-100) → hex a piena luminosità.
function hsvToHex(h: number, s: number): string {
  const sf = s / 100;
  const c = sf;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = 1 - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${channelToHex(r + m)}${channelToHex(g + m)}${channelToHex(b + m)}`;
}

// Estrae un colore hex dal campo "color" di zigbee2mqtt (hex | xy | hue/sat).
function extractColor(data: any): string | undefined {
  if (data?.color_mode === 'color_temp') return 'white';
  const c = data?.color;
  if (!c) return undefined;
  if (typeof c.hex === 'string') return c.hex;
  if (typeof c.x === 'number' && typeof c.y === 'number')
    return xyToHex(c.x, c.y);
  if (typeof c.hue === 'number')
    return hsvToHex(
      c.hue,
      typeof c.saturation === 'number' ? c.saturation : 100,
    );
  return undefined;
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);

  private readonly username: string;
  private readonly password: string;
  private readonly brokerUrl: string;
  private readonly baseTopic: string;

  constructor(private readonly configService: ConfigService) {
    this.username = this.configService.get<string>('MQTT_USERNAME', '');
    this.password = this.configService.get<string>('MQTT_PASSWORD', '');
    this.brokerUrl = this.configService.get<string>('MQTT_BROKER_URL', '');
    this.baseTopic = this.configService.get<string>(
      'ZIGBEE2MQTT_BASE_TOPIC',
      '',
    );
  }

  private client: mqtt.MqttClient | null = null;

  // Lista dispositivi
  private bridgeDevices: Map<string, ZigbeeDevice> = new Map();
  // Ultimo stato
  private deviceStates: Map<string, ZigbeeDeviceState> = new Map();
  // Connessione del coordinatore Zigbee (chiavetta Sonoff) — online/offline
  private bridgeOnline = false;

  onModuleInit(): void {
    this.connect();
  }

  onModuleDestroy(): void {
    this.client?.end(true);
  }

  private connect(): void {
    this.logger.log(`Connessione al broker MQTT ${this.brokerUrl}...`);
    this.client = mqtt.connect(this.brokerUrl, {
      reconnectPeriod: 5000,
      username: this.username,
      password: this.password,
    });

    this.client.on('connect', () => {
      this.logger.log('Broker MQTT connesso');
      this.client!.subscribe(`${this.baseTopic}/#`, (err) => {
        if (err) this.logger.error(`Subscribe fallita: ${err.message}`);
      });
    });

    this.client.on('reconnect', () =>
      this.logger.warn('Riconnessione al broker MQTT...'),
    );
    this.client.on('error', (err) =>
      this.logger.error(`Errore MQTT: ${err.message}`),
    );

    this.client.on('message', (topic, payload) =>
      this.handleMessage(topic, payload),
    );
  }

  private handleMessage(topic: string, payload: Buffer): void {
    const sub = topic.slice(this.baseTopic.length + 1);

    if (sub.endsWith('/set') || sub.endsWith('/get')) return;

    let data: any;
    try {
      data = JSON.parse(payload.toString());
    } catch {
      data = payload.toString();
    }

    // Catalogo dispositivi
    if (sub === 'bridge/devices') {
      this.ingestBridgeDevices(data);
      return;
    }
    // Stato del coordinatore Zigbee
    if (sub === 'bridge/state') {
      const value = typeof data === 'object' ? data?.state : data;
      this.bridgeOnline = value === 'online';
      return;
    }
    // Altri topic di bridge/ (info, logging, groups...)
    if (sub.startsWith('bridge/')) return;

    // Altrimenti è lo stato di un device: topic = friendlyName
    this.ingestDeviceState(sub, data);
  }

  private ingestBridgeDevices(devices: any[]): void {
    if (!Array.isArray(devices)) return;
    const next = new Map<string, ZigbeeDevice>();
    for (const d of devices) {
      // Saltiamo il coordinatore (la chiavetta stessa): non è comandabile.
      if (d.type === 'Coordinator') continue;
      const friendlyName: string = d.friendly_name ?? d.ieee_address;
      next.set(friendlyName, {
        friendlyName,
        ieeeAddress: d.ieee_address,
        type: d.type,
        vendor: d.definition?.vendor,
        model: d.definition?.model,
        description: d.definition?.description,
        supported: d.supported ?? false,
        state: this.deviceStates.get(friendlyName) ?? {},
        offline: d.disabled === true,
      });
    }
    this.bridgeDevices = next;
    this.logger.log(`Catalogo zigbee2mqtt aggiornato (${next.size} device)`);
  }

  private ingestDeviceState(friendlyName: string, data: any): void {
    if (typeof data !== 'object' || data === null) return;

    const prev = this.deviceStates.get(friendlyName) ?? {};
    const next: ZigbeeDeviceState = { ...prev };

    if (data.state === 'ON') next.state = true;
    else if (data.state === 'OFF') next.state = false;

    if (typeof data.brightness === 'number')
      next.brightness = toPercent(data.brightness);

    const color = extractColor(data);
    if (color) next.color = color;

    this.deviceStates.set(friendlyName, next);

    // Riallinea lo stato anche nella voce di catalogo, se presente.
    const dev = this.bridgeDevices.get(friendlyName);
    if (dev) dev.state = next;
  }

  // ── API per il controller ───────────────────────────────────────

  listDevices(): ZigbeeDevice[] {
    return Array.from(this.bridgeDevices.values()).map((d) => ({
      ...d,
      state: this.deviceStates.get(d.friendlyName) ?? d.state,
      offline: d.offline || !this.bridgeOnline,
    }));
  }

  getState(friendlyName: string): ZigbeeDeviceState {
    return this.deviceStates.get(friendlyName) ?? {};
  }

  /** Pubblica un payload sul topic .../set del dispositivo. */
  private publishSet(
    friendlyName: string,
    payload: Record<string, any>,
  ): boolean {
    if (!this.client?.connected) {
      this.logger.error('Comando non inviato: broker MQTT non connesso');
      return false;
    }
    const topic = `${this.baseTopic}/${friendlyName}/set`;
    this.client.publish(topic, JSON.stringify(payload));
    this.logger.log(`→ ${topic} ${JSON.stringify(payload)}`);
    return true;
  }

  /** Accende/spegne il dispositivo. */
  setPower(friendlyName: string, state: boolean): boolean {
    return this.publishSet(friendlyName, { state: state ? 'ON' : 'OFF' });
  }

  /** Imposta luminosità in percentuale (0-100); accende il device. */
  setBrightness(friendlyName: string, brightnessPct: number): boolean {
    return this.publishSet(friendlyName, {
      state: 'ON',
      brightness: toRaw(brightnessPct),
    });
  }

  /** Imposta il colore (hex "#rrggbb"); accende il device. */
  setColor(friendlyName: string, hex: string): boolean {
    return this.publishSet(friendlyName, {
      state: 'ON',
      color: { hex },
    });
  }

  /**
   * Comando luce completo (accensione + luminosità + colore in un solo
   * messaggio). Speculare a TapoService.setLightStripState.
   */
  setLight(
    friendlyName: string,
    state: boolean,
    brightnessPct: number,
    color?: string,
  ): boolean {
    if (!state) {
      return this.publishSet(friendlyName, { state: 'OFF' });
    }
    const payload: Record<string, any> = {
      state: 'ON',
      brightness: toRaw(brightnessPct),
    };
    if (color && /^#?[0-9a-fA-F]{6}$/.test(color)) {
      payload.color = { hex: color.startsWith('#') ? color : `#${color}` };
    }
    return this.publishSet(friendlyName, payload);
  }
}
