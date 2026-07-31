/*
 * DOMOS - Nenko bridge (nRF52840 MDK USB Dongle, nRF Connect SDK v3.1.1 / Zephyr)
 * ------------------------------------------------------------------------------
 * legge dalla seriale USB (CDC ACM) una riga di ESADECIMALE e
 * trasmette quei byte come frame IEEE 802.15.4 grezzo sul canale 11 (Nenko).
 *
 * I flag mac_hdr_rdy + frame_secured dicono al driver: "questo e' gia' un frame
 * MAC completo, trasmettilo cosi' com'e' (replay fedele), non rigenerare header
 * ne' applicare sicurezza".
 *
 * USO (terminale seriale 115200): incolli il frame MAC in hex + INVIO. 
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/usb/usb_device.h>
#include <zephyr/sys/ring_buffer.h>
#include <zephyr/net/net_pkt.h>
#include <zephyr/net/ieee802154_radio.h>
#include <zephyr/net/ieee802154_pkt.h>

#define NENKO_CHANNEL   11
#define MAX_FRAME_LEN   125

static const struct device *const uart_dev =
    DEVICE_DT_GET_ONE(zephyr_cdc_acm_uart);
static const struct device *const radio_dev =
    DEVICE_DT_GET(DT_NODELABEL(ieee802154));

static struct ieee802154_radio_api *radio_api;

#define RING_BUF_SIZE 512
static uint8_t ring_buffer[RING_BUF_SIZE];
static struct ring_buf ringbuf;

static uint8_t frame[MAX_FRAME_LEN];
static uint8_t frame_len;
static uint8_t hi_nibble;
static bool    have_nibble;

static int hex_val(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void transmit_frame(void)
{
    if (frame_len == 0) {
        return;
    }

    struct net_pkt *pkt = net_pkt_alloc_with_buffer(NULL, frame_len,
                            AF_UNSPEC, 0, K_NO_WAIT);
    if (!pkt) {
        printk("ERR: net_pkt_alloc\n");
        frame_len = 0;
        return;
    }

    if (net_pkt_write(pkt, frame, frame_len) < 0) {
        printk("ERR: net_pkt_write\n");
        net_pkt_unref(pkt);
        frame_len = 0;
        return;
    }

    /* Replay fedele: header MAC gia' pronto, nessuna sicurezza da applicare.
     * Senza questi flag il driver puo' alterare/rifiutare il frame grezzo. */
    net_pkt_set_ieee802154_mac_hdr_rdy(pkt, true);
    net_pkt_set_ieee802154_frame_secured(pkt, true);

    int ret = radio_api->tx(radio_dev, IEEE802154_TX_MODE_DIRECT,
                pkt, pkt->buffer);
    if (ret) {
        printk("ERR: tx %d\n", ret);
    } else {
        printk("OK %u byte\n", frame_len);
    }

    net_pkt_unref(pkt);
    frame_len = 0;
}

static void parse_char(char c)
{
    if (c == '\n' || c == '\r') {
        have_nibble = false;
        transmit_frame();
        return;
    }

    int v = hex_val(c);
    if (v < 0) {
        return;
    }

    if (!have_nibble) {
        hi_nibble = (uint8_t)v;
        have_nibble = true;
    } else {
        if (frame_len < MAX_FRAME_LEN) {
            frame[frame_len++] = (uint8_t)((hi_nibble << 4) | v);
        }
        have_nibble = false;
    }
}

static void uart_cb(const struct device *dev, void *user_data)
{
    ARG_UNUSED(user_data);

    while (uart_irq_update(dev) && uart_irq_is_pending(dev)) {
        if (!uart_irq_rx_ready(dev)) {
            continue;
        }
        uint8_t buf[64];
        int n = uart_fifo_read(dev, buf, sizeof(buf));
        if (n <= 0) {
            continue;
        }
        ring_buf_put(&ringbuf, buf, n);
    }
}

int main(void)
{
    if (!device_is_ready(uart_dev)) {
        return 0;
    }
    if (usb_enable(NULL)) {
        return 0;
    }

    ring_buf_init(&ringbuf, sizeof(ring_buffer), ring_buffer);

    uint32_t dtr = 0;
    while (!dtr) {
        uart_line_ctrl_get(uart_dev, UART_LINE_CTRL_DTR, &dtr);
        k_sleep(K_MSEC(100));
    }

    uart_irq_callback_user_data_set(uart_dev, uart_cb, NULL);
    uart_irq_rx_enable(uart_dev);

    if (!device_is_ready(radio_dev)) {
        printk("radio non pronta\n");
        return 0;
    }
    radio_api = (struct ieee802154_radio_api *)radio_dev->api;
    radio_api->set_channel(radio_dev, NENKO_CHANNEL);
    radio_api->start(radio_dev);

    printk("DOMOS Nenko bridge pronto (canale %d)\n", NENKO_CHANNEL);

    uint8_t c;
    while (1) {
        if (ring_buf_get(&ringbuf, &c, 1) == 1) {
            parse_char((char)c);
        } else {
            k_sleep(K_MSEC(2));
        }
    }
    return 0;
}
