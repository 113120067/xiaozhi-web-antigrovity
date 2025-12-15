import { OpusEncoder } from '@discordjs/opus';
import { logger } from '../utils/logger';

export class AudioCodec {
    private encoder: OpusEncoder;

    constructor() {
        // 16000Hz, 1 channel
        // @discordjs/opus uses native bindings
        this.encoder = new OpusEncoder(16000, 1);
    }

    encode(pcm: Buffer): Buffer {
        try {
            return this.encoder.encode(pcm);
        } catch (e: any) {
            logger.error('Opus Encode failed:', e.message);
            return Buffer.alloc(0);
        }
    }

    decode(opus: Buffer): Buffer {
        try {
            return this.encoder.decode(opus);
        } catch (e: any) {
            logger.error('Opus Decode failed:', e.message);
            return Buffer.alloc(0);
        }
    }
}

export class AudioFrameBuffer {
    private buffer: Buffer;

    // 960 samples * 2 bytes (16-bit) = 1920 bytes
    private readonly frameSize = 1920;

    constructor() {
        this.buffer = Buffer.alloc(0);
    }

    feed(data: Buffer): Buffer[] {
        const chunks: Buffer[] = [];
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length >= this.frameSize) {
            const frame = this.buffer.subarray(0, this.frameSize);
            // Copy needed because subarray references same memory and we're shifting
            chunks.push(Buffer.from(frame));
            this.buffer = this.buffer.subarray(this.frameSize);
        }
        return chunks;
    }

    reset() {
        this.buffer = Buffer.alloc(0);
    }
}
