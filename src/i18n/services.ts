import { useTranslation } from 'react-i18next';
import type { Language } from './types';

/**
 * Display labels for tour service items.
 * Database stores stable Vietnamese strings; UI translates them.
 * Unknown/custom strings (e.g. added by admin) fall back to raw text.
 */
const SERVICE_LABELS: Record<string, Record<Language, string>> = {
  'Vé máy bay khứ hồi': { vi: 'Vé máy bay khứ hồi', en: 'Round-trip flights', ja: '往復航空券', ko: '왕복 항공권', zh: '往返机票' },
  'Xe du lịch đời mới': { vi: 'Xe du lịch đời mới', en: 'Modern tourist coach', ja: '新型観光バス', ko: '최신 관광버스', zh: '新型旅游大巴' },
  'Xe giường nằm khứ hồi': { vi: 'Xe giường nằm khứ hồi', en: 'Round-trip sleeper bus', ja: '往復寝台バス', ko: '왕복 슬리핑버스', zh: '往返卧铺大巴' },
  'Xe limousine đưa đón': { vi: 'Xe limousine đưa đón', en: 'Limousine transfers', ja: 'リムジン送迎', ko: '리무진 픽업', zh: '豪华商务车接送' },
  'Xe đưa đón sân bay': { vi: 'Xe đưa đón sân bay', en: 'Airport transfers', ja: '空港送迎', ko: '공항 픽업', zh: '机场接送' },
  'Xe trung chuyển địa phương': { vi: 'Xe trung chuyển địa phương', en: 'Local transfers', ja: '現地送迎', ko: '현지 이동', zh: '当地接送' },
  'Xe riêng và xe trung chuyển': { vi: 'Xe riêng và xe trung chuyển', en: 'Private car & transfers', ja: '専用車と送迎', ko: '전용차량 및 이동', zh: '专车及中转接送' },
  'Khách sạn 3–4 sao theo chương trình': { vi: 'Khách sạn 3–4 sao theo chương trình', en: '3–4 star hotels per program', ja: '日程通りの3～4つ星ホテル', ko: '일정에 따른 3~4성급 호텔', zh: '按行程安排3-4星酒店' },
  'Khách sạn 3 sao 1 đêm': { vi: 'Khách sạn 3 sao 1 đêm', en: '1 night in 3-star hotel', ja: '3つ星ホテル1泊', ko: '3성급 호텔 1박', zh: '三星酒店1晚' },
  'Khách sạn 4 sao theo chương trình': { vi: 'Khách sạn 4 sao theo chương trình', en: '4-star hotels per program', ja: '日程通りの4つ星ホテル', ko: '일정에 따른 4성급 호텔', zh: '按行程安排四星酒店' },
  'Resort 4–5 sao sát biển': { vi: 'Resort 4–5 sao sát biển', en: '4–5 star beach resort', ja: '4～5つ星ビーチリゾート', ko: '4~5성급 비치 리조트', zh: '4-5星海滩度假村' },
  'Homestay bản địa': { vi: 'Homestay bản địa', en: 'Local homestay', ja: '現地ホームステイ', ko: '현지 홈스테이', zh: '当地民宿' },
  'Du thuyền 5 sao ngủ đêm trên vịnh': { vi: 'Du thuyền 5 sao ngủ đêm trên vịnh', en: '5-star overnight bay cruise', ja: '湾内泊5つ星クルーズ', ko: '5성급 만내 숙박 크루즈', zh: '五星海湾过夜游轮' },
  'Các bữa ăn theo chương trình': { vi: 'Các bữa ăn theo chương trình', en: 'Meals per program', ja: '日程通りの食事', ko: '일정에 따른 식사', zh: '按行程安排餐食' },
  'Ăn sáng buffet tại khách sạn': { vi: 'Ăn sáng buffet tại khách sạn', en: 'Hotel buffet breakfast', ja: 'ホテルビュッフェ朝食', ko: '호텔 조식 뷔페', zh: '酒店自助早餐' },
  'Vé tham quan các điểm trong chương trình': { vi: 'Vé tham quan các điểm trong chương trình', en: 'Sightseeing tickets per program', ja: '日程内の観光チケット', ko: '일정 내 관광 입장권', zh: '行程内景点门票' },
  'Vé cáp treo theo chương trình': { vi: 'Vé cáp treo theo chương trình', en: 'Cable car tickets per program', ja: '日程通りのロープウェイ', ko: '일정에 따른 케이블카', zh: '按行程安排缆车票' },
  'Tour 4 đảo kèm lặn ngắm san hô': { vi: 'Tour 4 đảo kèm lặn ngắm san hô', en: '4-island tour with snorkeling', ja: 'シュノーケリング付き4島ツアー', ko: '스노클링 포함 4개 섬 투어', zh: '含浮潜四岛游' },
  'Vé vui chơi VinWonders': { vi: 'Vé vui chơi VinWonders', en: 'VinWonders tickets', ja: 'VinWondersチケット', ko: '빈원더스 입장권', zh: 'VinWonders门票' },
  'Chèo kayak trên vịnh': { vi: 'Chèo kayak trên vịnh', en: 'Bay kayaking', ja: '湾内カヤック', ko: '만 카약', zh: '海湾皮划艇' },
  'Du thuyền sông Nho Quế': { vi: 'Du thuyền sông Nho Quế', en: 'Nho Que river cruise', ja: 'ニョークエ川クルーズ', ko: '뇨퀘강 크루즈', zh: 'Nho Quế河游船' },
  'Thuyền tham quan Tràng An': { vi: 'Thuyền tham quan Tràng An', en: 'Trang An boat ride', ja: 'チャンアンボート', ko: '짱안 보트', zh: '长安乘船游览' },
  'Thuyền tham quan sông nước': { vi: 'Thuyền tham quan sông nước', en: 'River boat ride', ja: 'リバーボート', ko: '리버보트', zh: '内河乘船游览' },
  'Thuyền thả đèn sông Hoài': { vi: 'Thuyền thả đèn sông Hoài', en: 'Hoai river lantern boat', ja: 'ホアイ川灯籠ボート', ko: '호아이강 소원배', zh: '会安河放灯船' },
  'Xe jeep tham quan đồi cát': { vi: 'Xe jeep tham quan đồi cát', en: 'Jeep sand-dune tour', ja: 'ジープ砂丘ツアー', ko: '지프 사막 투어', zh: '吉普车沙丘游' },
  'Cano tham quan đảo': { vi: 'Cano tham quan đảo', en: 'Island speedboat tour', ja: '高速船アイランドツアー', ko: '스피드보트 섬 투어', zh: '快艇海岛游' },
  'Hướng dẫn viên địa phương': { vi: 'Hướng dẫn viên địa phương', en: 'Local guide', ja: '現地ガイド', ko: '현지 가이드', zh: '当地导游' },
  'Bảo hiểm du lịch': { vi: 'Bảo hiểm du lịch', en: 'Travel insurance', ja: '旅行保険', ko: '여행자 보험', zh: '旅游保险' },
  'Nước suối mỗi ngày': { vi: 'Nước suối mỗi ngày', en: 'Daily bottled water', ja: '毎日のミネラルウォーター', ko: '매일 생수', zh: '每日瓶装水' },
  'Chi phí cá nhân': { vi: 'Chi phí cá nhân', en: 'Personal expenses', ja: '個人的費用', ko: '개인 경비', zh: '个人消费' },
  'Đồ uống ngoài chương trình': { vi: 'Đồ uống ngoài chương trình', en: 'Drinks outside program', ja: '日程外の飲み物', ko: '일정 외 음료', zh: '行程外饮品' },
  'Tiền tip cho HDV và tài xế': { vi: 'Tiền tip cho HDV và tài xế', en: 'Tips for guide & driver', ja: 'ガイド・運転手へのチップ', ko: '가이드·기사 팁', zh: '导游司机小费' },
  'Phụ thu phòng đơn': { vi: 'Phụ thu phòng đơn', en: 'Single-room surcharge', ja: 'シングル追加料金', ko: '싱글룸 추가요금', zh: '单房差' },
  'Dịch vụ spa trên du thuyền': { vi: 'Dịch vụ spa trên du thuyền', en: 'Onboard spa services', ja: '船内スパ', ko: '선상 스파', zh: '游轮水疗服务' },
  'Thuế VAT khi xuất hóa đơn': { vi: 'Thuế VAT khi xuất hóa đơn', en: 'VAT for invoices', ja: '領収書発行時のVAT', ko: '세금계산서 부가세', zh: '开票增值税' },
  'Vé VinWonders & Safari': { vi: 'Vé VinWonders & Safari', en: 'VinWonders & Safari tickets', ja: 'VinWonders＆サファリチケット', ko: '빈원더스·사파리 입장권', zh: 'VinWonders及野生动物园门票' },
  'Thuê xe máy tự lái': { vi: 'Thuê xe máy tự lái', en: 'Self-drive motorbike rental', ja: 'レンタルバイク', ko: '오토바이 대여', zh: '摩托车租赁' },
  'Lễ viếng riêng': { vi: 'Lễ viếng riêng', en: 'Private offerings', ja: '個人のお供え', ko: '개인 제물', zh: '私人祭拜用品' },
  'Dịch vụ spa tại resort': { vi: 'Dịch vụ spa tại resort', en: 'Resort spa services', ja: 'リゾートスパ', ko: '리조트 스파', zh: '度假村水疗服务' },
  'Vé bảo tàng sáp': { vi: 'Vé bảo tàng sáp', en: 'Wax museum tickets', ja: '蝋人形館チケット', ko: '밀랍인형박물관 입장권', zh: '蜡像馆门票' },
};

export function translateService(text: string, lng: Language): string {
  return SERVICE_LABELS[text]?.[lng] ?? text;
}

export function useServiceLabel(): (text: string) => string {
  const { i18n } = useTranslation();
  const lng = (i18n.language as Language) ?? 'vi';
  return (text: string) => translateService(text, lng);
}
