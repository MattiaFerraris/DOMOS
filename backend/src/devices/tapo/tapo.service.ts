import { Injectable, Logger } from '@nestjs/common';
import { loginDeviceByIp } from 'tp-link-tapo-connect';

// tipo della connessione restituita dalla libreria
type DeviceConnection = Awaited<ReturnType<typeof loginDeviceByIp>>;

@Injectable()
export class TapoService {
  private readonly logger = new Logger(TapoService.name);

  // Le credenziali locali servono ancora per il protocollo KLAP
  readonly email = 'mailDispositiviSmart@gmail.com';
  readonly password = 'hapjin-6mIpky-puhnux';

  // CACHE sessione
  private activeSessions = new Map<string, DeviceConnection>();

  // ── MOTORE LOCALE (Gestione Sessioni) ───────────────────────────

  private async getTapoConnection(
    deviceId: string,
    ip: string,
  ): Promise<DeviceConnection> {
    if (this.activeSessions.has(deviceId)) {
      return this.activeSessions.get(deviceId)!;
    }

    this.logger.log(`Creazione nuova sessione Tapo per IP: ${ip}`);

    const session = await loginDeviceByIp(this.email, this.password, ip);

    this.activeSessions.set(deviceId, session);

    return session;
  }

  // ── API PER IL COORDINATORE ─────────────────────────────────────

  /**
   * Legge lo stato (Acceso/Spento) in tempo reale.
   * Usato dal Coordinatore durante la generazione della lista.
   */
  async getDeviceStatus(deviceId: string, ip: string): Promise<boolean> {
    try {
      const device = await this.getTapoConnection(deviceId, ip);
      const info = await device.getDeviceInfo();
      return info.device_on;
    } catch (error) {
      this.activeSessions.delete(deviceId);
      throw error;
    }
  }

  /**
   * Accende o spegne una presa tapo
   */
  async setPowerState(
    deviceId: string,
    ip: string,
    state: boolean,
  ): Promise<boolean> {
    try {
      const device = await this.getTapoConnection(deviceId, ip);
      if (state) {
        await device.turnOn();
      } else {
        await device.turnOff();
      }
      this.logger.log(`Tapo ${deviceId} → ${state}`);
      return true;
    } catch (error) {
      this.activeSessions.delete(deviceId);
      this.logger.error(
        `Errore setPowerState Tapo: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Legge il consumo energetico (per dispositivi che lo supportano, es. P110).
   */
  async getEnergyUsage(deviceId: string, ip: string): Promise<any> {
    const device = await this.getTapoConnection(deviceId, ip);
    return device.getEnergyUsage();
  }

  /**
   * Legge le informazioni complete del dispositivo (WiFi, uptime, firmware...).
   */
  async getFullInfo(deviceId: string, ip: string): Promise<any> {
    const device = await this.getTapoConnection(deviceId, ip);
    return device.getDeviceInfo();
  }

  /**
   * Controlla Accensione, Luminosità e Colore per le Strisce LED tapo
   */
  async setLightStripState(
    deviceId: string,
    ip: string,
    state: boolean,
    brightness: number,
    color: string,
  ): Promise<boolean> {
    try {
      const device = await this.getTapoConnection(deviceId, ip);

      if (state) {
        await device.turnOn();
        await device.setColour(color);
        await device.setBrightness(brightness);
        this.logger.log(
          `Tapo LED ${deviceId} ACCESA (${color}, ${brightness}%)`,
        );
      } else {
        await device.turnOff();
        this.logger.log(`Tapo LED ${deviceId} SPENTA`);
      }
      return true;
    } catch (error) {
      this.activeSessions.delete(deviceId);
      this.logger.error(
        `Errore setLightStrip Tapo: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
