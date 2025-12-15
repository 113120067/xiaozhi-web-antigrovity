import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const IDENTITY_FILE = path.join(process.cwd(), '.device_identity');
import os from 'os';

export class DeviceIdentity {
    public macAddress: string;
    public clientId: string; // UUID

    constructor() {
        this.macAddress = '';
        this.clientId = '';
        this.loadOrGenerate();
    }

    private loadOrGenerate() {
        if (fs.existsSync(IDENTITY_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf-8'));
                if (data.macAddress && data.clientId) {
                    this.macAddress = data.macAddress;
                    this.clientId = data.clientId;
                    logger.info(`Loaded device identity: MAC=${this.macAddress}, ClientID=${this.clientId}`);
                    return;
                }
            } catch (e) {
                logger.error('Failed to load device identity file, regenerating...');
            }
        }

        this.macAddress = this.generateMacAddress();
        this.clientId = crypto.randomUUID();
        this.save();
        logger.info(`Generated new device identity: MAC=${this.macAddress}, ClientID=${this.clientId}`);
    }

    private generateMacAddress(): string {
        try {
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                if (interfaces[name]) {
                    for (const net of interfaces[name]!) {
                        // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
                        if (net.family === 'IPv4' && !net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                            logger.info(`Found system MAC address: ${net.mac} on interface ${name}`);
                            return net.mac.toUpperCase();
                        }
                    }
                }
            }
        } catch (e) {
            logger.error(`Failed to get system MAC address: ${e}. Falling back to random.`);
        }

        // Fallback to random if no valid MAC found
        const hexDigits = "0123456789ABCDEF";
        let macAddress = "";
        for (let i = 0; i < 6; i++) {
            let octet = Math.floor(Math.random() * 256);
            if (i === 0) {
                octet = octet & 0xFC | 0x02;
            }
            macAddress += (octet.toString(16).padStart(2, '0').toUpperCase());
            if (i != 5) macAddress += ":";
        }
        return macAddress;
    }

    private save() {
        const data = {
            macAddress: this.macAddress,
            clientId: this.clientId
        };
        fs.writeFileSync(IDENTITY_FILE, JSON.stringify(data, null, 2));
    }
}

export const deviceIdentity = new DeviceIdentity();
