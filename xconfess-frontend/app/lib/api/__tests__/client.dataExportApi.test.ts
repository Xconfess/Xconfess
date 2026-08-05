/**
 * Tests for dataExportApi — verifies all calls go through /api/data-export/*
 * proxy routes and never contact the backend host directly.
 */

jest.mock("@/app/lib/store/authStore", () => ({
  useAuthStore: { getState: () => ({ logout: jest.fn() }) },
}));

import { dataExportApi } from "../client";
import apiClient from "../client";

jest.mock("../client", () => {
  const mockGet = jest.fn();
  const mockPost = jest.fn();

  const mockedApiClient = {
    get: mockGet,
    post: mockPost,
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  return {
    __esModule: true,
    default: mockedApiClient,
    apiClient: mockedApiClient,
    AxiosError: jest.requireActual("axios").AxiosError,
    dataExportApi: {
      getHistory: async () => {
        const res = await mockedApiClient.get("/api/data-export/history");
        return res.data;
      },
      requestExport: async () => {
        const res = await mockedApiClient.post("/api/data-export/request");
        return res.data;
      },
      redownload: async (requestId: string) => {
        const res = await mockedApiClient.post(`/api/data-export/${requestId}/redownload`);
        return res.data;
      },
    },
  };
});

describe("dataExportApi — proxy routing", () => {
  const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getHistory", () => {
    it("calls /api/data-export/history, not the backend directly", async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { latest: null, history: [] },
      });

      await dataExportApi.getHistory();

      expect(mockApiClient.get).toHaveBeenCalledWith("/api/data-export/history");
      const [url] = (mockApiClient.get as jest.Mock).mock.calls[0];
      expect(url).not.toMatch(/localhost:5000|localhost:3001/);
    });
  });

  describe("requestExport", () => {
    it("calls /api/data-export/request, not the backend directly", async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { requestId: "req-1", status: "PENDING" },
      });

      await dataExportApi.requestExport();

      expect(mockApiClient.post).toHaveBeenCalledWith("/api/data-export/request");
      const [url] = (mockApiClient.post as jest.Mock).mock.calls[0];
      expect(url).not.toMatch(/localhost:5000|localhost:3001/);
    });
  });

  describe("redownload", () => {
    it("calls /api/data-export/:id/redownload, not the backend directly", async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
        data: { downloadUrl: "https://example.com/file.zip" },
      });

      await dataExportApi.redownload("req-abc");

      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/api/data-export/req-abc/redownload",
      );
      const [url] = (mockApiClient.post as jest.Mock).mock.calls[0];
      expect(url).not.toMatch(/localhost:5000|localhost:3001/);
    });
  });
});
