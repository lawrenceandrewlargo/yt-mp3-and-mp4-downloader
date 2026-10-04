export interface MediaFormat {
  id: string; ext: string; container: string; width: number | null; height: number | null; fps: number | null;
  videoCodec: string; audioCodec: string; videoBitrate: number | null; audioBitrate: number | null;
  filesize: number | null; estimated: boolean; dynamicRange: string | null; note: string;
}
export interface MediaSummary { id: string; url: string; title: string; uploader: string; duration: number | null; thumbnail: string | null; source: string }
export interface MediaMetadata extends MediaSummary { formats: MediaFormat[]; playlistDetected: boolean; analyzedAt: number; description: string }
export interface Progress { stage: string; percent?: number; downloadedBytes?: number; totalBytes?: number; speed?: number; eta?: number }
export const jobStatuses = ['queued', 'analyzing', 'downloading', 'processing', 'merging', 'converting', 'completed', 'failed', 'cancelled'] as const;
export type JobStatus = typeof jobStatuses[number];
