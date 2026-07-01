import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { loginDeviceByIp } from 'tp-link-tapo-connect';
import { TapoService } from './tapo.service';

// Mock della libreria Tapo: nessun dispositivo reale, solo un device finto.
jest.mock('tp-link-tapo-connect');

const IP = '192.168.1.50';

function fakeDevice(info: Record<string, unknown>) {
  return {
    getDeviceInfo: jest.fn().mockResolvedValue(info),
    turnOn: jest.fn().mockResolvedValue(undefined),
    turnOff: jest.fn().mockResolvedValue(undefined),
    setColour: jest.fn().mockResolvedValue(undefined),
    setBrightness: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TapoService', () => {
  let service: TapoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TapoService,
        {
          provide: ConfigService,
          useValue: { get: (_key: string, def?: unknown) => def },
        },
      ],
    }).compile();
    service = module.get<TapoService>(TapoService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getDeviceState', () => {
    it('legge accensione e luminosità di una luce a colori', async () => {
      (loginDeviceByIp as jest.Mock).mockResolvedValue(
        fakeDevice({
          device_on: true,
          brightness: 80,
          hue: 0,
          saturation: 100,
        }),
      );

      const state = await service.getDeviceState('led-1', IP);
      expect(state.device_on).toBe(true);
      expect(state.brightness).toBe(80);
      expect(state.color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('converte hue/saturation in hex (rosso → canale rosso dominante)', async () => {
      (loginDeviceByIp as jest.Mock).mockResolvedValue(
        fakeDevice({ device_on: true, hue: 0, saturation: 100 }),
      );

      const { color } = await service.getDeviceState('led-1', IP);
      const r = parseInt(color!.slice(1, 3), 16);
      const g = parseInt(color!.slice(3, 5), 16);
      expect(r).toBeGreaterThan(g);
    });

    it('tratta la modalità temperatura colore come "white"', async () => {
      (loginDeviceByIp as jest.Mock).mockResolvedValue(
        fakeDevice({
          device_on: true,
          brightness: 50,
          color_temp: 4000,
          hue: 0,
        }),
      );

      expect((await service.getDeviceState('led-1', IP)).color).toBe('white');
    });

    it('per una presa (senza campi colore) lascia brightness/color undefined', async () => {
      (loginDeviceByIp as jest.Mock).mockResolvedValue(
        fakeDevice({ device_on: false }),
      );

      const state = await service.getDeviceState('plug-1', IP);
      expect(state).toEqual({
        device_on: false,
        brightness: undefined,
        color: undefined,
      });
    });

    it('invalida la sessione e propaga l’errore se la lettura fallisce', async () => {
      (loginDeviceByIp as jest.Mock).mockRejectedValue(new Error('timeout'));
      await expect(service.getDeviceState('led-1', IP)).rejects.toThrow(
        'timeout',
      );
    });
  });

  describe('setPowerState', () => {
    it('accende il dispositivo e ritorna true', async () => {
      const dev = fakeDevice({ device_on: false });
      (loginDeviceByIp as jest.Mock).mockResolvedValue(dev);

      const ok = await service.setPowerState('plug-1', IP, true);
      expect(ok).toBe(true);
      expect(dev.turnOn).toHaveBeenCalled();
      expect(dev.turnOff).not.toHaveBeenCalled();
    });

    it('ritorna false in caso di errore', async () => {
      const dev = fakeDevice({});
      dev.turnOff.mockRejectedValue(new Error('offline'));
      (loginDeviceByIp as jest.Mock).mockResolvedValue(dev);

      expect(await service.setPowerState('plug-1', IP, false)).toBe(false);
    });
  });

  describe('setLightStripState', () => {
    it('accende e applica colore + luminosità', async () => {
      const dev = fakeDevice({});
      (loginDeviceByIp as jest.Mock).mockResolvedValue(dev);

      const ok = await service.setLightStripState('led-1', IP, true, 60, 'red');
      expect(ok).toBe(true);
      expect(dev.turnOn).toHaveBeenCalled();
      expect(dev.setColour).toHaveBeenCalledWith('red');
      expect(dev.setBrightness).toHaveBeenCalledWith(60);
    });

    it('con state=false spegne soltanto', async () => {
      const dev = fakeDevice({});
      (loginDeviceByIp as jest.Mock).mockResolvedValue(dev);

      await service.setLightStripState('led-1', IP, false, 60, 'red');
      expect(dev.turnOff).toHaveBeenCalled();
      expect(dev.setColour).not.toHaveBeenCalled();
    });
  });
});
