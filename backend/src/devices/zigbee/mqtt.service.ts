import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as mqtt from 'mqtt';

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const BASE_TOPIC = process.env.ZIGBEE2MQTT_BASE_TOPIC ?? 'zigbee2mqtt';

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

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);

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
    this.logger.log(`Connessione al broker MQTT ${BROKER_URL}...`);
    this.client = mqtt.connect(BROKER_URL, {
      reconnectPeriod: 5000,
      // username/password: aggiungili qui se il broker li richiede
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });

    this.client.on('connect', () => {
      this.logger.log('Broker MQTT connesso');
      this.client!.subscribe(`${BASE_TOPIC}/#`, (err) => {
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
    const sub = topic.slice(BASE_TOPIC.length + 1);

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

    if (data.color?.hex) next.color = data.color.hex;

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
    const topic = `${BASE_TOPIC}/${friendlyName}/set`;
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
