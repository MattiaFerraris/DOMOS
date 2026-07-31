# Nenko 802.15.4 modem — firmware nRF52840 (GeeekPi dongle)

App custom (~150 righe, `main.c`) che trasforma il dongle nRF52840 in un
"modem" 802.15.4 grezzo comandato via seriale USB. Nessuno stack MAC/Zigbee:
riceve dall'host i byte di un frame gia' pronto e li trasmette con il driver
`nrf_802154`. Serve a **replicare** i pacchetti del telecomando Nenko catturati
in Wireshark.

## Protocollo seriale (host ⇄ dongle)

Una riga = un comando, terminatore `\n`. Il dongle risponde `OK` / `ERR ...`.

| Comando           | Effetto                                              | Risposta        |
|-------------------|------------------------------------------------------|-----------------|
| `CH <11..26>`     | imposta il canale 802.15.4                            | `OK` / `ERR CH range` |
| `TX <hex>`        | trasmette i byte MAC (esadecimale, spazi ignorati)   | `OK` / `ERR ...` |

**Regola FCS (importante):** manda il frame MAC **SENZA gli ultimi 2 byte di
FCS** che vedi in Wireshark. Il PHR e il CRC li mette il firmware/hardware.
Esempio: se in Wireshark il frame e' `61 88 A1 CD AB ... 4E 7C` e `4E 7C` e' la
FCS, invii `TX 6188A1CDAB...` (tutto tranne `4E 7C`).

## Build (nRF5 SDK)

Il progetto si appoggia all'esempio USB CDC ACM dell'nRF5 SDK, a cui aggiungiamo
il radio driver `nrf_802154`.

1. Scarica **nRF5 SDK 17.1.0** (contiene sia `app_usbd_cdc_acm` che
   `nrf_802154`) e la **GNU Arm Embedded Toolchain**.
2. Parti da:
   `<SDK>/examples/peripheral/usbd_cdc_acm/pca10059/blank/armgcc/`
   copiane `Makefile` e `config/sdk_config.h` in questa cartella e sostituisci
   `main.c` con il nostro.
3. Nel `Makefile` aggiungi ai sorgenti e agli include il radio driver:
   - sorgenti `nrf_802154` (`$(SDK_ROOT)/components/drivers_nrf/nrf_radio_802154/...`
     — l'elenco esatto e' nel `Makefile` dell'esempio
     `examples/802_15_4/...`, copiane la sezione `nrf_802154`).
   - abilita in `sdk_config.h`: `NRF_802154_ENABLED 1`, e tieni attivi
     `APP_USBD_ENABLED`, `APP_USBD_CDC_ACM_ENABLED`, `NRF_DRV_CLOCK`/`CLOCK_ENABLED`.
4. `make` → produce `_build/nrf52840_xxaa.hex`.

> Nota: senza SoftDevice (non serve, niente BLE), l'app usa direttamente RADIO +
> USBD. Se il tuo SDK monta una versione di `nrf_802154` con l'API a
> `metadata`, cambia la sola chiamata `nrf_802154_transmit_raw(psdu, false)` in
> `nrf_802154_transmit_raw(psdu, &metadata)` (vedi commento in `main.c`).

## Flash (GeeekPi nRF52840)

Il GeeekPi e' un clone stile Nordic/MakerDiary: puo' montare **uno di due
bootloader**. Scoprilo cosi': tieni premuto **RESET** e inserisci il dongle
nella USB.

- **Compare un drive USB** (es. `MDK-DONGLE` / `NRF52BOOT`) → bootloader **UF2**.
  Converti l'hex e trascina il file:
  ```
  python uf2conv.py _build/nrf52840_xxaa.hex -c -f 0xADA52840 -o firmware.uf2
  # poi copia firmware.uf2 sul drive: il dongle si riavvia da solo
  ```
- **NON compare un drive** ma il LED pulsa (rosso) → **Nordic Open Bootloader**
  (DFU). Usa `nrfutil`:
  ```
  nrfutil pkg generate --hw-version 52 --sd-req 0x00 \
      --application _build/nrf52840_xxaa.hex \
      --application-version 1 app_dfu.zip
  nrfutil dfu usb-serial -pkg app_dfu.zip -p /dev/tty.usbmodemXXXX
  ```
  (In alternativa, GUI: **nRF Connect for Desktop → Programmer**, che gestisce
  entrambi i casi.)

## Test rapido (senza DOMOS)

Con un qualsiasi terminale seriale (es. `screen /dev/tty.usbmodemXXXX 115200`):
```
CH 15
TX 6188A1CDAB...        <- frame catturato, senza i 2 byte di FCS
```
Verifica in Wireshark (sniffer sullo stesso canale) che il frame trasmesso sia
identico a quello del telecomando (campi + `FCS [correct]`). Poi prova sulla luce.
