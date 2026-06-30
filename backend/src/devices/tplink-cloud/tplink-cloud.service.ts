import { Injectable, Logger } from '@nestjs/common';
import { cloudLogin, TapoDevice } from 'tp-link-tapo-connect';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

// Assicurati che i percorsi siano corretti in base alla tua cartella
import { TapoService } from '../tapo/tapo.service';
import { KasaService } from '../kasa/kasa.service';

export interface TapoDeviceWithState extends TapoDevice {
  device_on: boolean;
  offline?: boolean;
  brightness?: number; // solo luci LED
  color?: string; // solo luci LED (hex o "white")
}

// DTO normalizzati comuni a Tapo e Kasa
export interface DeviceEnergy {
  supported: boolean;
  powerW?: number;
  todayKwh?: number;
  monthKwh?: number;
  voltage?: number;
}

export interface DeviceInfo {
  rssi?: number;
  signal?: number;
  overheated?: boolean;
  firmware?: string;
  ssid?: string;
}

const CONFIG_PATH = path.join(process.cwd(), 'device-config.json');
const INFO_PATH = path.join(process.cwd(), 'devices-info.json');

@Injectable()
export class TplinkCloudService {
  private readonly logger = new Logger(TplinkCloudService.name);

  private readonly email: string;
  private readonly password: string;

  private cloudApi: Awaited<ReturnType<typeof cloudLogin>> | null = null;
  private cloudApiExpiry = 0;

  private cachedDevices: TapoDevice[] = [];
  private devicesExpiry = 0;

  private cloudConnectionPromise: Promise<
    Awaited<ReturnType<typeof cloudLogin>>
  > | null = null;
  private cachedDevicesPromise: Promise<TapoDevice[]> | null = null;
  private getDevicesListPromise: Promise<TapoDeviceWithState[]> | null = null;

  // Iniezione dei due "Lavoratori"
  constructor(
    private readonly tapoService: TapoService,
    private readonly kasaService: KasaService,
    private readonly configService: ConfigService,
  ) {
    this.email = this.configService.get<string>('TPLINK_EMAIL', '');
    this.password = this.configService.get<string>('TPLINK_PASSWORD', '');
  }

