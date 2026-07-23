"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

interface NetworkStatusContextType {
  isOnline: boolean;
  isDegraded: boolean;
  isApiOnline: boolean;
  setDegraded: (degraded: boolean) => void;
  setApiOnline: (online: boolean) => void;
  checkApiStatus: () => Promise<boolean>;
}

const NetworkStatusContext = createContext<NetworkStatusContextType | undefined>(undefined);

function getHealthCheckUrl(): string {
  // Always use the Next.js proxy route — never contact the backend host directly
  // from client-rendered code.
  return "/api/health/ready";
}

export const NetworkStatusProvider = ({ children }: { children: React.ReactNode }) => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isDegraded, setIsDegraded] = useState(false);
  const [isApiOnline, setIsApiOnline] = useState(true);
  const checkInFlight = useRef(false);

  const setDegradedValue = useCallback((degraded: boolean) => {
    setIsDegraded(degraded);
  }, []);

  const setApiOnlineValue = useCallback((online: boolean) => {
    setIsApiOnline(online);
  }, []);

  const checkApiStatus = useCallback(async (): Promise<boolean> => {
    if (checkInFlight.current) return isApiOnline;
    checkInFlight.current = true;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(getHealthCheckUrl(), {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(id);
      const online = res.ok;
      setIsApiOnline(online);
      return online;
    } catch {
      setIsApiOnline(false);
      return false;
    } finally {
      checkInFlight.current = false;
    }
  }, [isApiOnline]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      checkApiStatus();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const nav = navigator as any;
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;

    const updateConnectionStatus = () => {
      if (connection) {
        const degraded = 
          connection.effectiveType === "2g" || 
          connection.effectiveType === "slow-2g" ||
          (connection.rtt && connection.rtt > 500);
        
        setIsDegraded(degraded);
      }
    };

    if (connection) {
      connection.addEventListener("change", updateConnectionStatus);
      updateConnectionStatus();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (connection) {
        connection.removeEventListener("change", updateConnectionStatus);
      }
    };
  }, [checkApiStatus]);

  return (
    <NetworkStatusContext.Provider value={{ isOnline, isDegraded, isApiOnline, setDegraded: setDegradedValue, setApiOnline: setApiOnlineValue, checkApiStatus }}>
      {children}
    </NetworkStatusContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkStatusContext);
  if (context === undefined) {
    throw new Error("useNetwork must be used within a NetworkStatusProvider");
  }
  return context;
};
