import type { LiveSessionOutboxItem } from './LocalArchiveTypes.js';
import { ScopedLogger } from './Logger.js';
import { normalizeBinaryPayload } from './RawPacketCodec.js';

const CUSTOM_ARCHIVE_TIMEOUT_MS = 5_000;

type CustomArchiveApiClientOptions = {
  endpoint?: string;
  targetUids?: number[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type CustomArchivePayloadItem = {
  localId: number;
  streamerUid: number;
  eventTsMs: number;
  payloadEncoding: 'base64';
  payload: string;
};

const toBase64 = (payload: Uint8Array): string => {
  const normalized = normalizeBinaryPayload(payload);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let index = 0; index < normalized.length; index += 3) {
    const first = normalized[index] ?? 0;
    const second = normalized[index + 1] ?? 0;
    const third = normalized[index + 2] ?? 0;
    const triplet = (first << 16) | (second << 8) | third;

    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += index + 1 < normalized.length ? alphabet[(triplet >> 6) & 63] : '=';
    output += index + 2 < normalized.length ? alphabet[triplet & 63] : '=';
  }

  return output;
};

export class CustomArchiveApiClient {
  constructor(
    private readonly logger: ScopedLogger = new ScopedLogger('CustomArchiveApiClient')
  ) {}

  async sendCustomArchiveBatch(
    records: LiveSessionOutboxItem[],
    options: CustomArchiveApiClientOptions,
  ): Promise<void> {
    const endpoint = this.normalizeEndpoint(options.endpoint);
    const targetUidSet = this.normalizeTargetUidSet(options.targetUids);
    if (!endpoint || targetUidSet.size === 0 || records.length === 0) {
      return;
    }

    const items = records
      .filter(record => targetUidSet.has(record.streamerUid))
      .map((record): CustomArchivePayloadItem => ({
        localId: record.id,
        streamerUid: record.streamerUid,
        eventTsMs: record.eventTsMs,
        payloadEncoding: 'base64',
        payload: toBase64(record.payload),
      }));

    if (items.length === 0) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? CUSTOM_ARCHIVE_TIMEOUT_MS);
    try {
      const fetchImpl = options.fetchImpl ?? fetch;
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'danmakus-client/custom-archive',
        },
        body: JSON.stringify({
          source: 'danmakus-client',
          version: 1,
          sentAtMs: Date.now(),
          items,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`自定义归档 API 返回非成功状态: status=${response.status}`);
      }
    } catch (error) {
      this.logger.warn('自定义归档 API 上传失败:', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeEndpoint(value?: string): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private normalizeTargetUidSet(value?: number[]): Set<number> {
    if (!Array.isArray(value)) {
      return new Set();
    }

    return new Set(
      value
        .map(item => Number(item))
        .filter(item => Number.isFinite(item) && item > 0)
        .map(item => Math.floor(item))
    );
  }
}
