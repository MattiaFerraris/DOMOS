import { Injectable, Logger } from '@nestjs/common';
import { AnyDevice, Client as KasaClient } from 'tplink-smarthome-api';

@Injectable()
export class KasaService {
  private readonly logger = new Logger(KasaService.name);

  private kasaClient = new KasaClient();

  // CACHE sessione
  private activeSessions = new Map<string, AnyDevice>();

  // ── MOTORE LOCALE (Gestione Sessioni) ───────────────────────────

  private async getKasaConnection(ip: string): Promise<AnyDevice> {
    if (this.activeSessions.has(ip)) {
      return this.activeSessions.get(ip)!;
    }

    this.logger.log(`Creazione nuova sessione Kasa per IP: ${ip}`);

    // NOTA: La libreria richiede un oggetto { host: string }
    const session = await this.kasaClient.getDevice({ host: ip });

    this.activeSessions.set(ip, session);

    return session;
  }

  // ── API PER IL COORDINATORE ─────────────────────────────────────

  /**
   * Legge lo stato (Acceso/Spento) in tempo reale.
   * Usato dal Coordinatore durante la generazione della lista.
   */
  async getDeviceStatus(ip: string): Promise<boolean> {
    try {
      // Usiamo il nostro metodo per sfruttare la cache!
      const device = await this.getKasaConnection(ip);

      // Cast ad any per evitare conflitti di tipi TypeScript con i vari modelli Kasa
      const sysInfo = (await device.getSysInfo()) as any;

      return sysInfo.relay_state === 1; // 1 = Acceso, 0 = Spento
    } catch (error) {
      // Rimuoviamo la sessione corrotta
      this.activeSessions.delete(ip);
      this.logger.error(
        `Impossibile leggere stato Kasa (${ip}): ${(error as Error).message}`,
      );
      throw error; // Rilanciamo l'errore al Coordinatore
    }
  }

  /**
   * Accende o spegne una presa Kasa (es. HS100)
   */
  async setPowerState(ip: string, state: boolean): Promise<boolean> {
    try {
      const device = await this.getKasaConnection(ip);

      // La libreria Kasa è intelligente e accetta direttamente il booleano
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
