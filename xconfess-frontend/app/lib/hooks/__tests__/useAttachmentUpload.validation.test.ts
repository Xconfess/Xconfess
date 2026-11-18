import { act, renderHook } from "@testing-library/react";
import { useAttachmentUpload } from "../useAttachmentUpload";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "../../utils/attachmentValidation";

class FakeXHR {
  static instances: FakeXHR[] = [];
  upload: { onprogress: ((event: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  constructor() {
    FakeXHR.instances.push(this);
  }
  open = () => undefined;
  send = () => undefined;
  abort = () => undefined;
}

const realXHR = globalThis.XMLHttpRequest;
const okType = ALLOWED_ATTACHMENT_MIME_TYPES[0] ?? "image/png";

function makeFile(name: string, type: string, size?: number): File {
  const file = new File(["content"], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, "size", { value: size });
  }
  return file;
}

beforeEach(() => {
  FakeXHR.instances = [];
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
});

afterEach(() => {
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = realXHR;
});

describe("useAttachmentUpload client-side validation", () => {
  it("starts an upload for a valid file", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile("ok.png", okType)]);
    });

    expect(FakeXHR.instances).toHaveLength(1);
    expect(result.current.uploads[0]?.status).toBe("uploading");
    expect(result.current.uploads[0]?.rejected).toBeUndefined();
  });

  it("rejects an unsupported type without sending anything", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile("bad.html", "text/html")]);
    });

    const upload = result.current.uploads[0];
    expect(FakeXHR.instances).toHaveLength(0);
    expect(upload?.status).toBe("error");
    expect(upload?.rejected).toBe(true);
    expect(upload?.error).toContain("bad.html");
  });

  it("rejects an oversized file without sending anything", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile("big.png", okType, MAX_ATTACHMENT_SIZE_BYTES + 1)]);
    });

    const upload = result.current.uploads[0];
    expect(FakeXHR.instances).toHaveLength(0);
    expect(upload?.rejected).toBe(true);
    expect(upload?.error).toContain("limit");
  });

  it("uploads the valid files in a mixed batch and rejects the rest", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([
        makeFile("ok.png", okType),
        makeFile("bad.html", "text/html"),
      ]);
    });

    expect(FakeXHR.instances).toHaveLength(1);
    expect(result.current.uploads.map((u) => u.status)).toEqual(["uploading", "error"]);
  });

  it("does not upload a rejected file when retry is called", () => {
    const { result } = renderHook(() => useAttachmentUpload());

    act(() => {
      result.current.addFiles([makeFile("bad.html", "text/html")]);
    });
    const id = result.current.uploads[0]?.id ?? "";

    act(() => {
      result.current.retryUpload(id);
    });

    expect(FakeXHR.instances).toHaveLength(0);
    expect(result.current.uploads[0]?.rejected).toBe(true);
  });
});