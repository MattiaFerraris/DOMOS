import { Injectable, Logger } from '@nestjs/common';
import { AnyDevice, Client as KasaClient } from 'tplink-smarthome-api';

@Injectable()
export class KasaService {
  private readonly logger = new Logger(KasaService.name);

  private kasaClient = new KasaClient();

  // CACHE sessione
  private activeSessions = new Map<string, AnyDevice>();

  // Gestione Sessioni ───────────────────────────

  private async getKasaConnection(ip: string): Promise<AnyDevice> {
    if (this.activeSessions.has(ip)) {
      return this.activeSessions.get(ip)!;
    }

    this.logger.log(`Creazione nuova sessione Kasa per IP: ${ip}`);

    const session = await this.kasaClient.getDevice({ host: ip });

    this.activeSessions.set(ip, session);

    return session;
  }

  // ── API PER IL COORDINATORE ─────────────────────────────────────

  /**
   * Legge lo stato (Acceso/Spento) in tempo reale.
   */
  async getDeviceStatus(ip: string): Promise<boolean> {
    try {
      const device = await this.getKasaConnection(ip);

      const sysInfo = (await device.getSysInfo()) as any;

      return sysInfo.relay_state === 1; // 1 = Acceso, 0 = Spento
    } catch (error) {
      // Rimuoviamo la sessione corrotta
      this.activeSessions.delete(ip);
      this.logger.error(
        `Impossibile leggere stato Kasa (${ip}): ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Legge il consumo energetico in tempo reale (solo dispositivi con emeter).
   * Ritorna null se il dispositivo non supporta la misurazione.
   */
  async getEnergy(ip: string): Promise<any | null> {
    const device = await this.getKasaConnection(ip);
    if (!(device as any).supportsEmeter) return null;
    return (device as any).emeter.getRealtime();
  }

  /**
   * Legge le informazioni di sistema (WiFi, firmware, uptime...).
   */
  async getInfo(ip: string): Promise<any> {
    const device = await this.getKasaConnection(ip);
    return device.getSysInfo();
  }

  /**
   * Accende o spegne una presa Kasa
   */
  async setPowerState(ip: string, state: boolean): Promise<boolean> {
    try {
      const device = await this.getKasaConnection(ip);

      await device.setPowerState(state);

      this.logger.log(`Kasa ${ip} → ${state}`);
      return true;
    } catch (error) {
      this.activeSessions.delete(ip);
      this.logger.error(
        `Errore setPowerState Kasa (${ip}): ${(error as Error).message}`,
      );
      return false;
    }
  }
}
