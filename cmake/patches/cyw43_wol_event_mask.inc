/*
 * This file is part of the cyw43-driver
 *
 * Copyright (C) 2019-2022 George Robotics Pty Ltd
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Any redistribution, use, or modification in source or binary form is done
 *    solely for personal benefit and not for any commercial purpose or for
 *    monetary gain.
 *
 * THIS SOFTWARE IS PROVIDED BY THE LICENSOR AND COPYRIGHT OWNER "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE LICENSOR OR COPYRIGHT OWNER BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * This software is also available for use with certain devices under different
 * terms, as set out in the top level LICENSE file.  For commercial licensing
 * options please email contact@georgerobotics.com.au.
 */

// The event request uses an 18-byte name, a 4-byte BSS index, and 19 mask bytes.
static int ds5_cyw43_enable_wifi_events(cyw43_int_t *self, uint8_t *buf) {
    // spid_buf is reused by unrelated control/data traffic. The BSS index must
    // explicitly select STA (0), including after a previous WLAN DOWN cycle.
    memset(buf + 18, 0, 4);
    memset(buf + 18 + 4, 0xff, 19);
    const uint8_t suppressed[] = {19, 20, 40, 44, 54, 71};
    for (unsigned i = 0; i < sizeof(suppressed); ++i) {
        const uint8_t event = suppressed[i];
        buf[18 + 4 + event / 8] &= ~(1u << (event % 8));
    }
    memcpy(buf, "bsscfg:event_msgs", 18);
    return cyw43_do_ioctl(self, SDPCM_SET, WLC_SET_VAR, 18 + 4 + 19, buf, WWD_STA_INTERFACE);
}
