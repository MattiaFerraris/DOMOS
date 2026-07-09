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

// Struttura del file di mappatura tasti (nenko-buttons.json), catturata dal pcap.
interface NenkoButton {
  label: string;
  tipo: string; // "colore" | "effetto"
  rgb?: string; // hex "#rrggbb"
  payload?: string;
  frame: string; // MAC frame hex, SENZA FCS: è ciò che si invia col comando TX
}
const BUTTONS = (nenkoButtons as { tasti: Record<string, NenkoButton> }).tasti;

export interface NenkoState {
  color?: string; // ultimo preset inviato
}

// Dato esposto alla UI per costruire i pulsanti.
export interface NenkoPreset {
  name: string;
  label: string;
  tipo: string;
  rgb?: string;
}

/**
 * Comanda la luce Nenko via un dongle nRF52840 che fa da "modem" 802.15.4
 */
@Injectable()
export class NenkoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NenkoService.name);

  private readonly path: string;
  private readonly baud: number;
  private readonly channel: number;
  private readonly repeat: number; // quante volte ripetere il frame (come il telecomando reale)

  private port: SerialPort | null = null;
  private ready = false;
  private state: NenkoState = {};

  // Coda: serializza le scritture e attende OK/ERR (il firmware è single-buffer).
  private queue: Promise<void> = Promise.resolve();
  private pending: ((line: string) => void) | null = null;

  constructor(private readonly configService: ConfigService) {
    this.path = this.configService.get<string>('NENKO_SERIAL_PATH', '');
    this.baud = this.configService.get<number>('NENKO_BAUD', 115200);
    this.channel = this.configService.get<number>('NENKO_CHANNEL', 11);
    this.repeat = this.configService.get<number>('NENKO_TX_REPEAT', 6);
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
    this.port = new SerialPort({ path: this.path, baudRate: this.baud });
    const parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

    this.port.on('open', () => {
      this.ready = true;
      this.logger.log('Dongle nRF connesso');
      // Imposta il canale all'avvio.
      void this.send(`CH ${this.channel}`);
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
      if (this.pending) {
        const cb = this.pending;
        this.pending = null;
        cb(trimmed);
      } else if (trimmed) {
        this.logger.debug(`nRF: ${trimmed}`);
      }
    });
  }

  /** Scrive una riga e attende la risposta OK/ERR (con timeout). Serializzato. */
  private send(cmd: string): Promise<string> {
    const run = (): Promise<string> =>
      new Promise((resolve) => {
        if (!this.port || !this.ready) {
          this.logger.error(`Comando non inviato (seriale chiusa): ${cmd}`);
          return resolve('ERR CLOSED');
        }
        const timer = setTimeout(() => {
          if (this.pending) {
            this.pending = null;
            this.logger.warn(`Timeout risposta per: ${cmd}`);
            resolve('ERR TIMEOUT');
          }
        }, 500);
        this.pending = (line) => {
          clearTimeout(timer);
          resolve(line);
        };
        this.logger.log(`→ ${cmd}`);
        this.port.write(`${cmd}\n`);
      });

    const result = this.queue.then(run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Trasmette un frame MAC grezzo (hex, senza FCS), ripetuto `repeat` volte. */
  private async transmit(hexFrame: string): Promise<boolean> {
    let ok = true;
    for (let i = 0; i < this.repeat; i++) {
      const resp = await this.send(`TX ${hexFrame}`);
      if (!resp.startsWith('OK')) ok = false;
    }
    return ok;
  }

  // ── API per il controller ─────────────────────────────────────────

  getState(): NenkoState {
    return this.state;
  }

  /** Elenco dei preset disponibili con metadati (per costruire i pulsanti UI). */
  listPresets(): NenkoPreset[] {
    return Object.entries(BUTTONS).map(([name, b]) => ({
      name,
      label: b.label,
      tipo: b.tipo,
      rgb: b.rgb,
    }));
  }

  /** Invia un colore di preset: ritrasmette verbatim il frame catturato. */
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
