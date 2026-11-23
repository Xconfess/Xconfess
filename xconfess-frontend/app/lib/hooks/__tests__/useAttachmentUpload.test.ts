/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { useAttachmentUpload } from "../useAttachmentUpload";

class MockXHR {
  static instances: MockXHR[] = [];

  status = 0;
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  aborted = false;
  openedUrl = "";

  open(_method: string, url: string) {
    this.openedUrl = url;
  }

  send(_body: FormData) {
    MockXHR.instances.push(this);
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  emitProgress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }

  emitSuccess() {
    this.status = 200;
    this.onload?.();
  }

  emitFailure(status = 500) {
    this.status = status;
    this.onload?.();
  }

  emitNetworkError() {
    this.onerror?.();
  }
}

describe("useAttachmentUpload", () => {
  const OriginalXHR = global.XMLHttpRequest;

  beforeEach(() => {
    MockXHR.instances = [];
    // @ts-expect-error test stub
    global.XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    global.XMLHttpRequest = OriginalXHR;
  });

  function makeFile(name = "photo.png") {
    return new File(["content"], name, { type: "image/png" });
  }

  it("adds a file and tracks upload progress", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile()]);
    });

    expect(result.current.uploads).toHaveLength(1);
    expect(result.current.uploads[0].status).toBe("uploading");

    act(() => {
      MockXHR.instances[0].emitProgress(50, 100);
    });

    expect(result.current.uploads[0].progress).toBe(50);
  });

  it("marks an upload as success when it completes", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile()]);
    });

    act(() => {
      MockXHR.instances[0].emitSuccess();
    });

    expect(result.current.uploads[0].status).toBe("success");
    expect(result.current.uploads[0].progress).toBe(100);
  });

  it("marks an upload as error on failure and allows retry", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile()]);
    });

    act(() => {
      MockXHR.instances[0].emitFailure(500);
    });

    expect(result.current.uploads[0].status).toBe("error");

    act(() => {
      result.current.retryUpload(result.current.uploads[0].id);
    });

    expect(MockXHR.instances).toHaveLength(2);
    expect(result.current.uploads[0].status).toBe("uploading");
  });

  it("handles a network error", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile()]);
    });

    act(() => {
      MockXHR.instances[0].emitNetworkError();
    });

    expect(result.current.uploads[0].status).toBe("error");
  });

  it("cancels an in-progress upload and removes it from pending state", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile()]);
    });

    const id = result.current.uploads[0].id;

    act(() => {
      result.current.cancelUpload(id);
    });

    expect(result.current.uploads).toHaveLength(0);
    expect(MockXHR.instances[0].aborted).toBe(true);
  });

  it("supports multiple concurrent uploads", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile("a.png"), makeFile("b.png")]);
    });

    expect(result.current.uploads).toHaveLength(2);
    expect(MockXHR.instances).toHaveLength(2);
  });
});
