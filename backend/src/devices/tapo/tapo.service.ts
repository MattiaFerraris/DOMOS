import { Injectable, Logger } from '@nestjs/common';
import { cloudLogin, loginDevice } from 'tp-link-tapo-connect';

@Injectable()
export class TapoService {
  private readonly logger = new Logger(TapoService.name);

  readonly email = 'mailDispositiviSmart@gmail.com';
  readonly password = 'hapjin-6mIpky-puhnux';

  // Funzione di utilità interna per fare il login al Cloud
  private async getCloudConnection() {
    if (!this.email || !this.password) {
      throw new Error('Credenziali Tapo mancanti nel file .env');
    }
    return await cloudLogin(this.email, this.password);
  }

  // 1. Recupera la lista di TUTTE le prese associate all'account
  async getPlugsList() {
    try {
      const cloudApi = await this.getCloudConnection();
      const devices = await cloudApi.listDevicesByType('SMART.TAPOPLUG');

      // Per ogni device, arricchisci con lo stato reale del relè
      const devicesWithRealState = await Promise.all(
        devices.map(async (d) => {
          try {
            const device = await loginDevice(this.email, this.password, d);
            const info = await device.getDeviceInfo();
            return { ...d, isOn: info.device_on };
          } catch {
            return { ...d, isOn: false }; // fallback se non raggiungibile
          }
        }),
      );

      return devicesWithRealState;
    } catch (error) {
      this.logger.error(
        'Impossibile recuperare la lista dei dispositivi',
        error,
      );
      throw error;
    }
  }

  // 2. Accendi/Spegni una presa specifica tramite il suo deviceId
  async setPowerStateById(deviceId: string, state: boolean): Promise<boolean> {
    try {
      const cloudApi = await this.getCloudConnection();
      const devices = await cloudApi.listDevicesByType('SMART.TAPOPLUG');

      // Cerchiamo nell'array la presa che ha il deviceId richiesto
      const targetDevice = devices.find((d) => d.deviceId === deviceId);

      if (!targetDevice) {
        this.logger.warn(
          `Dispositivo con ID ${deviceId} non trovato nell'account.`,
        );
        return false;
      }

      this.logger.log(
        `Connessione locale a: ${targetDevice.alias} via autodiscovery...`,
      );

      // La libreria cerca l'IP locale da sola usando i dati del targetDevice
      const device = await loginDevice(this.email, this.password, targetDevice);

      if (state) {
        await device.turnOn();
      } else {
        await device.turnOff();
      }

      this.logger.log(`Presa "${targetDevice.alias}" impostata su ${state}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Errore di comunicazione con il dispositivo ${deviceId}`,
        error,
      );
      return false;
    }
  }

  // TapoService
  async getDeviceStatus(deviceId: string): Promise<boolean | null> {
    try {
      const cloudApi = await this.getCloudConnection();
      const devices = await cloudApi.listDevicesByType('SMART.TAPOPLUG');
      const targetDevice = devices.find((d) => d.deviceId === deviceId);
      if (!targetDevice) return null;

      const device = await loginDevice(this.email, this.password, targetDevice);
      const info = await device.getDeviceInfo();
      return info.device_on; // stato reale letto localmente
    } catch (error) {
      this.logger.error(`Errore lettura stato ${deviceId}`, error);
      return null;
    }
  }
}
