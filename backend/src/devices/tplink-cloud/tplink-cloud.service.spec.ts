import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { cloudLogin } from 'tp-link-tapo-connect';
import * as fs from 'fs';
import { TplinkCloudService } from './tplink-cloud.service';
import { TapoService } from '../tapo/tapo.service';
import { KasaService } from '../kasa/kasa.service';

// Mock del cloud TP-Link: la lista dispositivi arriva da qui, non dalla rete.
jest.mock('tp-link-tapo-connect');

// Solo le tre funzioni usate dal service leggono/scrivono su disco: le sostituiamo
// lasciando intatto il resto di fs (serve a Nest e a ts-jest).
jest.mock('fs', () => ({
  ...jest.requireActual<typeof import('fs')>('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const TAPO_PLUG = {
  deviceId: 'tapo-p110',
  alias: 'Presa Tapo',
  deviceModel: 'P110',
  deviceType: 'SMART.TAPOPLUG',
};

const KASA_PLUG = {
  deviceId: 'kasa-hs110',
  alias: 'Presa Kasa',
  deviceModel: 'HS110',
  deviceType: 'IOT.SMARTPLUGSWITCH',
};

// device-config.json finto: 'ignoto' non è nella lista cloud (→ protocollo tapo di default)
const IP_MAP = {
  [TAPO_PLUG.deviceId]: '192.168.1.50',
  [KASA_PLUG.deviceId]: '192.168.1.60',
  ignoto: '192.168.1.70',
};

describe('TplinkCloudService — conversione energia', () => {
  let service: TplinkCloudService;

  const tapoService = { getEnergyUsage: jest.fn() };
  const kasaService = { getEnergy: jest.fn() };

  beforeEach(async () => {
    // loadIpMap() legge device-config.json, saveDevicesInfoToDisk() scrive devices-info.json
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(IP_MAP));
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);

    (cloudLogin as jest.Mock).mockResolvedValue({
      listDevices: jest.fn().mockResolvedValue([TAPO_PLUG, KASA_PLUG]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TplinkCloudService,
        { provide: TapoService, useValue: tapoService },
        { provide: KasaService, useValue: kasaService },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, def?: unknown) => def },
        },
      ],
    }).compile();

    service = module.get<TplinkCloudService>(TplinkCloudService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('Tapo: mW → W e Wh → kWh', () => {
    it('divide per 1000 potenza ed energie', async () => {
      tapoService.getEnergyUsage.mockResolvedValue({
        current_power: 12345, // mW
        today_energy: 250, // Wh
        month_energy: 7500, // Wh
      });

      const energy = await service.getDeviceEnergy(TAPO_PLUG.deviceId);

      expect(energy.supported).toBe(true);
      expect(energy.powerW).toBeCloseTo(12.345, 6);
      expect(energy.todayKwh).toBeCloseTo(0.25, 6);
      expect(energy.monthKwh).toBeCloseTo(7.5, 6);
    });

    it('interroga il dispositivo con id e ip risolti dalla mappa', async () => {
      tapoService.getEnergyUsage.mockResolvedValue({ current_power: 1000 });

      await service.getDeviceEnergy(TAPO_PLUG.deviceId);

      expect(tapoService.getEnergyUsage).toHaveBeenCalledWith(
        TAPO_PLUG.deviceId,
        IP_MAP[TAPO_PLUG.deviceId],
      );
    });

    it('conserva lo zero: 0 mW è una lettura valida, non un dato mancante', async () => {
      tapoService.getEnergyUsage.mockResolvedValue({
        current_power: 0,
        today_energy: 0,
        month_energy: 0,
      });

      expect(await service.getDeviceEnergy(TAPO_PLUG.deviceId)).toEqual({
        supported: true,
        powerW: 0,
        todayKwh: 0,
        monthKwh: 0,
      });
    });

    it('lascia undefined le energie assenti invece di convertirle in 0/NaN', async () => {
      tapoService.getEnergyUsage.mockResolvedValue({ current_power: 5000 });

      const energy = await service.getDeviceEnergy(TAPO_PLUG.deviceId);

      expect(energy.powerW).toBe(5);
      expect(energy.todayKwh).toBeUndefined();
      expect(energy.monthKwh).toBeUndefined();
    });

    it('senza current_power il dispositivo è "non supportato"', async () => {
      tapoService.getEnergyUsage.mockResolvedValue({ today_energy: 250 });

      expect(await service.getDeviceEnergy(TAPO_PLUG.deviceId)).toEqual({
        supported: false,
      });
    });

    it('usa il protocollo tapo per un id assente dalla lista cloud', async () => {
      tapoService.getEnergyUsage.mockResolvedValue({ current_power: 2500 });

      const energy = await service.getDeviceEnergy('ignoto');

      expect(energy.powerW).toBeCloseTo(2.5, 6);
      expect(kasaService.getEnergy).not.toHaveBeenCalled();
    });
  });

  describe('Kasa: campi già in unità intere o legacy in milli-', () => {
    it('usa i campi in W/V/kWh così come sono', async () => {
      kasaService.getEnergy.mockResolvedValue({
        power: 42.5,
        voltage: 230.1,
        total: 1.234,
      });

      expect(await service.getDeviceEnergy(KASA_PLUG.deviceId)).toEqual({
        supported: true,
        powerW: 42.5,
        voltage: 230.1,
        todayKwh: 1.234,
      });
    });

    it('converte i campi legacy mW/mV/Wh dividendo per 1000', async () => {
      kasaService.getEnergy.mockResolvedValue({
        power_mw: 42500,
        voltage_mv: 230100,
        total_wh: 1234,
      });

      const energy = await service.getDeviceEnergy(KASA_PLUG.deviceId);

      expect(energy.supported).toBe(true);
      expect(energy.powerW).toBeCloseTo(42.5, 6);
      expect(energy.voltage).toBeCloseTo(230.1, 6);
      expect(energy.todayKwh).toBeCloseTo(1.234, 6);
    });

    it('con entrambe le varianti presenti vince il campo già in unità intere', async () => {
      kasaService.getEnergy.mockResolvedValue({
        power: 0, // 0 W è una lettura reale: non deve cadere su power_mw
        power_mw: 42500,
        voltage: 230,
        voltage_mv: 1,
      });

      const energy = await service.getDeviceEnergy(KASA_PLUG.deviceId);

      expect(energy.powerW).toBe(0);
      expect(energy.voltage).toBe(230);
    });

    it('gestisce un mix di campi nuovi e legacy', async () => {
      kasaService.getEnergy.mockResolvedValue({
        power: 15.2,
        voltage_mv: 229800,
      });

      const energy = await service.getDeviceEnergy(KASA_PLUG.deviceId);

      expect(energy.powerW).toBe(15.2);
      expect(energy.voltage).toBeCloseTo(229.8, 6);
      expect(energy.todayKwh).toBeUndefined();
    });

    it('non popola monthKwh: la lettura Kasa non espone il totale mensile', async () => {
      kasaService.getEnergy.mockResolvedValue({ power: 10, total: 2 });

      expect(
        (await service.getDeviceEnergy(KASA_PLUG.deviceId)).monthKwh,
      ).toBeUndefined();
    });

    it('senza emeter (getEnergy → null) ritorna non supportato', async () => {
      kasaService.getEnergy.mockResolvedValue(null);

      expect(await service.getDeviceEnergy(KASA_PLUG.deviceId)).toEqual({
        supported: false,
      });
    });
  });

  describe('casi limite', () => {
    it('ritorna non supportato se il device non ha un IP configurato', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('{}');

      expect(await service.getDeviceEnergy(TAPO_PLUG.deviceId)).toEqual({
        supported: false,
      });
      expect(tapoService.getEnergyUsage).not.toHaveBeenCalled();
    });

    it('ritorna non supportato se la lettura del dispositivo fallisce', async () => {
      tapoService.getEnergyUsage.mockRejectedValue(new Error('timeout'));

      expect(await service.getDeviceEnergy(TAPO_PLUG.deviceId)).toEqual({
        supported: false,
      });
    });
  });
});
