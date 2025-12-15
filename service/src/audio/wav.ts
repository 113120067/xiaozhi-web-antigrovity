export class WavHeader {
    static create(totalSamples: number): Buffer {
        const buffer = Buffer.alloc(44);

        // RIFF chunk descriptor
        buffer.write('RIFF', 0);
        // ChunkSize: 36 + SubChunk2Size
        buffer.writeUInt32LE(36 + totalSamples * 2, 4);
        buffer.write('WAVE', 8);

        // fmt sub-chunk
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
        buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
        buffer.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
        buffer.writeUInt32LE(16000, 24); // SampleRate
        buffer.writeUInt32LE(32000, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
        buffer.writeUInt16LE(2, 32);  // BlockAlign (NumChannels * BitsPerSample/8)
        buffer.writeUInt16LE(16, 34); // BitsPerSample

        // data sub-chunk
        buffer.write('data', 36);
        buffer.writeUInt32LE(totalSamples * 2, 40); // Subchunk2Size (NumSamples * NumChannels * BitsPerSample/8)

        return buffer;
    }
}
