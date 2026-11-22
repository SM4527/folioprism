const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Block cross-site and DNS-rebinding writes (CR-01).
 * Returns a 403/415 response to send back, or null when the request may proceed.
 * Pass the required media type for routes that read a body.
 */
export function rejectCrossSite(request: Request, contentType?: string): Response | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? '';
  if ((origin !== null && !LOCAL_ORIGIN.test(origin)) || !LOCAL_HOST.test(host)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType && type !== contentType) {
    return Response.json({ error: `Content-Type must be ${contentType}` }, { status: 415 });
  }
  return null;
}
