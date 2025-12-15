import { WebSocketProxy } from './transport/websocket-proxy';
import { logger } from './utils/logger';

async function main() {
    try {
        const proxy = new WebSocketProxy();
        await proxy.start();
        logger.info('Service started successfully.');

        // Keep alive? WS Server keeps process alive.
    } catch (e: any) {
        logger.error('Fatal Error:', e.message);
        process.exit(1);
    }
}

main();
