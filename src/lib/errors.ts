export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function processError(stderr: string): AppError {
  if (/No space left|disk full/i.test(stderr)) return new AppError('DISK_FULL', 'The disk is full. Free space and retry.', 507);
  if (/private|sign in|age.restrict|members.only|login required/i.test(stderr)) return new AppError('RESTRICTED', 'This media requires access or sign-in. This application does not bypass access restrictions.', 422);
  if (/not available in your country|geo.restrict/i.test(stderr)) return new AppError('REGION', 'This media is not available in your region.', 422);
  if (/unavailable|removed|not found|404/i.test(stderr)) return new AppError('UNAVAILABLE', 'The media is unavailable or has been removed.', 422);
  if (/Unsupported URL/i.test(stderr)) return new AppError('UNSUPPORTED', 'The installed yt-dlp does not support this URL.', 422);
  if (/Requested format is not available/i.test(stderr)) return new AppError('FORMAT', 'That format is no longer available. Analyze the source again.', 422);
  if (/timed out|connection|network|HTTP Error|certificate|resolve|proxy/i.test(stderr)) return new AppError('NETWORK', 'The source could not be reached. Check your network and update yt-dlp, then retry.', 502);
  if (/ffmpeg|conversion|merg/i.test(stderr)) return new AppError('PROCESSING', 'Media processing failed. Check FFmpeg diagnostics and retry.', 422);
  return new AppError('MEDIA_ERROR', 'The media tool could not complete this operation. Check diagnostics and update yt-dlp. Technical details are available in local debug logs.', 422);
}
