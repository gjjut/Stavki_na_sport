export interface StorageHealthSnapshot {
  production: boolean;
  backend: 'postgres' | 'local_file';
  databaseUrlConfigured: boolean;
  usingLocalFallback: boolean;
}

export function isStorageDegraded(snapshot: StorageHealthSnapshot): boolean {
  return (
    snapshot.usingLocalFallback ||
    (snapshot.production &&
      (!snapshot.databaseUrlConfigured || snapshot.backend !== 'postgres'))
  );
}
