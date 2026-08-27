export function optimizeImage(src: string, width?: number, quality?: number): string {
  if (!src || src.startsWith('data:')) return src;
  
  const params = new URLSearchParams();
  if (width) params.append('w', width.toString());
  if (quality) params.append('q', quality.toString());
  
  return `/_next/image?url=${encodeURIComponent(src)}&${params.toString()}`;
}

export function getImageBlurDataURL(width: number = 10, height: number = 10): string {
  return `data:image/svg+xml,%3Csvg width='${width}' height='${height}' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='${width}' height='${height}' fill='%23f0f0f0'/%3E%3C/svg%3E`;
}
