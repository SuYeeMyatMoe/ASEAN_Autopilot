import type { TwinNode } from '../lib/api'

/** Country hubs for the landing hero, so it renders without the API. */
export const STATIC_NODES: TwinNode[] = [
  ['ID', 'Indonesia', -6.2, 106.8, true],
  ['MY', 'Malaysia', 3.14, 101.69, true],
  ['SG', 'Singapore', 1.35, 103.82, true],
  ['TH', 'Thailand', 13.75, 100.5, false],
  ['VN', 'Vietnam', 21.03, 105.85, false],
  ['PH', 'Philippines', 14.6, 120.98, false],
  ['KH', 'Cambodia', 11.56, 104.92, false],
  ['LA', 'Lao PDR', 17.97, 102.6, false],
  ['MM', 'Myanmar', 19.76, 96.08, false],
  ['BN', 'Brunei Darussalam', 4.94, 114.95, false],
].map(([id, label, lat, lon, covered]) => ({
  id: id as string,
  kind: 'country' as const,
  label: label as string,
  lat: lat as number,
  lon: lon as number,
  covered: covered as boolean,
  counts: covered ? { records: 9, agencies: 4, opportunities: 3 } : { records: 0, agencies: 0, opportunities: 0 },
}))
