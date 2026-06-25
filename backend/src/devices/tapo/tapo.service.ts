import { Injectable, Logger } from '@nestjs/common';
import { loginDeviceByIp } from 'tp-link-tapo-connect';
import { ConfigService } from '@nestjs/config';

// tipo della connessione restituita dalla libreria
type DeviceConnection = Awaited<ReturnType<typeof loginDeviceByIp>>;

// Converte HSV (hue 0-360, saturazione 0-100, valore 0-100) in esadecimale.
// Usato per riportare il colore Tapo (hue/saturation) nel formato hex della UI.
function hsvToHex(h: number, s: number, v = 100): string {
  const sf = s / 100;
  const vf = v / 100;
  const c = vf * sf;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vf - c;
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
  const toHex = (val: number) =>
    Math.round((val + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

@Injectable()
export class TapoService {
  private readonly logger = new Logger(TapoService.name);

  private readonly email: string;
  private readonly password: string;

  constructor(private readonly configService: ConfigService) {
    this.email = this.configService.get<string>('TPLINK_EMAIL', '');
    this.password = this.configService.get<string>('TPLINK_PASSWORD', '');
  }

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
   * Legge lo stato completo di una luce (acceso, luminosità, colore).
   * Per le prese restituisce solo device_on (brightness/color = undefined).
   * Usato dal Coordinatore per popolare la lista col vero stato del device.
   */
  async getDeviceState(
    deviceId: string,
    ip: string,
  ): Promise<{ device_on: boolean; brightness?: number; color?: string }> {
    try {
      const device = await this.getTapoConnection(deviceId, ip);
      // Il tipo della libreria non dichiara i campi colore: cast a record.
      const info = (await device.getDeviceInfo()) as Record<string, unknown>;

      const brightness =
        typeof info.brightness === 'number' ? info.brightness : undefined;

      // In modalità bianco/temperatura colore la saturazione è nulla.
      let color: string | undefined;
      if (typeof info.color_temp === 'number' && info.color_temp > 0) {
        color = 'white';
      } else if (typeof info.hue === 'number') {
        const sat = typeof info.saturation === 'number' ? info.saturation : 100;
        color = hsvToHex(info.hue, sat);
      }

      return { device_on: Boolean(info.device_on), brightness, color };
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
