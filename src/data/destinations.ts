/** Shared destination imagery (Home grid + Destinations page stay in sync). */

const U800 = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=800`;
const P800 = (id: string) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

/**
 * Nhiều ảnh cho từng điểm đến (khách xem được carousel + lightbox).
 * Ảnh lấy từ seed tour của chính điểm đến đó (đã verify visually) nên đúng địa danh.
 * Key viết thường vì lookup không phân biệt hoa/thường.
 */
export const DESTINATION_GALLERIES: Record<string, string[]> = {
  // Đà Nẵng: Cầu Vàng + Cầu Rồng về đêm
  'da nang': [U800('1559592413-7cec4d0cae2b'), P800('37800761'), U800('1528127269322-539801943592')],
  // Huế: Đại Nội, Ngọ Môn, hào nước
  hue: [U800('1732682953527-b137648a0220'), U800('1724935412035-a35ed28c8518'), U800('1758487892397-688ea7102b47')],
  // Phú Quốc: biển cọ, chùa Hộ Quốc, hoàng hôn tàu cá
  'phu quoc': [
    U800('1567114717346-0d44c2a2ad08'),
    P800('14012683'),
    P800('12322692'),
    U800('1693282814784-649be45a459b'),
  ],
  // Hạ Long: vịnh + lặn biển
  'ha long': [U800('1528127269322-539801943592'), U800('1544551763-46a013bb70d5'), U800('1469474968028-56623f02e42e')],
  // Hà Nội: Văn Miếu + Tháp Rùa Hồ Gươm
  'ha noi': [P800('17406698'), P800('10010671'), U800('1528127269322-539801943592')],
  // Sapa: Fansipan + ruộng bậc thang Mường Hoa
  sapa: [P800('30172036'), P800('28641457'), P800('6129060'), U800('1758003293450-b9478f02bf48')],
  // Đà Lạt: hồ Tuyền Lâm + chợ đêm
  'da lat': [P800('6348006'), P800('28211449'), U800('1476514525535-07fb3b4ae5f1')],
  // Nha Trang: Tháp Bà Ponagar + skyline biển
  'nha trang': [P800('36811953'), P800('37463680'), U800('1567114717346-0d44c2a2ad08')],
  // Ninh Bình: thuyền Tràng An + Hang Múa
  'ninh binh': [P800('38017051'), P800('20396685'), U800('1469474968028-56623f02e42e')],
  // Quy Nhơn: biển + bờ đá Bình Định
  'quy nhon': [P800('37920708'), P800('15166114'), U800('1506929562872-bb421503ef21')],
  // Phan Thiết / Mũi Né: đồi cát + thuyền thúng
  'phan thiet': [P800('28662996'), P800('26173826'), U800('1506929562872-bb421503ef21')],
  // Hà Giang: vòng loop + núi sương
  'ha giang': [P800('27568660'), P800('5247503'), P800('6129060')],
  // Hội An: chợ đèn lồng + cận đèn lồng
  'hoi an': [U800('1743663248060-7a569817661a'), U800('1743485753964-739e8f2fa39b'), P800('37800761')],
  // Côn Đảo: biển Đầm Trâu + máy bay đáp trên biển
  'con dao': [P800('12313919'), P800('11331490'), U800('1506929562872-bb421503ef21')],
  // Cần Thơ: chợ nổi Cái Răng
  'can tho': [P800('27246668'), P800('28428667'), P800('20396685')],
  // Hồ Chí Minh: Nhà thờ Đức Bà + chợ Bến Thành
  'ho chi minh': [P800('30810816'), P800('30380054'), P800('17406698')],
  // Vũng Tàu: hoàng hôn biển + bãi nhiệt đới
  'vung tau': [P800('35528526'), U800('1506929562872-bb421503ef21'), U800('1567114717346-0d44c2a2ad08')],
};

/** Ảnh đại diện (phần tử đầu gallery) — giữ để code cũ vẫn chạy. */
export const DESTINATION_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(DESTINATION_GALLERIES).map(([k, v]) => [k, v[0]]),
);

const FALLBACK_GALLERY = DESTINATION_GALLERIES['ha long'];

function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}

/** Toàn bộ ảnh của 1 điểm đến (fallback xoay vòng, không còn 1 ảnh chung). */
export function destinationGallery(name: string): string[] {
  const key = name.trim().toLowerCase();
  const direct = DESTINATION_GALLERIES[key];
  if (direct && direct.length > 0) return direct;
  // Địa danh lạ (tour admin tự thêm): xoay vòng gallery có sẵn theo hash tên.
  const pools = Object.values(DESTINATION_GALLERIES);
  return pools[hashKey(key) % pools.length];
}

/** Case-insensitive lookup so API names ("Ha Long", "HA LONG"…) always resolve. */
export function destinationImage(name: string): string {
  return destinationGallery(name)[0] ?? FALLBACK_GALLERY[0];
}

export const FEATURED_DESTINATION_NAMES = ['Da Nang', 'Phu Quoc', 'Ha Long', 'Sapa', 'Hoi An', 'Da Lat'];

/** Approximate coordinates for the keyless OpenStreetMap embed. */
const DESTINATION_COORDS: Record<string, [number, number]> = {
  'da nang': [16.0544, 108.2022],
  hue: [16.4637, 107.5909],
  'phu quoc': [10.2899, 103.984],
  'ha long': [20.9101, 107.1839],
  'ha noi': [21.0278, 105.8342],
  sapa: [22.3364, 103.8438],
  'da lat': [11.9404, 108.4583],
  'nha trang': [12.2388, 109.1967],
  'ninh binh': [20.2506, 105.9745],
  'quy nhon': [13.782, 109.2196],
  'phan thiet': [10.9286, 108.102],
  'ha giang': [22.8026, 104.9782],
  'hoi an': [15.8801, 108.338],
  'con dao': [8.6825, 106.6003],
  'can tho': [10.0452, 105.7469],
  'ho chi minh': [10.8231, 106.6297],
  'vung tau': [10.3459, 107.0843],
};

export function destinationCoords(name: string): [number, number] | null {
  return DESTINATION_COORDS[name.trim().toLowerCase()] ?? null;
}

/** Keyless OSM embed URL (bbox ~0.1° around the point). Null when unknown. */
export function destinationMapEmbed(name: string): string | null {
  const coords = destinationCoords(name);
  if (!coords) return null;
  const [lat, lon] = coords;
  const d = 0.06;
  const bbox = `${lon - d}%2C${lat - d}%2C${lon + d}%2C${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
}

export function destinationMapLink(name: string): string | null {
  const coords = destinationCoords(name);
  if (!coords) return null;
  const [lat, lon] = coords;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`;
}
