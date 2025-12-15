import WebSocket, { WebSocketServer } from 'ws';
import { config } from '../config';
import { logger } from '../utils/logger';
import { deviceIdentity } from '../protocol/device-identity';
import { OTAClient, otaClient } from '../protocol/ota-client';
import { AudioCodec, AudioFrameBuffer } from '../audio/codec';
import { WavHeader } from '../audio/wav';

/**
 * Converts Float32Array (as raw Buffer) to Int16Array Buffer
 * Assumes Little Endian
 */
function float32ToInt16(buffer: Buffer): Buffer {
    const floatView = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
    const int16Buffer = Buffer.alloc(floatView.length * 2);

    for (let i = 0; i < floatView.length; i++) {
        // Clamp between -1.0 and 1.0
        const s = Math.max(-1, Math.min(1, floatView[i]));
        // Scale to Int16 range
        const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
        int16Buffer.writeInt16LE(Math.floor(val), i * 2);
    }
    return int16Buffer;
}

export class WebSocketProxy {
    private wss: WebSocketServer;
    private codec: AudioCodec;
    private frameBuffer: AudioFrameBuffer;

    constructor() {
        this.wss = new WebSocketServer({ port: config.PORT, host: config.HOST });
        this.codec = new AudioCodec();
        this.frameBuffer = new AudioFrameBuffer();

        logger.info(`WebSocket Proxy listening on ${config.HOST}:${config.PORT}`);

        this.wss.on('connection', (clientWs, req) => {
            logger.info(`New frontend connection from ${req.socket.remoteAddress}`);
            this.handleConnection(clientWs);
        });
    }

    private async handleConnection(clientWs: WebSocket) {
        // 1. Get Server Address
        let serverUrl = config.WS_URL;
        try {
            serverUrl = await otaClient.getServerAddress();
        } catch (e) {
            logger.warn('Failed to get OTA address, using default');
        }

        logger.info(`Connecting to Xiaozhi Server: ${serverUrl}`);

        // 2. Connect to Cloud
        const headers = {
            "Device-Id": deviceIdentity.macAddress,
            "Client-Id": deviceIdentity.clientId,
            "Protocol-Version": "1",
            ...(config.DEVICE_TOKEN ? { "Authorization": `Bearer ${config.DEVICE_TOKEN}` } : {})
        };

        const serverWs = new WebSocket(serverUrl, { headers });

        // State for Audio Buffering (Server -> Client)
        let audioAccumulator = Buffer.alloc(0);
        const CHUNK_THRESHOLD = 64000; // ~64KB chunks like Python
        let totalSamplesAccumulated = 0;
        let isFirstAudio = true;

        // --- Server WS Events ---

        serverWs.on('open', () => {
            logger.info('Connected to Xiaozhi Cloud');
        });

        serverWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
            if (!isBinary) {
                // Text Message (Forward to Client)
                const text = data.toString();

                // Check for TTS events to reset buffer
                try {
                    const json = JSON.parse(text);
                    if (json.type === 'tts' && json.state === 'start') {
                        // Flush remaining audio if any? 
                        // Python code: if buffer > 44, send it.
                        if (audioAccumulator.length > 0) {
                            clientWs.send(this.wrapInWav(audioAccumulator, totalSamplesAccumulated));
                        }
                        audioAccumulator = Buffer.alloc(0);
                        totalSamplesAccumulated = 0;
                        isFirstAudio = true;
                    }
                    if (json.type === 'tts' && json.state === 'stop') {
                        // Flush
                        if (audioAccumulator.length > 0) {
                            clientWs.send(this.wrapInWav(audioAccumulator, totalSamplesAccumulated));
                        }
                        audioAccumulator = Buffer.alloc(0);
                        totalSamplesAccumulated = 0;
                        isFirstAudio = true;
                    }
                } catch { }

                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(text);
                }
            } else {
                // Binary (Opus Audio)
                const opusData = data as Buffer;
                const pcm = this.codec.decode(opusData);

                if (pcm.length > 0) {
                    audioAccumulator = Buffer.concat([audioAccumulator, pcm]);
                    totalSamplesAccumulated += pcm.length / 2; // 16-bit = 2 bytes

                    // If buffer is large enough, wrap in WAV and send
                    if (audioAccumulator.length >= CHUNK_THRESHOLD) {
                        const wavParams = this.wrapInWav(audioAccumulator, totalSamplesAccumulated);
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(wavParams);
                        }
                        // Check Python logic: "Completely reset buffer"
                        audioAccumulator = Buffer.alloc(0);
                        totalSamplesAccumulated = 0;
                        isFirstAudio = true; // Wait, Python resets this? Yes.
                    }
                }
            }
        });

        serverWs.on('close', () => {
            logger.info('Xiaozhi Cloud connection closed');
            clientWs.close();
        });

        serverWs.on('error', (err) => {
            logger.error('Xiaozhi Cloud error:', err.message);
            clientWs.close();
        });


        // --- Client WS Events ---

        clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
            if (!isBinary) {
                // Text from frontend -> Forward to Cloud
                if (serverWs.readyState === WebSocket.OPEN) {
                    serverWs.send(data);
                }
            } else {
                // Audio from frontend (Float32 PC) -> Opus -> Cloud
                const floatBuffer = data as Buffer;
                if (floatBuffer.length > 0) {
                    // 1. Convert Float32 to Int16
                    const pcmInt16 = float32ToInt16(floatBuffer);

                    // 2. Chunk into 960-sample frames
                    const frames = this.frameBuffer.feed(pcmInt16);

                    // 3. Encode and Send
                    if (serverWs.readyState === WebSocket.OPEN) {
                        for (const frame of frames) {
                            const opus = this.codec.encode(frame);
                            serverWs.send(opus);
                        }
                    }
                }
            }
        });

        clientWs.on('close', () => {
            logger.info('Client closed connection');
            serverWs.close();
            this.frameBuffer.reset();
        });
    }

    private wrapInWav(pcmData: Buffer, sampleCount: number): Buffer {
        // Create Header
        const header = WavHeader.create(sampleCount);
        return Buffer.concat([header, pcmData]);
    }
}
