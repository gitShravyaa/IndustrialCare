/** Optional complaint photo storage is disabled in the no-Blaze configuration.
 * Firebase Storage for this project requires a billing upgrade. Complaints remain usable without photos.
 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function uploadComplaintPhoto(_uid: string, _file: File): Promise<string> {
  throw new Error('Photo uploads are temporarily unavailable on the Firebase Spark plan. You can still submit the complaint without a photo.');
}

export async function getPhotoUrl(_path: string): Promise<string> {
  throw new Error('Photo viewing is unavailable while photo storage is disabled.');
}
