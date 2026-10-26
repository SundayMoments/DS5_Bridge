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

// Derived from the pinned cyw43-driver cyw43_ctrl.c station join path.
// This implementation is compiled by both the generated driver and host tests.
int cyw43_wifi_join(cyw43_t *self, size_t ssid_len, const uint8_t *ssid, size_t key_len,
                    const uint8_t *key, uint32_t auth_type, const uint8_t *bssid, uint32_t channel) {
    CYW43_THREAD_ENTER;
    if (!CYW43_STA_IS_ACTIVE(self)) {
        CYW43_THREAD_EXIT;
        return -CYW43_EPERM;
    }
    int ret = cyw43_ensure_up(self);
    if (ret) {
        CYW43_THREAD_EXIT;
        return ret;
    }
    // The ioctl wait can dispatch AUTH/LINK/PSK events synchronously. Initialize
    // before issuing the request; resetting afterward discards their progress.
    self->wifi_join_state = WIFI_JOIN_STATE_ACTIVE;
    if (auth_type == CYW43_AUTH_OPEN) self->wifi_join_state |= WIFI_JOIN_STATE_KEYED;
    ret = cyw43_ll_wifi_join(&self->cyw43_ll, ssid_len, ssid, key_len, key, auth_type, bssid, channel);
    if (ret != 0) self->wifi_join_state = WIFI_JOIN_STATE_FAIL;
    CYW43_THREAD_EXIT;
    return ret;
}

static void ds5_cyw43_wifi_rejoin(cyw43_t *self) {
    self->wifi_join_state = WIFI_JOIN_STATE_ACTIVE;
    cyw43_ll_wifi_rejoin(&self->cyw43_ll);
}
