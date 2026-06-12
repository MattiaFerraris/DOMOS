import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { TplinkCloudService } from '../tplink-cloud/tplink-cloud.service';

// Timer one-shot: spegne/accende una volta sola a un certo istante
export interface OneShotTimer {
  id: string;
  deviceId: string;
  targetState: boolean;
  fireAt: number; // epoch ms
}

// Schedulazione ricorrente: scatta a un orario, nei giorni indicati
export interface RecurringSchedule {
  id: string;
  deviceId: string;
  targetState: boolean;
  time: string; // "HH:MM"
  days: number[]; // 0=Domenica .. 6=Sabato
  enabled: boolean;
}

interface ScheduleStore {
  timers: OneShotTimer[];
  schedules: RecurringSchedule[];
}

const STORE_PATH = path.join(process.cwd(), 'schedules.json');

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);

  private store: ScheduleStore = { timers: [], schedules: [] };
  private handles = new Map<string, NodeJS.Timeout>();
  private tickInterval: NodeJS.Timeout | null = null;
  private lastFiredMinute = '';

  constructor(private readonly cloud: TplinkCloudService) {}

  // ── Ciclo di vita ───────────────────────────────────────────────
  onModuleInit() {
    this.store = this.loadStore();

    // Riarma i timer one-shot; quelli già scaduti scattano subito
    for (const timer of [...this.store.timers]) {
      this.armTimer(timer);
    }

    // Tick ogni 60s per le schedulazioni ricorrenti
    this.tickInterval = setInterval(() => this.checkSchedules(), 60 * 1000);
    this.logger.log(
      `Scheduler avviato (${this.store.timers.length} timer, ${this.store.schedules.length} schedulazioni)`,
    );
  }

  onModuleDestroy() {
    for (const h of this.handles.values()) clearTimeout(h);
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  // ── Persistenza ─────────────────────────────────────────────────
  private loadStore(): ScheduleStore {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<ScheduleStore>;
        return {
          timers: parsed.timers ?? [],
          schedules: parsed.schedules ?? [],
        };
      }
    } catch {
      this.logger.error('Impossibile leggere schedules.json');
    }
    return { timers: [], schedules: [] };
  }

  private saveStore() {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.store, null, 2));
    } catch (error) {
      this.logger.error(
        `Errore scrittura schedules.json: ${(error as Error).message}`,
      );
    }
  }

  // ── Esecuzione comando ──────────────────────────────────────────
  private async fire(deviceId: string, targetState: boolean) {
    try {
      await this.cloud.setDevicePower(deviceId, targetState);
      this.logger.log(
        `Comando pianificato eseguito: ${deviceId} → ${targetState}`,
      );
    } catch (error) {
      this.logger.error(
        `Errore esecuzione comando pianificato (${deviceId}): ${(error as Error).message}`,
      );
    }
  }

  // ── Timer one-shot ──────────────────────────────────────────────
  private armTimer(timer: OneShotTimer) {
    const delay = timer.fireAt - Date.now();

    if (delay <= 0) {
      // Timer scaduto (es. backend spento allo scadere): esegui e rimuovi
      void this.fire(timer.deviceId, timer.targetState);
      this.removeTimer(timer.id);
      return;
    }

    const existing = this.handles.get(timer.id);
    if (existing) clearTimeout(existing);

    this.handles.set(
      timer.id,
      setTimeout(() => {
        void this.fire(timer.deviceId, timer.targetState);
        this.removeTimer(timer.id);
      }, delay),
    );
  }

  private removeTimer(id: string) {
    const handle = this.handles.get(id);
    if (handle) {
      clearTimeout(handle);
      this.handles.delete(id);
    }
    this.store.timers = this.store.timers.filter((t) => t.id !== id);
    this.saveStore();
  }

  listTimers(): OneShotTimer[] {
    return this.store.timers;
  }

  addTimer(
    deviceId: string,
    delayMinutes: number,
    targetState: boolean,
  ): OneShotTimer {
    // Un solo timer per dispositivo: rimuovi quello esistente
    const previous = this.store.timers.find((t) => t.deviceId === deviceId);
    if (previous) this.removeTimer(previous.id);

    const timer: OneShotTimer = {
      id: randomUUID(),
      deviceId,
      targetState,
      fireAt: Date.now() + delayMinutes * 60 * 1000,
    };
    this.store.timers.push(timer);
    this.saveStore();
    this.armTimer(timer);
    return timer;
  }

  cancelTimer(id: string): void {
    this.removeTimer(id);
  }

  // ── Schedulazioni ricorrenti ────────────────────────────────────
  private checkSchedules() {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const minuteKey = `${now.toDateString()} ${currentTime}`;

    // Evita doppia esecuzione nello stesso minuto
    if (minuteKey === this.lastFiredMinute) return;

    const day = now.getDay();
    for (const s of this.store.schedules) {
      if (s.enabled && s.time === currentTime && s.days.includes(day)) {
        void this.fire(s.deviceId, s.targetState);
      }
    }
    this.lastFiredMinute = minuteKey;
  }

  listSchedules(): RecurringSchedule[] {
    return this.store.schedules;
  }

  addSchedule(
    input: Omit<RecurringSchedule, 'id'>,
  ): RecurringSchedule {
    const schedule: RecurringSchedule = { id: randomUUID(), ...input };
    this.store.schedules.push(schedule);
    this.saveStore();
    return schedule;
  }

  updateSchedule(
    id: string,
    patch: Partial<Omit<RecurringSchedule, 'id'>>,
  ): RecurringSchedule | null {
    const schedule = this.store.schedules.find((s) => s.id === id);
    if (!schedule) return null;
    Object.assign(schedule, patch);
    this.saveStore();
    return schedule;
  }

  deleteSchedule(id: string): void {
    this.store.schedules = this.store.schedules.filter((s) => s.id !== id);
    this.saveStore();
  }
}
