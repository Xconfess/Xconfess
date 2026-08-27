// Polyfill fetch globals for msw v2 compatibility with jsdom.
// jsdom does not expose the Fetch API globals that msw v2 requires.
import { TextEncoder, TextDecoder } from "node:util";
import { Blob } from "node:buffer";
import { ReadableStream, TransformStream, WritableStream } from "node:stream/web";
import "whatwg-fetch";
import "@testing-library/jest-dom";

if (typeof globalThis.TextEncoder === "undefined") {
  Object.defineProperty(globalThis, "TextEncoder", { value: TextEncoder });
}
if (typeof globalThis.TextDecoder === "undefined") {
  Object.defineProperty(globalThis, "TextDecoder", { value: TextDecoder });
}

const fetchPolyfills: Record<string, unknown> = {
  Blob,
  ReadableStream,
  TransformStream,
  WritableStream,
};

for (const [key, value] of Object.entries(fetchPolyfills)) {
  if (typeof (globalThis as Record<string, unknown>)[key] === "undefined") {
    Object.defineProperty(globalThis, key, { value, writable: true });
  }
}

// BroadcastChannel stub for msw WebSocket support
if (typeof globalThis.BroadcastChannel === "undefined") {
  class BroadcastChannelStub {
    name: string;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    constructor(name: string) { this.name = name; }
    postMessage() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  }
  Object.defineProperty(globalThis, "BroadcastChannel", { value: BroadcastChannelStub, writable: true });
}

// Import msw server only after required globals exist.
const { server } = require("./tests/mocks/server");

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  disconnect(): void {}
  observe(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(): void {}
}

(global as any).IntersectionObserver = MockIntersectionObserver;

const localStorageMock: Storage = {
  length: 0,
  clear: jest.fn(),
  getItem: jest.fn(),
  key: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

if (typeof window.HTMLFormElement !== "undefined") {
  Object.defineProperty(window.HTMLFormElement.prototype, "submit", {
    configurable: true,
    value: jest.fn(),
  });
  Object.defineProperty(window.HTMLFormElement.prototype, "requestSubmit", {
    configurable: true,
    value: jest.fn(),
  });
}

// Suppress console errors in tests unless explicitly needed
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("Warning: ReactDOM.render") ||
        args[0].includes("Not implemented: HTMLFormElement.prototype.submit"))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Start API mocking before tests
beforeAll(() => server.listen());

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Cleanup
afterAll(() => server.close());
