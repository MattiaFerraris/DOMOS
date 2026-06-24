import { Test, TestingModule } from '@nestjs/testing';
import { KasaService } from './kasa.service';

// Mock della libreria Kasa. Il service fa `new Client()` internamente:
// sostituiamo Client con uno stub il cui getDevice è controllabile dai test.
const mockGetDevice = jest.fn();
jest.mock('tplink-smarthome-api', () => ({
  Client: jest.fn().mockImplementation(() => ({ getDevice: mockGetDevice })),
}));

const IP = '192.168.1.60';

function fakeDevice(
  overrides: Partial<{
    relay_state: number;
    supportsEmeter: boolean;
    realtime: unknown;
  }> = {},
) {
  return {
    getSysInfo: jest
      .fn()
      .mockResolvedValue({ relay_state: overrides.relay_state ?? 0 }),
    setPowerState: jest.fn().mockResolvedValue(undefined),
    supportsEmeter: overrides.supportsEmeter ?? false,
    emeter: {
      getRealtime: jest
        .fn()
        .mockResolvedValue(overrides.realtime ?? { power: 12 }),
    },
  };
}

describe('KasaService', () => {
  let service: KasaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KasaService],
    }).compile();
    service = module.get<KasaService>(KasaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getDeviceStatus', () => {
    it('ritorna true quando relay_state === 1', async () => {
      mockGetDevice.mockResolvedValue(fakeDevice({ relay_state: 1 }));
      expect(await service.getDeviceStatus(IP)).toBe(true);
    });

    it('ritorna false quando relay_state === 0', async () => {
      mockGetDevice.mockResolvedValue(fakeDevice({ relay_state: 0 }));
      expect(await service.getDeviceStatus(IP)).toBe(false);
    });

    it('riusa la sessione in cache su chiamate ripetute', async () => {
      mockGetDevice.mockResolvedValue(fakeDevice({ relay_state: 1 }));
      await service.getDeviceStatus(IP);
      await service.getDeviceStatus(IP);
      expect(mockGetDevice).toHaveBeenCalledTimes(1);
    });

    it('propaga l’errore e scarta la sessione corrotta', async () => {
      mockGetDevice.mockRejectedValueOnce(new Error('unreachable'));
      await expect(service.getDeviceStatus(IP)).rejects.toThrow('unreachable');

      // La sessione non è stata messa in cache: la chiamata successiva ritenta
      mockGetDevice.mockResolvedValue(fakeDevice({ relay_state: 1 }));
      expect(await service.getDeviceStatus(IP)).toBe(true);
      expect(mockGetDevice).toHaveBeenCalledTimes(2);
    });
  });

  describe('setPowerState', () => {
    it('inoltra il booleano alla libreria e ritorna true', async () => {
      const dev = fakeDevice();
      mockGetDevice.mockResolvedValue(dev);

      expect(await service.setPowerState(IP, true)).toBe(true);
      expect(dev.setPowerState).toHaveBeenCalledWith(true);
    });

    it('ritorna false se il comando fallisce', async () => {
      const dev = fakeDevice();
      dev.setPowerState.mockRejectedValue(new Error('offline'));
      mockGetDevice.mockResolvedValue(dev);

      expect(await service.setPowerState(IP, false)).toBe(false);
    });
  });

  describe('getEnergy', () => {
    it('ritorna null se il dispositivo non ha emeter', async () => {
      mockGetDevice.mockResolvedValue(fakeDevice({ supportsEmeter: false }));
      expect(await service.getEnergy(IP)).toBeNull();
    });

    it('ritorna la lettura in tempo reale se supporta emeter', async () => {
      mockGetDevice.mockResolvedValue(
        fakeDevice({ supportsEmeter: true, realtime: { power: 42 } }),
      );
      expect(await service.getEnergy(IP)).toEqual({ power: 42 });
    });
  });
});
