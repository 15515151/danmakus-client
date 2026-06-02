import { describe, expect, it } from 'bun:test';
import { CustomArchiveApiClient } from './CustomArchiveApiClient.js';
import { ScopedLogger } from './Logger.js';
import type { LiveSessionOutboxItem } from './LocalArchiveTypes.js';

const createRecord = (id: number, streamerUid: number): LiveSessionOutboxItem => ({
  id,
  streamerUid,
  eventTsMs: 1710000000000 + id,
  payload: new Uint8Array([id, streamerUid % 256]),
  retryCount: 0,
  nextRetryAtMs: 1710000000000,
});

describe('CustomArchiveApiClient', () => {
  it('filters records by target UID and sends JSON with base64 payloads', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = new CustomArchiveApiClient(new ScopedLogger('CustomArchiveApiClientTest', 'silent'));

    await client.sendCustomArchiveBatch([
      createRecord(1, 100),
      createRecord(2, 200),
    ], {
      endpoint: 'https://custom.example/archive',
      targetUids: [200],
      fetchImpl: (async (input, init) => {
        requests.push({ input, init });
        return new Response('{}', { status: 204 });
      }) as typeof fetch,
    });

    expect(requests).toHaveLength(1);
    expect(String(requests[0]?.input)).toBe('https://custom.example/archive');
    expect(requests[0]?.init?.method).toBe('POST');
    expect(requests[0]?.init?.headers).toMatchObject({
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(String(requests[0]?.init?.body));
    expect(body).toMatchObject({
      source: 'danmakus-client',
      version: 1,
    });
    expect(body.items).toEqual([{
      localId: 2,
      streamerUid: 200,
      eventTsMs: 1710000000002,
      payloadEncoding: 'base64',
      payload: 'Asg=',
    }]);
  });

  it('does not fetch when no records match target UIDs', async () => {
    let fetchCallCount = 0;
    const client = new CustomArchiveApiClient(new ScopedLogger('CustomArchiveApiClientTest', 'silent'));

    await client.sendCustomArchiveBatch([createRecord(1, 100)], {
      endpoint: 'https://custom.example/archive',
      targetUids: [200],
      fetchImpl: (async () => {
        fetchCallCount += 1;
        return new Response('{}', { status: 204 });
      }) as typeof fetch,
    });

    expect(fetchCallCount).toBe(0);
  });

  it('swallows fetch failures', async () => {
    const client = new CustomArchiveApiClient(new ScopedLogger('CustomArchiveApiClientTest', 'silent'));

    await expect(client.sendCustomArchiveBatch([createRecord(1, 100)], {
      endpoint: 'https://custom.example/archive',
      targetUids: [100],
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as typeof fetch,
    })).resolves.toBeUndefined();
  });
});
