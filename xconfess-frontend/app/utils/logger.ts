const isDev = process.env.NODE_ENV === "development";

export const debugLog = (...args: any[]) => {
  if (isDev) {
    console.log("[DEBUG]", ...args);
  }
};

export const debugError = (message: string, error?: any) => {
  if (isDev) {
    console.log(`[DEBUG ERROR] ${message}`);
    if (error) console.log(error);
  }
};