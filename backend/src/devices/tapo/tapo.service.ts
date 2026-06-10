import { Injectable, Logger } from '@nestjs/common';
import { cloudLogin, loginDeviceByIp } from 'tp-link-tapo-connect';
import type { TapoDevice } from 'tp-link-tapo-connect/dist/types';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'device-config.json');

export interface TapoDeviceWithState extends TapoDevice {
  device_on: boolean;
}

type DeviceConnection = Awaited<ReturnType<typeof loginDeviceByIp>>;

@Injectable()
export class TapoService {
  private readonly logger = new Logger(TapoService.name);

  readonly email = 'mailDispositiviSmart@gmail.com';
  readonly password = 'hapjin-6mIpky-puhnux';

  private cloudApi: Awaited<ReturnType<typeof cloudLogin>> | null = null;
  private cloudApiExpiry = 0;

  private cachedDevices: TapoDevice[] = [];
  private devicesExpiry = 0;

  private ipMap: Record<string, string> = {};
  private activeSessions = new Map<string, DeviceConnection>();

  private cloudConnectionPromise: Promise<
    Awaited<ReturnType<typeof cloudLogin>>
  > | null = null;
  private cachedDevicesPromise: Promise<TapoDevice[]> | null = null;
  private getDevicesListPromise: Promise<TapoDeviceWithState[]> | null = null;

  // ── Cloud ───────────────────────────────────────────────────────

  private async getCloudConnection() {
    const now = Date.now();

    // Se la cache è valida, la restituiamo subito
    if (this.cloudApi && now <= this.cloudApiExpiry) {
      return this.cloudApi;
    }

    // Se c'è già un login in corso, ASPETTIAMO quello invece di farne uno nuovo!
    if (this.cloudConnectionPromise) {
      return this.cloudConnectionPromise;
    }

    // Altrimenti, avviamo il login e lo salviamo nella variabile "promise"
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
      // Quando ha finito (con successo o errore), puliamo la promessa in corso
      this.cloudConnectionPromise = null;
    }
  }

  private async getCachedDevices(): Promise<TapoDevice[]> {
    const now = Date.now();

    // Cache valida? Restituisci i dati
    if (this.cachedDevices.length && now <= this.devicesExpiry) {
      return this.cachedDevices;
    }

    // Scansione già in corso? Aspetta quella!
    if (this.cachedDevicesPromise) {
      return this.cachedDevicesPromise;
    }

    this.cachedDevicesPromise = (async () => {
      const cloudApi = await this.getCloudConnection();
      const devices = await cloudApi.listDevices();
      this.cachedDevices = devices;
      this.devicesExpiry = Date.now() + 5 * 60 * 1000;
      this.logger.log(
        `Device list aggiornata (${this.cachedDevices.length} dispositivi)`,
      );
      return devices;
    })();

    try {
      return await this.cachedDevicesPromise;
    } finally {
      this.cachedDevicesPromise = null;
    }
  }

  // ── Connessione locale ──────────────────────────────────────────

  private async connectById(
    deviceId: string,
  ): Promise<DeviceConnection | null> {
    if (this.activeSessions.has(deviceId)) {
      return this.activeSessions.get(deviceId)!;
    }

    if (!Object.keys(this.ipMap).length) {
      try {
        this.ipMap = JSON.parse(
          fs.readFileSync(CONFIG_PATH, 'utf-8'),
        ) as Record<string, string>;
      } catch {
        this.logger.error('device-config.json non trovato o non valido');
        return null;
      }
    }

    const ip = this.ipMap[deviceId];
    if (!ip) {
      this.logger.error(
        `IP non trovato per ${deviceId} — aggiungi il dispositivo a device-config.json`,
      );
      return null;
    }

    const session = await loginDeviceByIp(this.email, this.password, ip);
    this.activeSessions.set(deviceId, session);
    return session;
  }

  // ── API pubblica ────────────────────────────────────────────────

  async getDevicesList(): Promise<TapoDeviceWithState[]> {
    // Se un'altra richiesta sta già elaborando la lista, ci accodiamo e aspettiamo
    if (this.getDevicesListPromise) {
      return this.getDevicesListPromise;
    }

    // Altrimenti, facciamo noi il lavoro "sporco"
    this.getDevicesListPromise = (async () => {
      const devices = await this.getCachedDevices();
      const result: TapoDeviceWithState[] = [];

      for (const d of devices) {
        try {
          const device = await this.connectById(d.deviceId);
          if (!device) {
            result.push({ ...d, device_on: false });
            continue;
          }
          const info = await device.getDeviceInfo();
          result.push({ ...d, device_on: info.device_on });
        } catch {
          this.activeSessions.delete(d.deviceId);
          this.logger.warn(`Fallback stato per ${d.alias}`);
          result.push({ ...d, device_on: false });
        }
      }

      // Ora questo verrà eseguito UNA SOLA VOLTA per ogni raffica di richieste
      void this.getDevicesInfo();
      return result;
    })();

    try {
      return await this.getDevicesListPromise;
    } finally {
      // Puliamo la promessa alla fine
      this.getDevicesListPromise = null;
    }
  }

  // --- Cambiamenti di stato -------------------------------

  async setPowerStateById(deviceId: string, state: boolean): Promise<boolean> {
    try {
      const device = await this.connectById(deviceId);
      if (!device) return false;
      if (state) await device.turnOn();
      else await device.turnOff();
      this.logger.log(`Dispositivo ${deviceId} → ${state}`);
      return true;
    } catch (error) {
      this.activeSessions.delete(deviceId);
      this.logger.error(`Errore setPowerState: ${(error as Error).message}`);
      return false;
    }
  }

  async setLightStripState(
    deviceId: string,
    state: boolean,
    brightness: number,
    color: string,
  ): Promise<boolean> {
    try {
      const device = await this.connectById(deviceId);
      if (!device) return false;
      if (state) {
        await device.turnOn();
        await device.setBrightness(brightness);
        await device.setColour(color);
        this.logger.log(`LED ${deviceId} ACCESA (${color}, ${brightness}%)`);
      } else {
        await device.turnOff();
        this.logger.log(`LED ${deviceId} SPENTA`);
      }
      return true;
    } catch (error) {
      this.activeSessions.delete(deviceId);
      this.logger.error(`Errore setLightStrip: ${(error as Error).message}`);
      return false;
    }
  }

  // per salvare info in un file
  async getDevicesInfo(): Promise<
    {
      deviceId: string;
      alias: string;
      deviceModel: string;
      deviceMac: string;
    }[]
  > {
    const devices = await this.getCachedDevices();
    const info = devices.map((d) => ({
      deviceId: d.deviceId,
      alias: d.alias,
      deviceModel: d.deviceModel,
      deviceMac: d.deviceMac,
    }));

    // Scrive un file leggibile nella root del progetto
    const logPath = path.join(process.cwd(), 'devices-info.json');
    fs.writeFileSync(logPath, JSON.stringify(info, null, 2));
    this.logger.log(
      `devices-info.json aggiornato (${info.length} dispositivi)`,
    );

    return info;
  }
}
