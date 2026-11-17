import { useEffect, useRef, useState } from 'react';
import type { PhotoAttachment } from '../features/attachments';
import '../photos.css';

export function SelectedPhotos({ files, disabled, onRemove }: { files: File[]; disabled: boolean; onRemove: (index: number) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map(file => URL.createObjectURL(file)); setUrls(next);
    return () => next.forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  return <div className="photo-list">{urls.map((url, index) => <div className="photo-item" key={url}>
    <img src={url} alt={`선택한 사진 ${index + 1}`} />
    <button type="button" disabled={disabled} aria-label={`선택한 사진 ${index + 1} 취소`} onClick={() => onRemove(index)}>×</button>
  </div>)}</div>;
}

export function SavedPhotos({ photos, disabled = false, onRemove, onRefresh }: { photos: PhotoAttachment[]; disabled?: boolean; onRemove?: (id: string) => void; onRefresh?: () => Promise<void> }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState<PhotoAttachment | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (opened) dialog.current?.showModal(); }, [opened]);
  useEffect(() => { setFailed([]); setError(''); }, [photos.map(photo => photo.url).join('|')]);
  return <div className="photo-list">{[...photos].sort((a, b) => a.sortOrder - b.sortOrder).map((photo, index) => <div className="photo-item" key={photo.id}>
    <button type="button" className="photo-open" aria-label={`첨부 사진 ${index + 1} 크게 보기`} onClick={() => setOpened(photo)}><img src={photo.url} alt={`첨부 사진 ${index + 1}`} loading="lazy" onError={() => setFailed(current => current.includes(photo.id) ? current : [...current, photo.id])} /></button>
    {onRemove && <button type="button" disabled={disabled} aria-label={`첨부 사진 ${index + 1} 삭제`} onClick={() => onRemove(photo.id)}>×</button>}
  </div>)}{failed.length > 0 && onRefresh && <button type="button" disabled={disabled || refreshing} onClick={async () => {
    setRefreshing(true); setError('');
    try { await onRefresh(); } catch { setError('사진을 불러오지 못했어요. 다시 시도해 주세요.'); } finally { setRefreshing(false); }
  }}>{refreshing ? '불러오는 중…' : '사진 다시 불러오기'}</button>}{error && <span role="alert">{error}</span>}
    <dialog ref={dialog} className="photo-viewer" aria-label="첨부 사진 크게 보기" onClose={() => setOpened(null)}>
      <button type="button" onClick={() => dialog.current?.close()} aria-label="사진 닫기">닫기 ×</button>
      {opened && <img src={opened.url} alt="첨부 사진 원본" />}
    </dialog>
  </div>;
}
