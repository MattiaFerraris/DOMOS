import { Injectable, Logger } from '@nestjs/common';
import { loginDeviceByIp } from 'tp-link-tapo-connect';

// Estraiamo il tipo esatto della connessione restituita dalla libreria
type DeviceConnection = Awaited<ReturnType<typeof loginDeviceByIp>>;

@Injectable()
export class TapoService {
  private readonly logger = new Logger(TapoService.name);

  // Le credenziali locali servono ancora per il protocollo KLAP
  readonly email = 'mailDispositiviSmart@gmail.com';
  readonly password = 'hapjin-6mIpky-puhnux';

  // LA CACHE: Indispensabile per non consumare tutta la RAM (Memory Leak)
  private activeSessions = new Map<string, DeviceConnection>();

  // ── MOTORE LOCALE (Gestione Sessioni) ───────────────────────────

  private async getTapoConnection(
    deviceId: string,
    ip: string,
  ): Promise<DeviceConnection> {
    // 1. Se abbiamo già una sessione aperta, usiamola (Costo memoria: zero)
    if (this.activeSessions.has(deviceId)) {
      return this.activeSessions.get(deviceId)!;
    }

    // 2. Altrimenti, crea la connessione crittografata usando l'IP
    this.logger.log(`Creazione nuova sessione Tapo per IP: ${ip}`);
    const session = await loginDeviceByIp(this.email, this.password, ip);

    // 3. Salva la sessione in cache per i comandi futuri
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
      // Se fallisce, rimuoviamo la sessione corrotta
      this.activeSessions.delete(deviceId);
      throw error; // Rilanciamo l'errore al Coordinatore che lo gestirà
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
   * Controlla Accensione, Luminosità e Colore per le Strisce LED (L900, ecc.)
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
        await device.setBrightness(brightness);
        await device.setColour(color);
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
