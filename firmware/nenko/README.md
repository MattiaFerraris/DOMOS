# Nenko 802.15.4 modem — firmware nRF52840 (dongle MDK USB)

App Zephyr (~170 righe, `src/main.c`) che trasforma un dongle nRF52840 in un
"modem" 802.15.4 grezzo comandato via seriale USB. Nessuno stack MAC/Zigbee:
riceve dall'host i byte di un frame gia' pronto e li ritrasmette con il driver
radio `ieee802154` di Zephyr. Serve a **replicare** i pacchetti del telecomando
Nenko catturati in Wireshark con l'nRF Sniffer 802.15.4.

Build sistema: **nRF Connect SDK v3.1.1 / Zephyr** (`CMakeLists.txt` + `prj.conf`).

## Protocollo seriale (host ⇄ dongle)

**Una riga = un frame.** Si incolla il frame MAC in **esadecimale nudo** seguito
da `\n`: nessun comando, nessun prefisso.

| Invio | Effetto | Risposta |
|---|---|---|
| `6188A1CDAB…` + `\n` | trasmette quei byte come frame 802.15.4 | `OK <n> byte` |
| — | errore di allocazione / scrittura / TX | `ERR: net_pkt_alloc`, `ERR: net_pkt_write`, `ERR: tx <code>` |

Dettagli che contano:

- **Il canale e' fisso a 11**, compilato nel firmware (`NENKO_CHANNEL`, `main.c:23`).
  Non esiste un comando per cambiarlo: per un altro canale si ricompila.
- I caratteri non esadecimali nella riga vengono **ignorati**, quindi gli spazi
  di separazione sono ammessi (`61 88 A1` == `6188A1`).
- Lunghezza massima **125 byte** (`MAX_FRAME_LEN`); i byte oltre il limite sono scartati.
- Il firmware attende **DTR alto** prima di abilitare la RX (`main.c:140-144`):
  un terminale seriale lo alza da solo, e `NenkoService` lo forza esplicitamente.
- Il buffer e' singolo: si invia un frame e si aspetta `OK`/`ERR` prima del successivo.
- Il replay e' fedele grazie ai flag `mac_hdr_rdy` + `frame_secured` sul `net_pkt`:
  dicono al driver "questo e' gia' un frame MAC completo, non rigenerare header
  ne' applicare sicurezza".

**Regola FCS (importante):** manda il frame MAC **SENZA gli ultimi 2 byte di
FCS** che vedi in Wireshark. Il PHR e il CRC li mette il firmware/hardware.
Esempio: se in Wireshark il frame e' `61 88 A1 CD AB ... 4E 7C` e `4E 7C` e' la
FCS, invii `6188A1CDAB...` (tutto tranne `4E 7C`).

## Build

Serve un workspace nRF Connect SDK / Zephyr gia' inizializzato (`west`) e la
toolchain Zephyr SDK.

```bash
cd firmware/nenko
west build -b nrf52840_mdk_usb_dongle .      # → build/zephyr/zephyr.hex
```

> Verifica il nome esatto della board con `west boards | grep -i dongle`: su NCS 3.x
> (hardware model v2) puo' servire la forma `<board>/nrf52840`. Per il dongle
> Nordic ufficiale il target e' invece `nrf52840dongle/nrf52840`.

La configurazione sta tutta in `prj.conf`: USB CDC ACM (stack legacy, con
`CONFIG_USB_DEVICE_INITIALIZE_AT_BOOT=n` perche' e' l'app a chiamare
`usb_enable()`), driver `CONFIG_IEEE802154_NRF5` senza IP, e
`CONFIG_LOG_PRINTK=n` in modo che l'ACK `OK n byte` esca subito invece di
finire nel logging differito di Zephyr.

## Flash

In `build/nenko.uf2` c'e' gia' l'artefatto pronto: se non vuoi ricompilare,
salta direttamente al drag & drop.

Il dongle puo' montare **uno di due bootloader**. Scoprilo cosi': tieni premuto
**RESET** e inserisci il dongle nella USB.

- **Compare un drive USB** (es. `MDK-DONGLE` / `NRF52BOOT`) → bootloader **UF2**.
  Trascina `build/nenko.uf2` sul drive: il dongle si riavvia da solo.
  Per rigenerare l'uf2 da una build nuova:
  ```bash
  python uf2conv.py build/zephyr/zephyr.hex -c -f 0xADA52840 -o build/nenko.uf2
  ```
- **NON compare un drive** ma il LED pulsa (rosso) → **Nordic Open Bootloader** (DFU):
  ```bash
  nrfutil pkg generate --hw-version 52 --sd-req 0x00 \
      --application build/zephyr/zephyr.hex \
      --application-version 1 app_dfu.zip
  nrfutil dfu usb-serial -pkg app_dfu.zip -p /dev/tty.usbmodemXXXX
  ```
  (In alternativa, GUI: **nRF Connect for Desktop → Programmer**, che gestisce
  entrambi i casi.)

## Test rapido (senza DOMOS)

Con un qualsiasi terminale seriale (es. `screen /dev/tty.usbmodemXXXX 115200`),
all'apertura deve comparire:

```
DOMOS Nenko bridge pronto (canale 11)
```

Poi incolla un frame catturato, senza i 2 byte di FCS, e premi INVIO:

```
6188A1CDAB...
OK 24 byte
```

Verifica in Wireshark (sniffer sullo stesso canale 11) che il frame trasmesso
sia identico a quello del telecomando (campi + `FCS [correct]`). Poi prova sulla
luce.

## Integrazione con DOMOS

Il backend parla con questo firmware tramite `NenkoService`
(`backend/src/devices/nenko/nenko.service.ts`):

- `NENKO_SERIAL_PATH` nel `.env` del backend indica la porta del dongle
  (es. `/dev/tty.usbmodem1101`); se e' vuota il service resta disattivo.
- I frame da ritrasmettere stanno in
  `backend/src/devices/nenko/nenko-buttons.json`, un tasto per voce, con
  `label`, `tipo` (`colore` / `effetto`), `rgb` e `frame` (24 byte hex, senza FCS).
  Il blocco `_meta` dello stesso file annota i parametri della cattura: canale 11,
  PAN id `0x0005`, sorgente `0x3134`, destinazione broadcast, nessuna sicurezza.
- Le API sono documentate in [`backend/README.md`](../../backend/README.md#apinenko--nenko-light).
