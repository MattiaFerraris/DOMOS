import { Injectable, Logger } from '@nestjs/common';
import { cloudLogin, TapoDevice } from 'tp-link-tapo-connect';
import * as fs from 'fs';
import * as path from 'path';

// Assicurati che i percorsi siano corretti in base alla tua cartella
import { TapoService } from '../tapo/tapo.service';
import { KasaService } from '../kasa/kasa.service';

export interface TapoDeviceWithState extends TapoDevice {
  device_on: boolean;
}

const CONFIG_PATH = path.join(process.cwd(), 'device-config.json');
const INFO_PATH = path.join(process.cwd(), 'devices-info.json');

@Injectable()
export class TplinkCloudService {
  private readonly logger = new Logger(TplinkCloudService.name);

  readonly email = 'mailDispositiviSmart@gmail.com';
  readonly password = 'hapjin-6mIpky-puhnux';

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
  ) {}

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
      const result: TapoDeviceWithState[] = [];

      for (const d of devices) {
        const ip = ipMap[d.deviceId];
        const protocol = this.getDeviceProtocol(d);

        if (!ip) {
          this.logger.warn(
            `IP mancante per ${d.alias} — aggiungilo a device-config.json`,
          );
          result.push({ ...d, device_on: false });
          continue;
        }

        try {
          let isOn = false;
          // DELEGAZIONE AI LAVORATORI LOCALI
          if (protocol === 'kasa') {
            //isOn = await this.kasaService.getDeviceStatus(ip);
          } else {
            isOn = await this.tapoService.getDeviceStatus(d.deviceId, ip);
          }
          result.push({ ...d, device_on: isOn });
        } catch {
          this.logger.warn(`Impossibile comunicare in locale con ${d.alias}`);
          result.push({ ...d, device_on: false });
        }
      }
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
}
