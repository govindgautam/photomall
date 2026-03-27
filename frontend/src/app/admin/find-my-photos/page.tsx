import { redirect } from 'next/navigation';

/**
 * Guests sometimes open /admin/find-my-photos; the guest flow lives at /find-my-photos.
 * Preserve query string (?event= / ?eventId=).
 */
export default async function AdminFindMyPhotosAlias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const pairs: string[] = [];
  for (const [key, val] of Object.entries(p)) {
    if (val === undefined) continue;
    const values = Array.isArray(val) ? val : [val];
    for (const v of values) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  const qs = pairs.length > 0 ? `?${pairs.join('&')}` : '';
  redirect(`/find-my-photos${qs}`);
}
