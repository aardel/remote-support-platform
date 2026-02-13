/**
 * Wake-on-LAN service — sends magic packets using Node.js built-in dgram.
 * No external dependencies required.
 */
const dgram = require('dgram');

/**
 * Parse a MAC address string (AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF) into a 6-byte Buffer.
 */
function parseMac(mac) {
    const cleaned = mac.replace(/[:\-]/g, '');
    if (cleaned.length !== 12 || !/^[0-9a-fA-F]{12}$/.test(cleaned)) {
        throw new Error(`Invalid MAC address: ${mac}`);
    }
    return Buffer.from(cleaned, 'hex');
}

/**
 * Build a 102-byte WOL magic packet:
 *   6 bytes of 0xFF followed by the target MAC address repeated 16 times.
 */
function buildMagicPacket(macAddress) {
    const macBuffer = parseMac(macAddress);
    const packet = Buffer.alloc(102);

    // First 6 bytes: 0xFF
    for (let i = 0; i < 6; i++) {
        packet[i] = 0xff;
    }

    // Next 96 bytes: MAC address repeated 16 times
    for (let i = 0; i < 16; i++) {
        macBuffer.copy(packet, 6 + i * 6);
    }

    return packet;
}

/**
 * Send a Wake-on-LAN magic packet to the broadcast address.
 * @param {string} macAddress - Target MAC in AA:BB:CC:DD:EE:FF format
 * @param {Object} [options]
 * @param {string} [options.address='255.255.255.255'] - Broadcast address
 * @param {number} [options.port=9] - UDP port (standard WOL port)
 * @returns {Promise<void>}
 */
function sendWolPacket(macAddress, options = {}) {
    const address = options.address || '255.255.255.255';
    const port = options.port || 9;
    const packet = buildMagicPacket(macAddress);

    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');

        socket.once('error', (err) => {
            try { socket.close(); } catch (_) { }
            reject(err);
        });

        socket.bind(() => {
            socket.setBroadcast(true);
            socket.send(packet, 0, packet.length, port, address, (err) => {
                socket.close();
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    });
}

module.exports = { sendWolPacket, buildMagicPacket, parseMac };
