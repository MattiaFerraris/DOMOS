import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import { SerialPort } from 'serialport';
import { NenkoService } from './nenko.service';
import buttons from './nenko-buttons.json';

// La seriale è finta: un EventEmitter con write/set/close spiati.
// Le factory dei mock leggono mockPort/mockParser al momento della `new`,
// quindi vedono le istanze create nel beforeEach.
jest.mock('serialport', () => ({
  SerialPort: jest.fn().mockImplementation(() => mockPort),
}));
jest.mock('@serialport/parser-readline', () => ({
  ReadlineParser: jest.fn().mockImplementation(() => mockParser),
}));

class FakePort extends EventEmitter {
  pipe = jest.fn(() => mockParser);
  set = jest.fn((_opts: unknown, cb?: (err: Error | null) => void) =>
    cb?.(null),
  );
  write = jest.fn();
  close = jest.fn();
}

let mockPort: FakePort;
let mockParser: EventEmitter;

const BUTTONS = buttons.tasti as Record<
  string,
  { tipo: string; frame: string }
>;
const flush = () => new Promise((resolve) => setImmediate(resolve));

// ConfigService finto: solo NENKO_SERIAL_PATH, il resto torna il default.
const fakeConfig = (path: string) =>
  ({
    get: (key: string, def?: unknown) =>
      key === 'NENKO_SERIAL_PATH' ? path : def,
  }) as unknown as ConfigService;

describe('NenkoService', () => {
  let service: NenkoService;

  beforeEach(() => {
    mockParser = new EventEmitter();
    mockPort = new FakePort();
    // Di default il firmware risponde OK al frame successivo.
    mockPort.write.mockImplementation(() => {
      setImmediate(() => mockParser.emit('data', 'OK 24 byte'));
      return true;
    });

    service = new NenkoService(fakeConfig('/dev/tty.fake'));
    service.onModuleInit();
    mockPort.emit('open'); // il firmware è pronto (DTR alto)
  });

  afterEach(() => jest.clearAllMocks());

  describe('presets', () => {
    it('espone i tasti con i metadati, senza i frame grezzi', () => {
      const presets = service.listPresets();

      expect(presets).toHaveLength(Object.keys(BUTTONS).length);
      expect(presets).toContainEqual({
        name: 'rosso',
        label: 'Rosso',
        tipo: 'colore',
        rgb: '#FF0000',
      });
      expect(presets.every((p) => !('frame' in p))).toBe(true);
    });

    it('parte senza stato: nessun preset inviato', () => {
      expect(service.getState()).toEqual({});
    });
  });

  describe('sendPreset', () => {
    it('scrive sulla seriale il frame catturato + newline e salva lo stato', async () => {
      expect(await service.sendPreset('rosso')).toBe(true);

      expect(mockPort.write).toHaveBeenCalledWith(`${BUTTONS.rosso.frame}\n`);
      expect(service.getState()).toEqual({ color: 'rosso' });
    });

    it('alza DTR/RTS all’apertura della porta', () => {
      expect(mockPort.set).toHaveBeenCalledWith(
        { dtr: true, rts: true },
        expect.any(Function),
      );
    });

    it('rifiuta un preset inesistente senza toccare la seriale', async () => {
      expect(await service.sendPreset('viola')).toBe(false);
      expect(mockPort.write).not.toHaveBeenCalled();
    });

    it('con risposta ERR ritorna false e non aggiorna lo stato', async () => {
      mockPort.write.mockImplementation(() => {
        setImmediate(() => mockParser.emit('data', 'ERR: tx -5'));
        return true;
      });

      expect(await service.sendPreset('blu')).toBe(false);
      expect(service.getState()).toEqual({});
    });

    it('arcobaleno trasmette un frame di tipo "colore" scelto a caso', async () => {
      const colori = Object.entries(BUTTONS).filter(
        ([, b]) => b.tipo === 'colore',
      );

      expect(await service.sendPreset('arcobaleno')).toBe(true);

      const written = (mockPort.write.mock.calls[0] as [string])[0].trim();
      expect(colori.map(([, b]) => b.frame)).toContain(written);
      // lo stato riporta il colore estratto, non "arcobaleno"
      expect(colori.map(([name]) => name)).toContain(service.getState().color);
    });
  });

  describe('coda seriale', () => {
    it('invia un frame alla volta, aspettando la risposta del firmware', async () => {
      mockPort.write.mockImplementation(() => true); // nessuna risposta automatica

      const first = service.sendPreset('rosso');
      const second = service.sendPreset('verde');
      await flush();

      expect(mockPort.write).toHaveBeenCalledTimes(1); // il secondo è in coda

      mockParser.emit('data', 'OK 24 byte');
      await first;
      await flush();

      expect(mockPort.write).toHaveBeenCalledTimes(2);
      mockParser.emit('data', 'OK 24 byte');
      expect(await second).toBe(true);
    });

    it('senza risposta entro 1s va in timeout e ritorna false', async () => {
      jest.useFakeTimers();
      mockPort.write.mockImplementation(() => true); // firmware muto

      const pending = service.sendPreset('rosso');
      await jest.advanceTimersByTimeAsync(1000);

      expect(await pending).toBe(false);
      expect(service.getState()).toEqual({});
      jest.useRealTimers();
    });
  });

  describe('seriale non configurata', () => {
    it('senza NENKO_SERIAL_PATH non apre la porta e i comandi falliscono', async () => {
      jest.clearAllMocks();
      const inattivo = new NenkoService(fakeConfig(''));
      inattivo.onModuleInit();

      expect(SerialPort).not.toHaveBeenCalled();
      expect(await inattivo.sendPreset('rosso')).toBe(false);
    });
  });
});
