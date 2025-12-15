import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { WebSocket } from 'ws'; // Import type for compatibility
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
    private fastify: FastifyInstance;
    private codec: AudioCodec;
    private frameBuffer: AudioFrameBuffer;

    constructor() {
        this.fastify = Fastify();
        this.codec = new AudioCodec();
        this.frameBuffer = new AudioFrameBuffer();
    }

    public async start() {
        try {
            // 1. Register Plugins
            await this.fastify.register(cors, {
                origin: true, // Allow all origins (reflection)
                methods: ['GET', 'POST', 'OPTIONS']
            });
            await this.fastify.register(websocket);

            // 2. Define Routes

            // HTTP /config
            this.fastify.get('/config', async (request, reply) => {
                const responseData = {
                    data: {
                        device_id: deviceIdentity.macAddress,
                        ws_url: config.WS_URL,
                        ws_proxy_url: `:${config.PORT}`, // Frontend appends this to ip.
                        ota_version_url: config.OTA_VERSION_URL,
                        token_enable: false,
                        token: "",
                        backend_url: `http://${config.HOST}:${config.PORT}`
                    }
                };
                return responseData;
            });

            // WebSocket / (Root)
            this.fastify.get('/', { websocket: true }, (connection: any, req: any) => {
                logger.info(`New frontend connection from ${req.socket.remoteAddress}`);
                // Verify it's a 'ws' WebSocket (fastify-websocket wraps it)
                let wsFunc = connection.socket;
                if (!wsFunc && connection.on) {
                    // It seems connection IS the socket in some versions/configs
                    wsFunc = connection;
                    logger.info("Using connection object directly as WebSocket");
                }

                if (!wsFunc) {
                    logger.error(`Invalid connection object. Keys: ${connection ? Object.keys(connection) : 'null'}`);
                    return;
                }

                this.handleConnection(wsFunc as unknown as WebSocket).catch(err => {
                    logger.error(`Connection handling error: ${err.message}`);
                });
            });

            // 3. Start Server
            await this.fastify.listen({ port: config.PORT, host: config.HOST });
            logger.info(`Service listening on ${config.HOST}:${config.PORT}`);

        } catch (err: any) {
            logger.error("Failed to start server", err.message);
            process.exit(1);
        }
    }

    private async handleConnection(clientWs: WebSocket) {
        if (!clientWs) {
            logger.error("handleConnection called with undefined clientWs");
            return;
        }

        // Buffer for messages before server is ready
        const messageBuffer: any[] = [];
        let serverWs: WebSocket | null = null;

        // Subscribe to client messages IMMEDIATELY to avoid losing "Hello" during OTA await

        // @ts-ignore
        clientWs.on('message', (data: any, isBinary: boolean) => {
            if (!serverWs || serverWs.readyState !== WebSocket.OPEN) {
                // Buffer message if server not ready
                messageBuffer.push({ data, isBinary });
                return;
            }
            this.processClientMessage(data, isBinary, serverWs);
        });

        clientWs.on('close', () => {
            logger.info('Client closed connection');
            if (serverWs) serverWs.close();
            this.frameBuffer.reset();
        });

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
        const CHUNK_THRESHOLD = 64000;
        let totalSamplesAccumulated = 0;
        let isFirstAudio = true;

        // --- Server WS Events ---

        serverWs.on('open', () => {
            logger.info('Connected to Xiaozhi Cloud');
            // Flush buffer
            while (messageBuffer.length > 0) {
                const { data, isBinary } = messageBuffer.shift();
                this.processClientMessage(data, isBinary, serverWs!);
            }
        });

        // @ts-ignore
        serverWs.on('message', (data: any, isBinary: boolean) => {
            if (!isBinary) {
                // Text Message (Forward to Client)
                const text = data.toString();

                // Check for TTS events to reset buffer
                try {
                    const json = JSON.parse(text);
                    if (json.type === 'tts' && json.state === 'start') {
                        // Flush remaining audio if any? 
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

        serverWs.on('close', (code, reason) => {
            logger.warn(`Xiaozhi Cloud connection closed: Code = ${code}, Reason = ${reason.toString()} `);
            clientWs.close();
        });

        serverWs.on('error', (err) => {
            logger.error(`Xiaozhi Cloud error: ${err.message} `);
            clientWs.close();
        });
    }

    private wrapInWav(pcmData: Buffer, sampleCount: number): Buffer {
        // Create Header
        const header = WavHeader.create(sampleCount);
        return Buffer.concat([header, pcmData]);
    }

    private processClientMessage(data: any, isBinary: boolean, serverWs: WebSocket) {
        if (!isBinary) {
            // Text from frontend -> Forward to Cloud
            const text = data.toString();
            if (serverWs.readyState === WebSocket.OPEN) {
                serverWs.send(text);
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
    }
}
