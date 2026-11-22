const databaseName = 'retro-hotline-editor'
const storeName = 'assets'
let opening: Promise<IDBDatabase> | undefined

function database() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        opening = undefined
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
  }).catch(error => {
    opening = undefined
    throw error
  })
  return opening
}

async function assetRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onabort = () => reject(transaction.error ?? request.error)
  })
}

export function writeAsset(id: string, file: Blob) {
  return assetRequest('readwrite', store => store.put(file, id))
}

export async function readAsset(id: string) {
  const file = await assetRequest('readonly', store => store.get(id))
  if (!(file instanceof Blob)) throw new Error('找不到此浏览器中的资产文件。')
  return file
}

export function removeAsset(id: string) {
  return assetRequest('readwrite', store => store.delete(id))
}
