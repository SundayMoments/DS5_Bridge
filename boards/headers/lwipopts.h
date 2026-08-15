// lwIP configuration for the WOL-over-Wi-Fi feature (Waveshare RP2350B-Plus-W).
//
// DS5 Bridge owns its own bare-metal core-0 loop (see CMakeLists.txt comment
// on TINYUSB_OPT_OS) and polls CYW43 via pico_cyw43_arch_lwip_poll, so lwIP
// runs NO_SYS=1 (raw/callback API only, no sockets/netconn/OS layer) on the
// same core-0 loop as BTstack and TinyUSB. Only DHCP (to get an IP) and UDP
// (to send the magic packet) are needed -- no TCP, PPP, or SNMP.
#ifndef LWIP_LWIPOPTS_H
#define LWIP_LWIPOPTS_H

#define NO_SYS                      1
#define LWIP_SOCKET                 0
#define LWIP_NETCONN                0
#define LWIP_NETIF_API              0

#define LWIP_IPV4                   1
#define LWIP_IPV6                   0

#define LWIP_ARP                    1
#define LWIP_ICMP                   1
#define LWIP_RAW                    0

#define LWIP_UDP                    1
#define LWIP_TCP                    0
#define LWIP_DHCP                   1
#define LWIP_AUTOIP                 0
#define LWIP_DNS                    0
#define LWIP_IGMP                   0

// Skip the DHCP client's post-lease ARP conflict check (ping the offered
// address and wait out a timeout before binding). We're the only device
// using this address on a network we don't control conflict-detection
// policy for, and the CYW43 combo chip shares its radio with Bluetooth --
// shortening the DHCP handshake shrinks the window where fresh Wi-Fi RF
// activity can contend with a just-opened BT connection for the radio.
// See awalol/DS5Dongle#207 for prior art on this option in the same
// Wi-Fi/BT coexistence context.
#define DHCP_DOES_ARP_CHECK         0
#define LWIP_DHCP_DOES_ACD_CHECK    0

#define MEM_ALIGNMENT               4
// Small heap: one outbound UDP magic packet (~102 bytes) plus DHCP/ARP
// control traffic at a time. Not shared with any other subsystem.
#define MEM_SIZE                    4096

#define MEMP_NUM_PBUF               8
#define MEMP_NUM_UDP_PCB            4
#define MEMP_NUM_SYS_TIMEOUT        8
#define MEMP_NUM_NETBUF             2
#define MEMP_NUM_ARP_QUEUE          2

#define PBUF_POOL_SIZE              8
#define PBUF_POOL_BUFSIZE           256

#define TCPIP_THREAD_STACKSIZE      0
#define DEFAULT_THREAD_STACKSIZE    0
#define DEFAULT_RAW_RECVMBOX_SIZE   0
#define DEFAULT_UDP_RECVMBOX_SIZE   0
#define DEFAULT_TCP_RECVMBOX_SIZE   0
#define DEFAULT_ACCEPTMBOX_SIZE     0

#define LWIP_NETIF_STATUS_CALLBACK  1
#define LWIP_NETIF_LINK_CALLBACK    1

#define LWIP_STATS                  0
#define LWIP_STATS_DISPLAY          0

#define SYS_LIGHTWEIGHT_PROT        0

#ifndef NDEBUG
#define LWIP_DEBUG                  0
#endif

#endif // LWIP_LWIPOPTS_H
