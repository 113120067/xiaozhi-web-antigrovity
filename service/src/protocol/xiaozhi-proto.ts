export interface XiaozhiOTAInfo {
    version: number;
    flash_size: number;
    psram_size: number;
    minimum_free_heap_size: number;
    mac_address: string;
    uuid: string; // client_id
    chip_model_name: string;
    chip_info: {
        model: number;
        cores: number;
        revision: number;
        features: number;
    };
    application: {
        name: string;
        version: string;
        idf_version: string;
    };
    partition_table: any[];
    ota: {
        label: string;
    };
    board: {
        type: string;
        ip: string;
        mac: string;
    };
}

export interface HelloPacket {
    type: "hello";
    version: number;
    transport: "websocket";
    audio_params: {
        format: "opus";
        sample_rate: 16000;
        channels: 1;
        frame_duration: 60; // ms
    };
}

export interface TTSPacket {
    type: "tts";
    state: "start" | "stop" | "sentence_start" | "sentence_end";
    text?: string;
}

export interface MQTTInfo {
    // The "mqtt" field in OTA response actually contains the websocket server url sometimes,
    // or specifically generic connection info.
    // Based on Python code: return response_data["mqtt"] which is used as ws_proxy_url.
    // It seems the field is named "mqtt" but contains the WS URL?
    // Let's assume it has keys like `domain`, `port`?
    // Actually Python code just returns it and parses it with `urlparse`.
    // Let's type it as any for now or refined later.
    domain: string;
    port: number;
    protocol: string; // 'ws' or 'wss'
}
