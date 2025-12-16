import dotenv from 'dotenv';
import path from 'path';

// Load .env from service root
dotenv.config();

export const config = {
    // Device Identity
    DEVICE_ID: (process.env.DEVICE_ID || '').trim(), // If empty, will auto-generate
    DEVICE_TOKEN: (process.env.DEVICE_TOKEN || '').trim(),

    // Server URLs
    WS_URL: (process.env.WS_URL || 'wss://api.tenclass.net/xiaozhi/v1/').trim(),
    OTA_VERSION_URL: (process.env.OTA_VERSION_URL || 'https://api.tenclass.net/xiaozhi/ota/').trim(),

    // Security
    ALLOWED_ORIGIN: (process.env.ALLOWED_ORIGIN || '*').trim(), // Default to * for dev context, but user should set this in prod

    // Local Server
    PORT: parseInt(process.env.PORT || '8080', 10),
    HOST: process.env.HOST || '0.0.0.0',

    // Audio
    SAMPLE_RATE: 16000,
    FRAME_SIZE: 960, // 60ms at 16kHz ? No, 960 samples / 16000 = 60ms. Standard Opus frame size is usually 20ms (320), 40ms (640), 60ms (960). Python code used 960.
};
