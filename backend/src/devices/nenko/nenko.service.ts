import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import nenkoButtons from './nenko-buttons.json';

// Struttura del file di mappatura tasti (nenko-buttons.json).
// I frame sono stati catturati DAL VIVO col nRF Sniffer 802.15.4
interface NenkoButton {
  label: string;
  tipo: string; // "colore" | "effetto"
  rgb?: string; // hex "#rrggbb"
  frame: string; // MAC frame hex (24 byte), SENZA FCS: e' cio' che si invia
}
const BUTTONS = (nenkoButtons as { tasti: Record<string, NenkoButton> }).tasti;

export interface NenkoState {
  color?: string; // ultimo preset inviato
}

export interface NenkoPreset {
  name: string;
  label: string;
  tipo: string;
  rgb?: string;
}

/**
 * Comanda la luce Nenko via un dongle nRF52840 (firmware Zephyr) che fa da
 * "modem" 802.15.4: riceve una riga di HEX sulla seriale USB e la ritrasmette
 * come frame 802.15.4 grezzo sul canale 11.
 *
 * PROTOCOLLO SERIALE (allineato al firmware Zephyr):
 *   - Si invia il frame come HEX NUDO + '\n' (NIENTE prefisso "TX", NIENTE "CH").
 *   - Il canale e' fisso nel firmware (11); non si imposta da qui.
 *   - Il firmware risponde "OK <n> byte" oppure "ERR: ...".
 *   - IMPORTANTE: il firmware attende DTR alto prima di ricevere -> apriamo la
 *     porta con dtr/rts attivi.
 */
@Injectable()
export class NenkoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NenkoService.name);

  private readonly path: string;
  private readonly baud: number;

  private port: SerialPort | null = null;
  private ready = false;
  private state: NenkoState = {};

  // Coda: serializza le scritture e attende OK/ERR (il firmware e' single-buffer).
  private queue: Promise<void> = Promise.resolve();
  private pending: ((line: string) => void) | null = null;

  constructor(private readonly configService: ConfigService) {
    this.path = this.configService.get<string>('NENKO_SERIAL_PATH', '');
    // Le variabili d'ambiente sono sempre stringhe: il generic <number> non
    // converte nulla, quindi forziamo la conversione (serialport esige un number).
    this.baud = Number(this.configService.get('NENKO_BAUD', 115200));
  }

  onModuleInit(): void {
    if (!this.path) {
      this.logger.warn(
        'NENKO_SERIAL_PATH non impostato: NenkoService disattivo',
      );
      return;
    }
    this.connect();
  }

  onModuleDestroy(): void {
    this.port?.close();
  }

  private connect(): void {
    this.logger.log(`Apertura seriale ${this.path} @${this.baud}...`);

    // Il firmware Zephyr aspetta DTR alto prima di abilitare la RX.
    this.port = new SerialPort({
      path: this.path,
      baudRate: this.baud,
      // apriamo con le linee di controllo attive
    });

    const parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

    this.port.on('open', () => {
      // Forziamo DTR/RTS: e' cio' che sblocca il firmware (equivalente a
      // quello che fa il Serial Terminal quando si connette).
      this.port?.set({ dtr: true, rts: true }, (err) => {
        if (err) this.logger.error(`set DTR/RTS: ${err.message}`);
      });
      this.ready = true;
      this.logger.log('Dongle nRF connesso (DTR alto)');
    });
    this.port.on('close', () => {
      this.ready = false;
      this.logger.warn('Seriale chiusa');
    });
    this.port.on('error', (err) =>
      this.logger.error(`Errore seriale: ${err.message}`),
    );

    parser.on('data', (line: string) => {
      const trimmed = line.trim();
      if (
        this.pending &&
        (trimmed.startsWith('OK') || trimmed.startsWith('ERR'))
      ) {
        const cb = this.pending;
        this.pending = null;
        cb(trimmed);
      } else if (trimmed) {
        this.logger.debug(`nRF: ${trimmed}`);
      }
    });
  }

  /**
   * Invia una riga di HEX e attende la risposta OK/ERR (con timeout).
   */
  private send(hexFrame: string): Promise<string> {
    const run = (): Promise<string> =>
      new Promise((resolve) => {
        if (!this.port || !this.ready) {
          this.logger.error(`Frame non inviato (seriale chiusa): ${hexFrame}`);
          return resolve('ERR CLOSED');
        }
        const timer = setTimeout(() => {
          if (this.pending) {
            this.pending = null;
            this.logger.warn(`Timeout risposta per: ${hexFrame}`);
            resolve('ERR TIMEOUT');
          }
        }, 1000);
        this.pending = (line) => {
          clearTimeout(timer);
          resolve(line);
        };
        // HEX + newline: il firmware trasmette al '\n'.
        this.port.write(`${hexFrame}\n`);
        this.logger.log(`OK: frame inviato: ${hexFrame}`);
      });

    const result = this.queue.then(run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Ritrasmette un frame MAC grezzo (hex, senza FCS), ripetuto `repeat` volte. */
  private async transmit(hexFrame: string): Promise<boolean> {
    let ok = true;

    const resp = await this.send(hexFrame);
    if (!resp.startsWith('OK')) ok = false;

    return ok;
  }

  // ── API per il controller ─────────────────────────────────────────

  getState(): NenkoState {
    return this.state;
  }

  /** Elenco dei preset disponibili con metadati */
  listPresets(): NenkoPreset[] {
    return Object.entries(BUTTONS).map(([name, b]) => ({
      name,
      label: b.label,
      tipo: b.tipo,
      rgb: b.rgb,
    }));
  }

  /** Invia un preset: ritrasmette il frame catturato dal telecomando. */
  async sendPreset(name: string): Promise<boolean> {
    const button = BUTTONS[name];
    if (!button) {
      this.logger.error(`Preset "${name}" inesistente`);
      return false;
    }
    const ok = await this.transmit(button.frame);
    if (ok) this.state = { color: name };
    return ok;
  }
}
