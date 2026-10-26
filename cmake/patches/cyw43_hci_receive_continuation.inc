static void hci_transport_cyw43_process(void) {
    CYW43_THREAD_LOCK_CHECK
    uint32_t len = 0;
    bool has_work;
#ifdef PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT
    uint32_t loop_count = 0;
#endif
    do {
        int err = cyw43_bluetooth_hci_read(cyw43_receive_buffer, CYW43_PACKET_HEADER_SIZE + HCI_INCOMING_PACKET_BUFFER_SIZE , &len);
        BT_DEBUG("bt in len=%lu err=%d\n", len, err);
        if (err == 0 && len > 0) {
            hci_transport_cyw43_packet_handler(cyw43_receive_buffer[3], &cyw43_receive_buffer[CYW43_PACKET_HEADER_SIZE], len - CYW43_PACKET_HEADER_SIZE);
            has_work = true;
        } else {
            has_work = false;
        }
// PICO_CONFIG: PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT, limit the max number of iterations of the hci processing loop, type=int, advanced=true, group=pico_btstack
#ifdef PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT
        if (++loop_count >= PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT) {
            // Preserve the batch limit; service possible remaining packets on
            // the next async-context poll without requiring another radio IRQ.
            if (has_work) {
                btstack_run_loop_poll_data_sources_from_irq();
            }
            break;
        }
#endif
    } while (has_work);
}
