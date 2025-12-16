# 小智雲端服務 (Xiaozhi Cloud) 開發規格書

本文件記錄了與「小智 AI 雲端服務 (Tenclass)」進行通訊的協定細節。此規格是在進行 `xiaozhi-web-antigrovity` 專案開發與除錯時整理而得，供未來開發參考。

## 1. 系統架構概念

小智的連線機制模擬了一台 IoT 硬體裝置。要成功連線，必須經過两个主要步驟：
1.  **OTA 檢查 (設備報到)**：向 OTA 伺服器註冊/更新設備狀態。
2.  **WebSocket 連線**：建立長連線進行語音與文字溝通。

> **⚠️ 關鍵注意事項**：
> 2025/12 的最新測試顯示，WebSocket 連線使用的 `Device-Id` (MAC) 必須先通過 OTA 檢查「報到」過，否則雲端會直接拒絕 WebSocket 連線 (Error 1005)。

---

## 2. 身分識別 (Identity)

每次連線建議生成一組全新的隨機身分，以支援多用戶同時使用。

*   **MAC Address (`Device-Id`)**: 格式 `XX:XX:XX:XX:XX:XX` (大寫，16進位)。
    *   範例: `CA:54:D1:B1:69:10`
*   **Client UUID (`Client-Id`)**: 標準 UUID v4 格式。
    *   範例: `a219cae9-668e-4afa-aeb2-341af6a1dbc3`

---

## 3. OTA 檢查 (設備報到)

在建立 WebSocket 連線前，**必須**先執行此步驟。

*   **URL**: `https://api.tenclass.net/xiaozhi/ota/`
*   **Method**: `POST`
*   **Headers**:
    *   `Device-Id`: `{MAC_ADDRESS}`
    *   `Content-Type`: `application/json`

### Payload (Request Body)
```json
{
  "version": 2,
  "flash_size": 16777216,
  "psram_size": 0,
  "minimum_free_heap_size": 8318916,
  "mac_address": "{MAC_ADDRESS}",  // 必須與 Header 及 WebSocket 用的 MAC 一致
  "uuid": "{CLIENT_UUID}",         // 必須與 WebSocket 用的 Client ID 一致
  "chip_model_name": "esp32s3",
  "chip_info": { "model": 9, "cores": 2, "revision": 2, "features": 18 },
  "application": {
    "name": "xiaozhi",
    "version": "1.1.2",
    "idf_version": "v5.3.2-dirty"
  },
  "partition_table": [],
  "ota": { "label": "factory" },
  "board": {
    "type": "bread-compact-wifi",
    "ip": "192.168.1.100", // 可為假 IP
    "mac": "{MAC_ADDRESS}"
  }
}
```

*   **成功回應**: HTTP 200 (回傳內容可忽略，重點是伺服器已記錄此 MAC)。

---

## 4. WebSocket 通訊協定

*   **URL**: `wss://api.tenclass.net/xiaozhi/v1/`
    *   **注意**: 結尾必須有斜線 `/`，否則會收到 HTTP 301 重定向錯誤。
*   **Headers**:
    *   `Device-Id`: `{MAC_ADDRESS}` (必須與 OTA 步驟相同)
    *   `Client-Id`: `{CLIENT_UUID}` (必須與 OTA 步驟相同)
    *   `Protocol-Version`: `1`
    *   `Authorization`: `Bearer {TOKEN}` (選填，若有綁定帳號才需要)

### 訊息格式 (Message Flow)

通訊內容分為 **文字 (JSON)** 與 **音訊 (Binary)** 兩類。

#### A. 音訊資料 (Audio Data)
*   **格式**: **Opus** 編碼
*   **傳輸方式**: Binary Message (WebSocket binary frame)
*   **參數**:
    *   Sample Rate: 16000 Hz
    *   Channels: 1 (Mono)
    *   Frame Duration: 60ms (通常)
*   **上傳 (Client -> Server)**: 將麥克風收到的 PCM (Float32 -> Int16) 編碼為 Opus 後發送。
*   **下極 (Server -> Client)**: 收到的是 Opus 封包，需解碼為 PCM 播放。

#### B. 文字指令 (Text/JSON Events)

**1. 初始化 (Hello)**
連線成功後，客戶端應發送 Hello 訊息：
```json
{
    "type": "hello",
    "version": 3,
    "audio_params": {
        "format": "opus",
        "sample_rate": 16000,
        "channels": 1,
        "frame_duration": 60
    }
}
```
*   **Server 回應**: 同樣回傳 `type: "hello"`，其中包含 `session_id`。

**2. 語音轉文字 (STT Echo)**
當 Server 辨識到用戶說話時：
```json
{
    "type": "stt",
    "text": "用戶說的話"
}
```

**3. AI 回應文本 (LLM)**
AI 的思考結果與情緒：
```json
{
    "type": "llm",
    "text": "AI 的回應內容",
    "emotion": "happy" // 情緒標籤
}
```

**4. 語音合成狀態 (TTS via Text)**
控制播放進度：
```json
{
    "type": "tts",
    "state": "start" // 或 "stop", "sentence_start"
}
```

---

## 5. 常見錯誤代碼

*   **1005 (Connection Closed)**:
    *   通常是因為 **OTA 檢查未通過**，或 MAC Address 未先註冊。
    *   也有可能是 URL 錯誤 (少了結尾斜線導致 301)。
*   **301 (Moved Permanently)**:
    *   WebSocket URL 缺少結尾斜線 `/`。
*   **404 (Not Found)**:
    *   舊版 API (`api.xiaozhi.me`) 已失效，請使用 `api.tenclass.net`。
