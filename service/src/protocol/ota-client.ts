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
            const response = await axios.post(config.OTA_VERSION_URL, payload, { headers, timeout: 10000 });

            if (response.status !== 200) {
                throw new Error(`OTA Server returned status ${response.status}`);
            }

            const data = response.data;
            if (data.mqtt) {
                // The 'mqtt' field contains connection info. 
                // Example logic from Python suggests this is enough. 
                // Often it's a struct with 'domain', 'port'.
                // We need to construct the WS URL.
                const { domain, port, protocol } = data.mqtt;
                // If protocol is missing, assume 'ws' or 'wss' based on port? 
                // Or if the Python code used `config.WS_PROXY_URL` which came from OTA?
                // Let's re-read Python code carefully.
                // Python code: `proxy = WebSocketProxy(..., websocket_url=configuration.get_str("WS_URL"), ...)`
                // WAIT. `run_proxy` gets `WS_PROXY_URL` from config? 
                // Actually Python code says: 
                // `ws_proxy_url = configuration.get_str("WS_PROXY_URL")`
                // But `_update_ota_address` returns `response_data["mqtt"]`.
                // It seems the frontend/backend might be using a fixed URL `wss://api.xiaozhi.me/ws`?
                // Let's look at `ConfigManager` in Python or `run_proxy`.
                // `run_proxy` calls `_update_ota_address` but seemingly IGNORES the return value in `__init__`?
                // No, `WebSocketProxy` calls `_update_ota_address` in `__init__`, but it returns the data and... does it USE it? 
                // Python L103: `return response_data["mqtt"]`
                // But `__init__` (L51) calls `self._update_ota_address()`. It does NOT assign the result to anything!
                // IT JUST CALLS IT. 
                // This implies the call is just a "Checking in" or "Registration" step to let the server know "I am alive".
                // The actual `websocket_url` is passed in `__init__` from `configuration.get_str("WS_URL")`.

                logger.info('OTA Info received. Device registered/updated.');
                return config.WS_URL; // We stick to the configured WS URL
            }

            return config.WS_URL;
        } catch (error: any) {
            logger.error('OTA Check failed:', error.message);
            // Fallback: Just return the configured URL, maybe server is down but WS works?
            return config.WS_URL;
        }
    }
}

export const otaClient = new OTAClient();
