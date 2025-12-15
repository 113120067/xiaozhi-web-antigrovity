import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const IDENTITY_FILE = path.join(process.cwd(), '.device_identity');

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
        // Generate a random valid unicast MAC address
        const hexDigits = "0123456789ABCDEF";
        let macAddress = "";
        for (let i = 0; i < 6; i++) {
            let octet = Math.floor(Math.random() * 256);
            if (i === 0) {
                // Ensure it's a unicast address and locally administered (bit 1=1, bit 0=0 is typical for local)
                // Actually just random is fine for emulation usually, but let's be safe.
                // x2, x6, xA, xE are locally administered.
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
