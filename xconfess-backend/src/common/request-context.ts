import { Injectable, Module, Global } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export const REQUEST_ID_TOKEN = 'requestId';

@Injectable()
export class RequestContextStorage {
  private storage: Map<string, string> = new Map();

  getRequestId(): string | undefined {
    return this.storage.get(REQUEST_ID_TOKEN);
  }

  setRequestId(id: string): void {
    this.storage.set(REQUEST_ID_TOKEN, id);
  }

  clear(): void {
    this.storage.delete(REQUEST_ID_TOKEN);
  }
}

@Global()
@Module({
  providers: [RequestContextStorage],
  exports: [RequestContextStorage],
})
export class RequestContextModule {}

export type RequestContext = {
  getRequestId: () => string | undefined;
  setRequestId: (id: string) => void;
  generateId: () => string;
  runWithContext: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
};

export function createRequestContext(): RequestContext {
  const storage = new Map<string, string>();

  return {
    getRequestId: () => storage.get(REQUEST_ID_TOKEN),
    setRequestId: (id: string) => storage.set(REQUEST_ID_TOKEN, id),
    generateId: () => uuidv4(),
    runWithContext: async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
      const previousId = storage.get(REQUEST_ID_TOKEN);
      storage.set(REQUEST_ID_TOKEN, id);
      try {
        return await fn();
      } finally {
        if (previousId) {
          storage.set(REQUEST_ID_TOKEN, previousId);
        } else {
          storage.delete(REQUEST_ID_TOKEN);
        }
      }
    },
  };
}

export interface RequestContextJobData {
  requestId?: string;
  [key: string]: unknown;
}

export function injectRequestId<T extends RequestContextJobData>(
  data: T,
  requestId?: string,
): T {
  if (requestId) {
    return { ...data, requestId };
  }
  return data;
}
