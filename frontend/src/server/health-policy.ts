export interface StorageHealthSnapshot {
  production: boolean;
  backend: 'postgres' | 'local_file' | 'unavailable';
  databaseUrlConfigured: boolean;
  usingLocalFallback: boolean;
}

export function isStorageDegraded(snapshot: StorageHealthSnapshot): boolean {
  return (
    snapshot.backend === 'unavailable' ||
    snapshot.usingLocalFallback ||
    (snapshot.production &&
      (!snapshot.databaseUrlConfigured || snapshot.backend !== 'postgres'))
  );
}