  // ── Helper ──────────────────────────────────────────────────────
  private loadIpMap(): Record<string, string> {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return JSON.parse(raw) as Record<string, string>;
      }
    } catch {
      this.logger.error('Impossibile leggere device-config.json');
    }
    return {};
  }

  private saveDevicesInfoToDisk(devices: TapoDevice[]): void {
    try {
      const info = devices.map((d) => ({
        deviceId: d.deviceId,
        alias: d.alias,
        deviceModel: d.deviceModel,
        deviceMac: d.deviceMac,
        deviceType: d.deviceType,
      }));
      fs.writeFileSync(INFO_PATH, JSON.stringify(info, null, 2));
      this.logger.log(
        `devices-info.json aggiornato su disco (${info.length} dispositivi)`,
      );
    } catch (error) {
      this.logger.error(
        `Errore scrittura devices-info.json: ${(error as Error).message}`,
      );
    }
  }

  // Timeout massimo (ms) per ogni interrogazione locale di un dispositivo.
  // Serve a non restare appesi quando un IP in device-config.json è vecchio:
  // la libreria Tapo, dopo il fallimento KLAP, cade in login "legacy" senza
  // timeout proprio e bloccherebbe l'intera lista. Vedi withTimeout().
  private static readonly DEVICE_TIMEOUT_MS = 4000;

  // Avvolge una promise con un timeout: se non si risolve entro `ms`, rigetta.
  // NB: la richiesta sottostante non viene annullata, ma il Coordinatore non
  // resta più bloccato e marca il dispositivo come offline.
  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timeout (${ms}ms) comunicando con ${label}`)),
        ms,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private getDeviceProtocol(device: TapoDevice): 'tapo' | 'kasa' {
    if (
      device.deviceType &&
      device.deviceType.toUpperCase().startsWith('IOT.')
    ) {
      return 'kasa';
    }
    if (
      device.deviceModel &&
      (device.deviceModel.startsWith('HS') ||
        device.deviceModel.startsWith('KP'))
    ) {
      return 'kasa';
    }
    return 'tapo';
  }

  // ── Cloud ───────────────────────────────────────────────────────
  private async getCloudConnection() {
    const now = Date.now();
    if (this.cloudApi && now <= this.cloudApiExpiry) return this.cloudApi;
    if (this.cloudConnectionPromise) return this.cloudConnectionPromise;

    this.cloudConnectionPromise = (async () => {
      const api = await cloudLogin(this.email, this.password);
      this.cloudApi = api;
      this.cloudApiExpiry = Date.now() + 30 * 60 * 1000;
      this.logger.log('Cloud login rinnovato');
      return api;
    })();

    try {
      return await this.cloudConnectionPromise;
    } finally {
      this.cloudConnectionPromise = null;
    }
  }

  private async getCachedDevices(): Promise<TapoDevice[]> {
    const now = Date.now();
    if (this.cachedDevices.length && now <= this.devicesExpiry)
      return this.cachedDevices;
    if (this.cachedDevicesPromise) return this.cachedDevicesPromise;

    this.cachedDevicesPromise = (async () => {
      const cloudApi = await this.getCloudConnection();
      const devices = await cloudApi.listDevices();

      this.cachedDevices = devices;
      this.devicesExpiry = Date.now() + 5 * 60 * 1000;
      this.logger.log(
        `Device list aggiornata dal Cloud (${this.cachedDevices.length} dispositivi)`,
      );

      this.saveDevicesInfoToDisk(devices);

      return devices;
    })();

    try {
      return await this.cachedDevicesPromise;
    } finally {
      this.cachedDevicesPromise = null;
    }
  }

  // ── IL COORDINATORE (Smistamento Lista) ─────────────────────────
  async getDevicesList(): Promise<TapoDeviceWithState[]> {
    if (this.getDevicesListPromise) return this.getDevicesListPromise;

    this.getDevicesListPromise = (async () => {
      const devices = await this.getCachedDevices();
      const ipMap = this.loadIpMap();

      // Interroghiamo tutti i dispositivi in parallelo: così la lista torna nel
      // tempo del device più lento (max DEVICE_TIMEOUT_MS) e non nella somma.
      // Promise.all preserva l'ordine dell'array di partenza.
      const result = await Promise.all(
        devices.map(async (d): Promise<TapoDeviceWithState> => {
          const ip = ipMap[d.deviceId];
          const protocol = this.getDeviceProtocol(d);

          if (!ip) {
            this.logger.warn(
              `IP mancante per ${d.alias} — aggiungilo a device-config.json`,
            );
            return { ...d, device_on: false, offline: true };
          }

          try {
            // DELEGAZIONE AI LAVORATORI LOCALI (con timeout per IP morti)
            const startTime: number = Date.now();
            if (protocol === 'kasa') {
              const isOn = await this.withTimeout(
                this.kasaService.getDeviceStatus(ip),
                TplinkCloudService.DEVICE_TIMEOUT_MS,
                `${d.alias} (kasa)`,
              );
              this.logger.log(
                `Stato ${d.alias} (kasa) → ${isOn} in ${Date.now() - startTime}ms`,
              );
              return { ...d, device_on: isOn };
            } else {
              // Tapo: leggiamo lo stato completo (acceso + luminosità + colore)
              const state = await this.withTimeout(
                this.tapoService.getDeviceState(d.deviceId, ip),
                TplinkCloudService.DEVICE_TIMEOUT_MS,
                `${d.alias} (tapo)`,
              );
              this.logger.log(
                `Stato ${d.alias} (tapo) → ${state.device_on} in ${Date.now() - startTime}ms`,
              );
              return { ...d, ...state };
            }
          } catch (error) {
            this.logger.warn(
              `Impossibile comunicare in locale con ${d.alias}: ${(error as Error).message}`,
            );
            return { ...d, device_on: false, offline: true };
          }
        }),
      );

      return result;
    })();

    try {
      return await this.getDevicesListPromise;
    } finally {
      this.getDevicesListPromise = null;
    }
  }

  // ── ROUTING DEI COMANDI (Ecco i metodi che mancavano!) ──────────

  /**
   * Metodo chiamato dal Controller per accendere/spegnere una presa
   */
  async setDevicePower(deviceId: string, state: boolean): Promise<boolean> {
    const ip = this.loadIpMap()[deviceId];
    if (!ip) {
      this.logger.error(
        `Tentativo di comando fallito: IP mancante per ${deviceId}`,
      );
      return false;
    }

    // Troviamo il dispositivo dalla cache per capire se è Tapo o Kasa
    const devices = await this.getCachedDevices();
    const targetDevice = devices.find((d) => d.deviceId === deviceId);

    // Se non lo trova, prova di default con Tapo
    const protocol = targetDevice
      ? this.getDeviceProtocol(targetDevice)
      : 'tapo';

    // Lo smistiamo allo specialista giusto
    if (protocol === 'kasa') {
      return await this.kasaService.setPowerState(ip, state);
    } else {
      return await this.tapoService.setPowerState(deviceId, ip, state);
    }
  }

  /**
   * Metodo chiamato dal Controller per gestire le luci
   */
  async setDeviceLight(
    deviceId: string,
    state: boolean,
    brightness: number,
    color: string,
  ): Promise<boolean> {
    const ip = this.loadIpMap()[deviceId];
    if (!ip) {
      this.logger.error(
        `Tentativo di comando luce fallito: IP mancante per ${deviceId}`,
      );
      return false;
    }

    // Passiamo il comando direttamente allo specialista Tapo
    // (dato che le tue luci L900 sono Tapo)
    return await this.tapoService.setLightStripState(
      deviceId,
      ip,
      state,
      brightness,
      color,
    );
  }

  // ── ENERGIA & INFO (instradamento + normalizzazione) ────────────

  // Risolve ip e protocollo di un dispositivo dalla cache
  private async resolveDevice(
    deviceId: string,
  ): Promise<{ ip: string; protocol: 'tapo' | 'kasa' } | null> {
    const ip = this.loadIpMap()[deviceId];
    if (!ip) return null;
    const devices = await this.getCachedDevices();
    const target = devices.find((d) => d.deviceId === deviceId);
    const protocol = target ? this.getDeviceProtocol(target) : 'tapo';
    return { ip, protocol };
  }

  async getDeviceEnergy(deviceId: string): Promise<DeviceEnergy> {
    const resolved = await this.resolveDevice(deviceId);
    if (!resolved) return { supported: false };

    try {
      if (resolved.protocol === 'kasa') {
        const r = await this.kasaService.getEnergy(resolved.ip);
        if (!r) return { supported: false };
        const powerW =
          r.power ?? (r.power_mw != null ? r.power_mw / 1000 : undefined);
        const voltage =
          r.voltage ?? (r.voltage_mv != null ? r.voltage_mv / 1000 : undefined);
        const totalKwh =
          r.total ?? (r.total_wh != null ? r.total_wh / 1000 : undefined);
        return { supported: true, powerW, voltage, todayKwh: totalKwh };
      }

      const r = await this.tapoService.getEnergyUsage(deviceId, resolved.ip);
      if (!r || r.current_power == null) return { supported: false };
      return {
        supported: true,
        powerW: r.current_power / 1000, // mW → W
        todayKwh: r.today_energy != null ? r.today_energy / 1000 : undefined,
        monthKwh: r.month_energy != null ? r.month_energy / 1000 : undefined,
      };
    } catch {
      return { supported: false };
    }
  }

  async getDeviceInfo(deviceId: string): Promise<DeviceInfo> {
    const resolved = await this.resolveDevice(deviceId);
    if (!resolved) return {};

    try {
      if (resolved.protocol === 'kasa') {
        const s = await this.kasaService.getInfo(resolved.ip);
        return {
          rssi: s.rssi,
          firmware: s.sw_ver,
        };
      }

      const i = await this.tapoService.getFullInfo(deviceId, resolved.ip);
      return {
        rssi: i.rssi,
        signal: i.signal_level,
        overheated: i.overheated,
        firmware: i.fw_ver,
        ssid: i.ssid,
      };
    } catch {
      return {};
    }
  }
}
