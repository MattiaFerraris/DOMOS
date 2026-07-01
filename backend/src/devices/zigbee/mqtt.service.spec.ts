import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { MqttService } from './mqtt.service';

// Mock del client MQTT: niente broker reale, solo un finto client su cui
// possiamo emettere messaggi e ispezionare le publish.
jest.mock('mqtt');

const BASE_TOPIC = 'zigbee2mqtt';

interface FakeClient {
  connected: boolean;
  on: jest.Mock;
  subscribe: jest.Mock;
  publish: jest.Mock;
  end: jest.Mock;
  // helper per simulare un messaggio in arrivo
  emitMessage: (topic: string, payload: unknown) => void;
}

function createFakeClient(): FakeClient {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const client: FakeClient = {
    connected: true,
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb;
      return client;
    }),
    subscribe: jest.fn((_topic: string, cb?: (err: Error | null) => void) => {
      cb?.(null);
    }),
    publish: jest.fn(),
    end: jest.fn(),
    emitMessage: (topic, payload) => {
      const buf = Buffer.from(
        typeof payload === 'string' ? payload : JSON.stringify(payload),
      );
      handlers['message']?.(topic, buf);
    },
  };
  return client;
}

describe('MqttService', () => {
  let service: MqttService;
  let client: FakeClient;

  beforeEach(async () => {
    client = createFakeClient();
    (mqtt.connect as jest.Mock).mockReturnValue(client);

    // ConfigService finto: fornisce il base_topic atteso dai test e lascia
    // cadere il resto sui default, senza dover caricare un vero ConfigModule.
    const config: Record<string, string> = {
      ZIGBEE2MQTT_BASE_TOPIC: BASE_TOPIC,
      MQTT_BROKER_URL: 'mqtt://localhost:1883',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) => config[key] ?? def,
          },
        },
      ],
    }).compile();

    service = module.get<MqttService>(MqttService);
    service.onModuleInit(); // apre la (finta) connessione e registra gli handler
  });

  afterEach(() => jest.clearAllMocks());

  describe('catalogo dispositivi (bridge/devices)', () => {
    it('mappa i device e scarta il Coordinator', () => {
      client.emitMessage(`${BASE_TOPIC}/bridge/devices`, [
        { type: 'Coordinator', ieee_address: '0x00', friendly_name: 'stick' },
        {
          type: 'Router',
          ieee_address: '0x01',
          friendly_name: 'Hue Go',
          supported: true,
          definition: { vendor: 'Philips', model: '7146060PH' },
        },
      ]);
      client.emitMessage(`${BASE_TOPIC}/bridge/state`, { state: 'online' });

      const devices = service.listDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].friendlyName).toBe('Hue Go');
      expect(devices[0].vendor).toBe('Philips');
      expect(devices[0].offline).toBe(false);
    });

    it('richiede lo stato iniziale (.../get) dei device non ancora noti', () => {
      client.emitMessage(`${BASE_TOPIC}/bridge/devices`, [
        { type: 'Router', ieee_address: '0x01', friendly_name: 'Hue Go' },
      ]);
      expect(client.publish).toHaveBeenCalledWith(
        `${BASE_TOPIC}/Hue Go/get`,
        JSON.stringify({ state: '' }),
      );
    });

    it('non ri-richiede lo stato se già noto', () => {
      client.emitMessage(`${BASE_TOPIC}/Hue Go`, { state: 'ON' });
      client.publish.mockClear();
      client.emitMessage(`${BASE_TOPIC}/bridge/devices`, [
        { type: 'Router', ieee_address: '0x01', friendly_name: 'Hue Go' },
      ]);
      expect(client.publish).not.toHaveBeenCalledWith(
        `${BASE_TOPIC}/Hue Go/get`,
        expect.anything(),
      );
    });

    it('segna i device offline se il coordinatore è offline', () => {
      client.emitMessage(`${BASE_TOPIC}/bridge/devices`, [
        { type: 'Router', ieee_address: '0x01', friendly_name: 'Hue Go' },
      ]);
      client.emitMessage(`${BASE_TOPIC}/bridge/state`, { state: 'offline' });

      expect(service.listDevices()[0].offline).toBe(true);
    });
  });

  describe('stato dispositivo (ingestDeviceState)', () => {
    const announce = () =>
      client.emitMessage(`${BASE_TOPIC}/bridge/devices`, [
        { type: 'Router', ieee_address: '0x01', friendly_name: 'Hue Go' },
      ]);

    it('normalizza ON/OFF e converte la luminosità 0-254 → 0-100%', () => {
      announce();
      client.emitMessage(`${BASE_TOPIC}/Hue Go`, {
        state: 'ON',
        brightness: 254,
      });

      const state = service.getState('Hue Go');
      expect(state.state).toBe(true);
      expect(state.brightness).toBe(100);
    });

    it('converte il colore in formato xy → hex', () => {
      announce();
      // xy del rosso saturo (~0.64, 0.33)
      client.emitMessage(`${BASE_TOPIC}/Hue Go`, {
        state: 'ON',
        color: { x: 0.64, y: 0.33 },
      });

      const { color } = service.getState('Hue Go');
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      // Il canale rosso deve dominare
      const r = parseInt(color!.slice(1, 3), 16);
      const b = parseInt(color!.slice(5, 7), 16);
      expect(r).toBeGreaterThan(b);
    });

    it('tratta la modalità color_temp come "white"', () => {
      announce();
      client.emitMessage(`${BASE_TOPIC}/Hue Go`, {
        state: 'ON',
        color_mode: 'color_temp',
        color: { x: 0.4, y: 0.4 },
      });

      expect(service.getState('Hue Go').color).toBe('white');
    });

    it('preserva i campi precedenti su aggiornamenti parziali', () => {
      announce();
      client.emitMessage(`${BASE_TOPIC}/Hue Go`, {
        state: 'ON',
        brightness: 254,
      });
      client.emitMessage(`${BASE_TOPIC}/Hue Go`, { state: 'OFF' });

      const state = service.getState('Hue Go');
      expect(state.state).toBe(false);
      expect(state.brightness).toBe(100); // non azzerato
    });

    it('ignora i topic .../set e .../get (echo dei comandi)', () => {
      announce();
      client.emitMessage(`${BASE_TOPIC}/Hue Go/set`, { state: 'ON' });
      expect(service.getState('Hue Go').state).toBeUndefined();
    });
  });

  describe('comandi (publishSet)', () => {
    it('setPower pubblica ON/OFF sul topic .../set', () => {
      service.setPower('Hue Go', true);
      expect(client.publish).toHaveBeenCalledWith(
        `${BASE_TOPIC}/Hue Go/set`,
        JSON.stringify({ state: 'ON' }),
      );
    });

    it('setBrightness converte la percentuale in raw 0-254 e accende', () => {
      service.setBrightness('Hue Go', 100);
      expect(client.publish).toHaveBeenCalledWith(
        `${BASE_TOPIC}/Hue Go/set`,
        JSON.stringify({ state: 'ON', brightness: 254 }),
      );
    });

    it('setLight con state=false spegne soltanto', () => {
      service.setLight('Hue Go', false, 50, '#ff0000');
      expect(client.publish).toHaveBeenCalledWith(
        `${BASE_TOPIC}/Hue Go/set`,
        JSON.stringify({ state: 'OFF' }),
      );
    });

    it('setLight include luminosità e colore hex validato', () => {
      service.setLight('Hue Go', true, 100, 'ff0000');
      expect(client.publish).toHaveBeenCalledWith(
        `${BASE_TOPIC}/Hue Go/set`,
        JSON.stringify({
          state: 'ON',
          brightness: 254,
          color: { hex: '#ff0000' },
        }),
      );
    });

    it('setLight scarta un colore non valido', () => {
      service.setLight('Hue Go', true, 100, 'notacolor');
      expect(client.publish).toHaveBeenCalledWith(
        `${BASE_TOPIC}/Hue Go/set`,
        JSON.stringify({ state: 'ON', brightness: 254 }),
      );
    });

    it('non pubblica e ritorna false se il broker è disconnesso', () => {
      client.connected = false;
      const ok = service.setPower('Hue Go', true);
      expect(ok).toBe(false);
      expect(client.publish).not.toHaveBeenCalled();
    });
  });
});
