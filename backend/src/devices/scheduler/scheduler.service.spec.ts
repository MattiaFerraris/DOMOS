import * as fs from 'fs';
import { SchedulerService } from './scheduler.service';
import { TplinkCloudService } from '../tplink-cloud/tplink-cloud.service';

// fs mockato: niente scrittura reale di schedules.json sul disco.
jest.mock('fs');

describe('SchedulerService', () => {
  let service: SchedulerService;
  let cloud: { setDevicePower: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    (fs.existsSync as jest.Mock).mockReturnValue(false); // store vuoto all'avvio
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);

    cloud = { setDevicePower: jest.fn().mockResolvedValue(true) };
    service = new SchedulerService(cloud as unknown as TplinkCloudService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('timer one-shot', () => {
    it('programma un timer ed esegue il comando allo scadere', async () => {
      service.addTimer('plug-1', 1, true); // fra 1 minuto, accendi
      expect(service.listTimers()).toHaveLength(1);
      expect(cloud.setDevicePower).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(60 * 1000);

      expect(cloud.setDevicePower).toHaveBeenCalledWith('plug-1', true);
      expect(service.listTimers()).toHaveLength(0); // rimosso dopo l'esecuzione
    });

    it('mantiene un solo timer per dispositivo (sostituisce il precedente)', () => {
      const first = service.addTimer('plug-1', 5, true);
      const second = service.addTimer('plug-1', 10, false);

      const timers = service.listTimers();
      expect(timers).toHaveLength(1);
      expect(timers[0].id).toBe(second.id);
      expect(timers[0].id).not.toBe(first.id);
    });

    it('cancelTimer rimuove il timer e non lo esegue', async () => {
      const timer = service.addTimer('plug-1', 1, true);
      service.cancelTimer(timer.id);
      expect(service.listTimers()).toHaveLength(0);

      await jest.advanceTimersByTimeAsync(60 * 1000);
      expect(cloud.setDevicePower).not.toHaveBeenCalled();
    });

    it('riarma all’avvio i timer già scaduti eseguendoli subito', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          timers: [
            {
              id: 't1',
              deviceId: 'plug-1',
              targetState: false,
              fireAt: Date.now() - 1000, // già scaduto
            },
          ],
          schedules: [],
        }),
      );

      const revived = new SchedulerService(
        cloud as unknown as TplinkCloudService,
      );
      revived.onModuleInit();
      await Promise.resolve(); // flush della microtask di fire()

      expect(cloud.setDevicePower).toHaveBeenCalledWith('plug-1', false);
      expect(revived.listTimers()).toHaveLength(0);
      revived.onModuleDestroy();
    });
  });

  describe('schedulazioni ricorrenti', () => {
    it('aggiunge, aggiorna ed elimina una schedulazione', () => {
      const s = service.addSchedule({
        deviceId: 'plug-1',
        targetState: true,
        time: '07:00',
        days: [1, 2, 3, 4, 5],
        enabled: true,
      });
      expect(service.listSchedules()).toHaveLength(1);

      const updated = service.updateSchedule(s.id, { enabled: false });
      expect(updated?.enabled).toBe(false);

      service.deleteSchedule(s.id);
      expect(service.listSchedules()).toHaveLength(0);
    });

    it('updateSchedule su id inesistente ritorna null', () => {
      expect(service.updateSchedule('nope', { enabled: false })).toBeNull();
    });

    it('esegue la schedulazione nel minuto e giorno corretti', async () => {
      // Poco prima delle 08:30; al tick successivo saranno le 08:30.
      jest.setSystemTime(new Date('2026-06-24T08:29:30'));
      const today = new Date().getDay();

      service.addSchedule({
        deviceId: 'plug-1',
        targetState: true,
        time: '08:30',
        days: [today],
        enabled: true,
      });

      await jest.advanceTimersByTimeAsync(60 * 1000); // un tick dello scheduler
      expect(cloud.setDevicePower).toHaveBeenCalledWith('plug-1', true);
    });

    it('non esegue una schedulazione disabilitata', async () => {
      jest.setSystemTime(new Date('2026-06-24T08:29:30'));
      const today = new Date().getDay();

      service.addSchedule({
        deviceId: 'plug-1',
        targetState: true,
        time: '08:30',
        days: [today],
        enabled: false,
      });

      await jest.advanceTimersByTimeAsync(60 * 1000);
      expect(cloud.setDevicePower).not.toHaveBeenCalled();
    });
  });
});
