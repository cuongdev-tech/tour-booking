import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function durationDays(duration: string): number | null {
  const m = /^\s*(\d+)/.exec(duration ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 15 ? n : null;
}

type Day = { day: unknown; title: unknown; activities: unknown };
type Row = { slug: string; ok: boolean; notes: string[] };

const results: Row[] = [];
let failures = 0;
function check(slug: string, cond: boolean, note: string) {
  let r = results.find((x) => x.slug === slug);
  if (!r) {
    r = { slug, ok: true, notes: [] };
    results.push(r);
  }
  if (!cond) {
    r.ok = false;
    r.notes.push(note);
    failures += 1;
  }
}

const FLIGHT_RE = /sân bay|máy bay|chuyến bay|\bbay\b\s*(từ|về|về|đến|thẳng)/i;
const CRUISE_RE = /du thuyền|kayak|hạ thủy/i;
const CABLE_RE = /cáp treo/i;

async function main() {
  const tours = await prisma.tour.findMany({ orderBy: { slug: 'asc' } });
  console.log(`TOTAL TOURS: ${tours.length} (expected 35)`);
  if (tours.length !== 35) failures += 1;

  for (const t of tours) {
    const slug = t.slug;
    const it = t.itinerary as unknown;
    check(slug, Array.isArray(it) && it.length > 0, 'missing/empty itinerary');
    if (!Array.isArray(it) || it.length === 0) continue;

    // Structure
    const seen = new Set<number>();
    let structureOk = true;
    (it as Day[]).forEach((d, i) => {
      if (typeof d?.day !== 'number' || !Number.isInteger(d.day)) structureOk = false;
      if (typeof d?.title !== 'string' || d.title.trim().length === 0) structureOk = false;
      if (!Array.isArray(d?.activities) || d.activities.length === 0) structureOk = false;
      if (Array.isArray(d?.activities)) {
        for (const a of d.activities) {
          if (typeof a !== 'string' || a.trim().length === 0) structureOk = false;
        }
      }
      if (typeof d?.day === 'number') {
        if (seen.has(d.day)) structureOk = false;
        seen.add(d.day);
        if (d.day !== i + 1) structureOk = false;
      }
    });
    check(slug, structureOk, 'invalid structure (day/title/activities/sequence/dup)');

    // Duration match
    const expected = durationDays(t.duration);
    check(slug, expected !== null && it.length === expected, `days=${it.length} vs duration "${t.duration}"`);

    // Route fields
    check(slug, t.departureLocation.trim().length > 1, 'bad departureLocation');
    check(slug, t.destination.trim().length > 1, 'bad destination');

    // Transport vs itinerary text
    const text = (it as Day[]).map((d) => `${d.title} ${(d.activities as string[]).join(' ')}`).join(' | ');
    const hasFlight = t.transportation.includes('Flight');
    const hasCruise = t.transportation.includes('Cruise');
    const cableIncluded = t.includedServices.some((s) => /cáp treo/i.test(s));
    const cableExcluded = t.excludedServices.some((s) => /cáp treo/i.test(s));
    if (hasFlight) check(slug, FLIGHT_RE.test(text), 'Flight tour but no flight leg in itinerary');
    else check(slug, !FLIGHT_RE.test(text), 'local tour wrongly contains a flight leg');
    if (hasCruise) check(slug, CRUISE_RE.test(text), 'Cruise tour but no cruise activity');
    if (cableIncluded) check(slug, CABLE_RE.test(text), 'cable-car included but missing in itinerary');
    if (cableExcluded && !cableIncluded) check(slug, !CABLE_RE.test(text), 'cable-car excluded but present in itinerary');

    // Price sanity
    check(slug, t.price > 0 && Number.isInteger(t.price), 'bad price');
    check(slug, !/Tham quan các địa điểm nổi tiếng/i.test(text), 'generic activity text');
  }

  // Cross-tour price ordering: [cheaperSlug, pricierSlug, reason]
  const orderings: Array<[string, string, string]> = [
    ['dn-danang-hoian-3n2d', 'da-nang-hoi-an-3n2d', 'DN local < SGN flight (same 3N2D program)'],
    ['da-nang-hoi-an-3n2d', 'hn-danang-hoian-3n2d', 'SGN-DAD < HAN-DAD (farther departure)'],
    ['pq-phuquoc-3n2d', 'ct-phuquoc-3n2d', 'PQ local < CT flight (same 3N2D program)'],
    ['ct-phuquoc-3n2d', 'phu-quoc-4n3d', 'CT 3N2D < SGN 4N3D'],
    ['phu-quoc-4n3d', 'hn-phuquoc-4n3d', 'SGN-PQC < HAN-PQC (farther departure)'],
    ['hn-halong-2n1d', 'ha-long-cat-ba-3n2d', 'HL 2N1D < HL 3N2D'],
    ['ha-long-cat-ba-3n2d', 'hn-halong-luxury-3n2d', 'HL standard < HL luxury (2 cruise nights)'],
    ['sapa-fansipan-2n1d', 'hn-sapa-3n2d', 'Sapa 2N1D < 3N2D'],
    ['hn-hagiang-3n2d', 'ha-giang-loop-4n3d', 'HaGiang 3N2D < 4N3D'],
    ['con-dao-tam-linh-2n1d', 'sg-condao-3n2d', 'ConDao 2N1D < 3N2D'],
    ['phan-thiet-mui-ne-2n1d', 'sg-phan-thiet-3n2d', 'PhanThiet 2N1D < 3N2D resort'],
    ['hn-ninhbinh-1d', 'ninh-binh-trang-an-2n1d', 'NinhBinh 1D < 2N1D'],
    ['nha-trang-vinwonders-3n2d', 'hn-nhatrang-4n3d', 'NhaTrang SGN 3N2D < HAN 4N3D'],
    ['sg-dalat-2n1d', 'nt-dalat-3n2d', 'DaLat 2N1D < 3N2D'],
    ['hn-hanoi-city-1d', 'hn-ninhbinh-1d', 'HN city 1D cheapest of day tours'],
    ['dn-bana-1d', 'dn-danang-hoian-3n2d', 'BaNa 1D (cable) < DN 3N2D local'],
  ];
  const bySlug = new Map(tours.map((t) => [t.slug, t]));
  for (const [cheap, pricey, reason] of orderings) {
    const a = bySlug.get(cheap);
    const b = bySlug.get(pricey);
    const ok = !!a && !!b && a.price < b.price;
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} price: ${cheap} (${a?.price}) < ${pricey} (${b?.price}) — ${reason}`);
  }

  // Report table
  console.log('\nSlug | Duration | Days | Route | Transport | Price | Status');
  let pass = 0;
  for (const t of tours) {
    const r = results.find((x) => x.slug === t.slug);
    const days = Array.isArray(t.itinerary) ? (t.itinerary as unknown[]).length : 0;
    const status = r?.ok ? 'PASS' : `FAIL: ${r?.notes.join('; ')}`;
    if (r?.ok) pass += 1;
    console.log(
      `${t.slug} | ${t.duration} | ${days} | ${t.departureLocation} → ${t.destination} | ${t.transportation.join('+')} | ${t.price} | ${status}`,
    );
  }
  console.log(`\nRESULT: ${pass}/${tours.length} tours PASS, ${failures} failing check(s)`);
  if (tours.length !== 35 || pass !== tours.length || failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
