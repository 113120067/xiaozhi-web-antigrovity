import axios from 'axios';
import { config } from '../config';
import { deviceIdentity } from './device-identity';
import { XiaozhiOTAInfo } from './xiaozhi-proto';
import { logger } from '../utils/logger';

export class OTAClient {
    async getServerAddress(): Promise<string> {
        const mac = deviceIdentity.macAddress;
        const clientId = deviceIdentity.clientId;

        const payload: XiaozhiOTAInfo = {
            version: 2,
            flash_size: 16777216,
            psram_size: 0,
            minimum_free_heap_size: 8318916,
            mac_address: mac,
            uuid: clientId,
            chip_model_name: "esp32s3",
            chip_info: { model: 9, cores: 2, revision: 2, features: 18 },
            application: {
                name: "xiaozhi",
                version: "1.1.2",
                idf_version: "v5.3.2-dirty",
            },
            partition_table: [],
            ota: { label: "factory" },
            board: {
                type: "bread-compact-wifi",
                ip: "192.168.1.100", // Fake IP
                mac: mac,
            },
        };

        const headers = {
            "Device-Id": mac,
            "Content-Type": "application/json",
        };

        try {
            logger.info(`Checking OTA at ${config.OTA_VERSION_URL}...`);
            console.log('Payload:', JSON.stringify(payload));
            const response = await axios.post(config.OTA_VERSION_URL, payload, { headers, timeout: 10000 });
            console.log('Response Status:', response.status);

            if (response.status !== 200) {
                throw new Error(`OTA Server returned status ${response.status}`);
            }

            const data = response.data;
            if (data && data.mqtt) {
                // The 'mqtt' field contains connection info. 
                logger.info('OTA Info received. Device registered/updated.');
                // We don't actually use the data returned by OTA for connection in the current logic,
                // we just stick to the configured WS_URL. 
                // Destructuring removed to avoid potential runtime errors if structure mismatches.
                return config.WS_URL;
            }

            logger.info('OTA Info received (fallback).');
            return config.WS_URL;
        } catch (error: any) {
            logger.error('OTA Check failed:', error.message);
            // Fallback: Just return the configured URL, maybe server is down but WS works?
            return config.WS_URL;
        }
    }
}

export const otaClient = new OTAClient();
