export interface PhotoAttachment { id: string; mimeType: string; url: string; sortOrder: number }

export function photoBody(payload: object, files: File[] = []): BodyInit {
  if (!files.length) return JSON.stringify(payload);
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  files.forEach(file => form.append('files', file));
  return form;
}

export function validatePhotos(files: File[], existing = 0): string | null {
  if (files.length + existing > 3) return '사진은 최대 3장까지 첨부할 수 있어요.';
  if (files.some(file => !['image/jpeg', 'image/png'].includes(file.type))) return 'JPEG 또는 PNG 사진을 선택해 주세요.';
  if (files.some(file => !file.size || file.size > 10 * 1024 * 1024)) return '비어 있지 않은 10MiB 이하의 사진을 선택해 주세요.';
  if (files.reduce((size, file) => size + file.size, 0) >= 30 * 1000 * 1000 - 65536) return '한 번에 올리는 사진 용량을 30MB보다 작게 줄여 주세요.';
  return null;
}
