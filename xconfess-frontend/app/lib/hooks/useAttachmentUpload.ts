"use client";

import { useCallback, useRef, useState } from "react";

// NOTE: `/api/attachments/upload` is a placeholder endpoint — there is no
// attachments backend yet. Swap this for the real endpoint once it exists.
const UPLOAD_ENDPOINT = "/api/attachments/upload";

export type UploadStatus = "pending" | "uploading" | "success" | "error" | "cancelled";

export interface PendingUpload {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Manages a list of in-progress attachment uploads with real upload progress
 * and mid-flight cancellation. Uses XMLHttpRequest rather than
 * fetch/AbortController because XHR exposes `upload.onprogress`, which fetch
 * does not for request bodies.
 */
export function useAttachmentUpload() {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const xhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());

  const updateUpload = useCallback((id: string, patch: Partial<PendingUpload>) => {
    setUploads((prev) =>
      prev.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)),
    );
  }, []);

  const startUpload = useCallback((id: string, file: File) => {
    const xhr = new XMLHttpRequest();
    xhrsRef.current.set(id, xhr);

    xhr.open("POST", UPLOAD_ENDPOINT);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      updateUpload(id, { progress });
    };

    xhr.onload = () => {
      xhrsRef.current.delete(id);
      if (xhr.status >= 200 && xhr.status < 300) {
        updateUpload(id, { status: "success", progress: 100 });
      } else {
        updateUpload(id, {
          status: "error",
          error: `Upload failed (${xhr.status})`,
        });
      }
    };

    xhr.onerror = () => {
      xhrsRef.current.delete(id);
      updateUpload(id, { status: "error", error: "Network error during upload" });
    };

    xhr.onabort = () => {
      xhrsRef.current.delete(id);
      // Cancellation is handled by the caller (removes from state); nothing
      // else to do here besides making sure we don't leak the xhr reference.
    };

    const formData = new FormData();
    formData.append("file", file);

    updateUpload(id, { status: "uploading", progress: 0, error: undefined });
    xhr.send(formData);
  }, [updateUpload]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const newUploads: PendingUpload[] = list.map((file) => ({
        id: createId(),
        file,
        status: "pending",
        progress: 0,
      }));

      setUploads((prev) => [...prev, ...newUploads]);
      newUploads.forEach((upload) => startUpload(upload.id, upload.file));

      return newUploads.map((upload) => upload.id);
    },
    [startUpload],
  );

  const cancelUpload = useCallback((id: string) => {
    const xhr = xhrsRef.current.get(id);
    if (xhr) {
      xhr.abort();
      xhrsRef.current.delete(id);
    }
    // Cancelled uploads are removed from pending state entirely, per spec.
    setUploads((prev) => prev.filter((upload) => upload.id !== id));
  }, []);

  const retryUpload = useCallback(
    (id: string) => {
      setUploads((prev) => {
        const upload = prev.find((item) => item.id === id);
        if (upload) {
          startUpload(upload.id, upload.file);
        }
        return prev;
      });
    },
    [startUpload],
  );

  const removeUpload = useCallback((id: string) => {
    const xhr = xhrsRef.current.get(id);
    if (xhr) {
      xhr.abort();
      xhrsRef.current.delete(id);
    }
    setUploads((prev) => prev.filter((upload) => upload.id !== id));
  }, []);

  return {
    uploads,
    addFiles,
    cancelUpload,
    retryUpload,
    removeUpload,
  };
}
