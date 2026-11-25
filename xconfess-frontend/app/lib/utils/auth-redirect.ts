const isTrustedOrigin = (origin: string): boolean => {
  const trustedOrigins = [
    process.env.NEXT_PUBLIC_TRUSTED_REDIRECT_ORIGINS
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o),
  ].length > 0
    ? process.env.NEXT_PUBLIC_TRUSTED_REDIRECT_ORIGINS
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o)
    : [];

  return (
    trustedOrigins.includes(origin) ||
    (origin.startsWith('/') && !origin.startsWith('//'))
  );
};

export function isSafeAuthRedirect(value: string | null): value is string {
  return Boolean(value) && isTrustedOrigin(value);
}
