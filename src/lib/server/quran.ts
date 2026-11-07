// ============================================================================
//  Al-Qur'an Al-Kareem — data layer.
//  • 114 surahs (embedded, works fully offline)
//  • 11 reciters (القرّاء) — Egyptians first — streamed/downloaded as whole
//    surahs from mp3quran.net (server5). NEVER clipped: a surah is always
//    delivered in full so its meaning is preserved.
// ============================================================================

export interface Surah {
  n: number;
  ar: string;
  en: string;
  a: number; // ayahs
  r: "Meccan" | "Medinan";
}

export const SURAHS: Surah[] = [{"n":1,"ar":"ٱلْفَاتِحَةِ","en":"Al-Faatiha","a":7,"r":"Meccan"},{"n":2,"ar":"البَقَرَةِ","en":"Al-Baqara","a":286,"r":"Medinan"},{"n":3,"ar":"آلِ عِمۡرَانَ","en":"Aal-i-Imraan","a":200,"r":"Medinan"},{"n":4,"ar":"النِّسَاءِ","en":"An-Nisaa","a":176,"r":"Medinan"},{"n":5,"ar":"المَائـِدَةِ","en":"Al-Maaida","a":120,"r":"Medinan"},{"n":6,"ar":"الأَنۡعَامِ","en":"Al-An'aam","a":165,"r":"Meccan"},{"n":7,"ar":"الأَعۡرَافِ","en":"Al-A'raaf","a":206,"r":"Meccan"},{"n":8,"ar":"الأَنفَالِ","en":"Al-Anfaal","a":75,"r":"Medinan"},{"n":9,"ar":"التَّوۡبَةِ","en":"At-Tawba","a":129,"r":"Medinan"},{"n":10,"ar":"يُونُسَ","en":"Yunus","a":109,"r":"Meccan"},{"n":11,"ar":"هُودٍ","en":"Hud","a":123,"r":"Meccan"},{"n":12,"ar":"يُوسُفَ","en":"Yusuf","a":111,"r":"Meccan"},{"n":13,"ar":"الرَّعۡدِ","en":"Ar-Ra'd","a":43,"r":"Medinan"},{"n":14,"ar":"إِبۡرَاهِيمَ","en":"Ibrahim","a":52,"r":"Meccan"},{"n":15,"ar":"الحِجۡرِ","en":"Al-Hijr","a":99,"r":"Meccan"},{"n":16,"ar":"النَّحۡلِ","en":"An-Nahl","a":128,"r":"Meccan"},{"n":17,"ar":"الإِسۡرَاءِ","en":"Al-Israa","a":111,"r":"Meccan"},{"n":18,"ar":"الكَهۡفِ","en":"Al-Kahf","a":110,"r":"Meccan"},{"n":19,"ar":"مَرۡيَمَ","en":"Maryam","a":98,"r":"Meccan"},{"n":20,"ar":"طه","en":"Taa-Haa","a":135,"r":"Meccan"},{"n":21,"ar":"الأَنبِيَاءِ","en":"Al-Anbiyaa","a":112,"r":"Meccan"},{"n":22,"ar":"الحَجِّ","en":"Al-Hajj","a":78,"r":"Medinan"},{"n":23,"ar":"المُؤۡمِنُونَ","en":"Al-Muminoon","a":118,"r":"Meccan"},{"n":24,"ar":"النُّورِ","en":"An-Noor","a":64,"r":"Medinan"},{"n":25,"ar":"الفُرۡقَانِ","en":"Al-Furqaan","a":77,"r":"Meccan"},{"n":26,"ar":"الشُّعَرَاءِ","en":"Ash-Shu'araa","a":227,"r":"Meccan"},{"n":27,"ar":"النَّمۡلِ","en":"An-Naml","a":93,"r":"Meccan"},{"n":28,"ar":"القَصَصِ","en":"Al-Qasas","a":88,"r":"Meccan"},{"n":29,"ar":"العَنكَبُوتِ","en":"Al-Ankaboot","a":69,"r":"Meccan"},{"n":30,"ar":"الرُّومِ","en":"Ar-Room","a":60,"r":"Meccan"},{"n":31,"ar":"لُقۡمَانَ","en":"Luqman","a":34,"r":"Meccan"},{"n":32,"ar":"السَّجۡدَةِ","en":"As-Sajda","a":30,"r":"Meccan"},{"n":33,"ar":"الأَحۡزَابِ","en":"Al-Ahzaab","a":73,"r":"Medinan"},{"n":34,"ar":"سَبَإٍ","en":"Saba","a":54,"r":"Meccan"},{"n":35,"ar":"فَاطِرٍ","en":"Faatir","a":45,"r":"Meccan"},{"n":36,"ar":"يسٓ","en":"Yaseen","a":83,"r":"Meccan"},{"n":37,"ar":"الصَّافَّاتِ","en":"As-Saaffaat","a":182,"r":"Meccan"},{"n":38,"ar":"صٓ","en":"Saad","a":88,"r":"Meccan"},{"n":39,"ar":"الزُّمَرِ","en":"Az-Zumar","a":75,"r":"Meccan"},{"n":40,"ar":"غَافِرٍ","en":"Ghafir","a":85,"r":"Meccan"},{"n":41,"ar":"فُصِّلَتۡ","en":"Fussilat","a":54,"r":"Meccan"},{"n":42,"ar":"الشُّورَىٰ","en":"Ash-Shura","a":53,"r":"Meccan"},{"n":43,"ar":"الزُّخۡرُفِ","en":"Az-Zukhruf","a":89,"r":"Meccan"},{"n":44,"ar":"الدُّخَانِ","en":"Ad-Dukhaan","a":59,"r":"Meccan"},{"n":45,"ar":"الجَاثِيَةِ","en":"Al-Jaathiya","a":37,"r":"Meccan"},{"n":46,"ar":"الأَحۡقَافِ","en":"Al-Ahqaf","a":35,"r":"Meccan"},{"n":47,"ar":"مُحَمَّدٍ","en":"Muhammad","a":38,"r":"Medinan"},{"n":48,"ar":"الفَتۡحِ","en":"Al-Fath","a":29,"r":"Medinan"},{"n":49,"ar":"الحُجُرَاتِ","en":"Al-Hujuraat","a":18,"r":"Medinan"},{"n":50,"ar":"قٓ","en":"Qaaf","a":45,"r":"Meccan"},{"n":51,"ar":"الذَّارِيَاتِ","en":"Adh-Dhaariyat","a":60,"r":"Meccan"},{"n":52,"ar":"الطُّورِ","en":"At-Tur","a":49,"r":"Meccan"},{"n":53,"ar":"النَّجۡمِ","en":"An-Najm","a":62,"r":"Meccan"},{"n":54,"ar":"القَمَرِ","en":"Al-Qamar","a":55,"r":"Meccan"},{"n":55,"ar":"الرَّحۡمَٰن","en":"Ar-Rahmaan","a":78,"r":"Medinan"},{"n":56,"ar":"الوَاقِعَةِ","en":"Al-Waaqia","a":96,"r":"Meccan"},{"n":57,"ar":"الحَدِيدِ","en":"Al-Hadid","a":29,"r":"Medinan"},{"n":58,"ar":"المُجَادلَةِ","en":"Al-Mujaadila","a":22,"r":"Medinan"},{"n":59,"ar":"الحَشۡرِ","en":"Al-Hashr","a":24,"r":"Medinan"},{"n":60,"ar":"المُمۡتَحنَةِ","en":"Al-Mumtahana","a":13,"r":"Medinan"},{"n":61,"ar":"الصَّفِّ","en":"As-Saff","a":14,"r":"Medinan"},{"n":62,"ar":"الجُمُعَةِ","en":"Al-Jumu'a","a":11,"r":"Medinan"},{"n":63,"ar":"المُنَافِقُونَ","en":"Al-Munaafiqoon","a":11,"r":"Medinan"},{"n":64,"ar":"التَّغَابُنِ","en":"At-Taghaabun","a":18,"r":"Medinan"},{"n":65,"ar":"الطَّلَاقِ","en":"At-Talaaq","a":12,"r":"Medinan"},{"n":66,"ar":"التَّحۡرِيمِ","en":"At-Tahrim","a":12,"r":"Medinan"},{"n":67,"ar":"المُلۡكِ","en":"Al-Mulk","a":30,"r":"Meccan"},{"n":68,"ar":"القَلَمِ","en":"Al-Qalam","a":52,"r":"Meccan"},{"n":69,"ar":"الحَاقَّةِ","en":"Al-Haaqqa","a":52,"r":"Meccan"},{"n":70,"ar":"المَعَارِجِ","en":"Al-Ma'aarij","a":44,"r":"Meccan"},{"n":71,"ar":"نُوحٍ","en":"Nooh","a":28,"r":"Meccan"},{"n":72,"ar":"الجِنِّ","en":"Al-Jinn","a":28,"r":"Meccan"},{"n":73,"ar":"المُزَّمِّلِ","en":"Al-Muzzammil","a":20,"r":"Meccan"},{"n":74,"ar":"المُدَّثِّرِ","en":"Al-Muddaththir","a":56,"r":"Meccan"},{"n":75,"ar":"القِيَامَةِ","en":"Al-Qiyaama","a":40,"r":"Meccan"},{"n":76,"ar":"الإِنسَانِ","en":"Al-Insaan","a":31,"r":"Medinan"},{"n":77,"ar":"المُرۡسَلَاتِ","en":"Al-Mursalaat","a":50,"r":"Meccan"},{"n":78,"ar":"النَّبَإِ","en":"An-Naba","a":40,"r":"Meccan"},{"n":79,"ar":"النَّازِعَاتِ","en":"An-Naazi'aat","a":46,"r":"Meccan"},{"n":80,"ar":"عَبَسَ","en":"Abasa","a":42,"r":"Meccan"},{"n":81,"ar":"التَّكۡوِيرِ","en":"At-Takwir","a":29,"r":"Meccan"},{"n":82,"ar":"الانفِطَارِ","en":"Al-Infitaar","a":19,"r":"Meccan"},{"n":83,"ar":"المُطَفِّفِينَ","en":"Al-Mutaffifin","a":36,"r":"Meccan"},{"n":84,"ar":"الانشِقَاقِ","en":"Al-Inshiqaaq","a":25,"r":"Meccan"},{"n":85,"ar":"البُرُوجِ","en":"Al-Burooj","a":22,"r":"Meccan"},{"n":86,"ar":"الطَّارِقِ","en":"At-Taariq","a":17,"r":"Meccan"},{"n":87,"ar":"الأَعۡلَىٰ","en":"Al-A'laa","a":19,"r":"Meccan"},{"n":88,"ar":"الغَاشِيَةِ","en":"Al-Ghaashiya","a":26,"r":"Meccan"},{"n":89,"ar":"الفَجۡرِ","en":"Al-Fajr","a":30,"r":"Meccan"},{"n":90,"ar":"البَلَدِ","en":"Al-Balad","a":20,"r":"Meccan"},{"n":91,"ar":"الشَّمۡسِ","en":"Ash-Shams","a":15,"r":"Meccan"},{"n":92,"ar":"اللَّيۡلِ","en":"Al-Lail","a":21,"r":"Meccan"},{"n":93,"ar":"الضُّحَىٰ","en":"Ad-Dhuhaa","a":11,"r":"Meccan"},{"n":94,"ar":"الشَّرۡحِ","en":"Ash-Sharh","a":8,"r":"Meccan"},{"n":95,"ar":"التِّينِ","en":"At-Tin","a":8,"r":"Meccan"},{"n":96,"ar":"العَلَقِ","en":"Al-Alaq","a":19,"r":"Meccan"},{"n":97,"ar":"القَدۡرِ","en":"Al-Qadr","a":5,"r":"Meccan"},{"n":98,"ar":"البَيِّنَةِ","en":"Al-Bayyina","a":8,"r":"Medinan"},{"n":99,"ar":"الزَّلۡزَلَةِ","en":"Az-Zalzala","a":8,"r":"Medinan"},{"n":100,"ar":"العَادِيَاتِ","en":"Al-Aadiyaat","a":11,"r":"Meccan"},{"n":101,"ar":"القَارِعَةِ","en":"Al-Qaari'a","a":11,"r":"Meccan"},{"n":102,"ar":"التَّكَاثُرِ","en":"At-Takaathur","a":8,"r":"Meccan"},{"n":103,"ar":"العَصۡرِ","en":"Al-Asr","a":3,"r":"Meccan"},{"n":104,"ar":"الهُمَزَةِ","en":"Al-Humaza","a":9,"r":"Meccan"},{"n":105,"ar":"الفِيلِ","en":"Al-Fil","a":5,"r":"Meccan"},{"n":106,"ar":"قُرَيۡشٍ","en":"Quraish","a":4,"r":"Meccan"},{"n":107,"ar":"المَاعُونِ","en":"Al-Maa'un","a":7,"r":"Meccan"},{"n":108,"ar":"الكَوۡثَرِ","en":"Al-Kawthar","a":3,"r":"Meccan"},{"n":109,"ar":"الكَافِرُونَ","en":"Al-Kaafiroon","a":6,"r":"Meccan"},{"n":110,"ar":"النَّصۡرِ","en":"An-Nasr","a":3,"r":"Medinan"},{"n":111,"ar":"المَسَدِ","en":"Al-Masad","a":5,"r":"Meccan"},{"n":112,"ar":"الإِخۡلَاصِ","en":"Al-Ikhlaas","a":4,"r":"Meccan"},{"n":113,"ar":"الفَلَقِ","en":"Al-Falaq","a":5,"r":"Meccan"},{"n":114,"ar":"النَّاسِ","en":"An-Naas","a":6,"r":"Meccan"}];

export interface Reciter {
  code: string;
  name: string; // Arabic
  latin: string;
  country: string;
  countryAr: string;
  isEgyptian: boolean;
  style: string; // Arabic descriptor (Murattal / Mujawwad)
}

// Reciters — Egyptians first, then Saudi, then others. All on server5.
export const RECITERS: Reciter[] = [
  { code: "basit", name: "عبد الباسط عبد الصمد", latin: "Abdul-Basit Abdul-Samad", country: "EG", countryAr: "مصر", isEgyptian: true, style: "مرتّل" },
  { code: "husary", name: "محمود خليل الحصري", latin: "Mahmoud Khalil Al-Husary", country: "EG", countryAr: "مصر", isEgyptian: true, style: "مرتّل" },
  { code: "minsh", name: "محمد صديق المنشاوي", latin: "Mohamed El-Minshawi", country: "EG", countryAr: "مصر", isEgyptian: true, style: "مرتّل" },
  { code: "rifai", name: "هاني الرفاعي", latin: "Hani Ar-Rifai", country: "EG", countryAr: "مصر", isEgyptian: true, style: "مرتّل" },
  { code: "sudais", name: "عبد الرحمن السديس", latin: "Abdur-Rahman As-Sudais", country: "SA", countryAr: "السعودية", isEgyptian: false, style: "مرتّل" },
  { code: "shur", name: "سعود الشريم", latin: "Saud Ash-Shuraim", country: "SA", countryAr: "السعودية", isEgyptian: false, style: "مرتّل" },
  { code: "shatri", name: "أبو بكر الشاطري", latin: "Abu-Bakr Al-Shatri", country: "SA", countryAr: "السعودية", isEgyptian: false, style: "مرتّل" },
  { code: "ayyub", name: "محمد أيوب", latin: "Muhammad Ayyub", country: "SA", countryAr: "السعودية", isEgyptian: false, style: "مرتّل" },
  { code: "ghamdi", name: "سعد الغامدي", latin: "Saad Al-Ghamdi", country: "SA", countryAr: "السعودية", isEgyptian: false, style: "مرتّل" },
  { code: "yasser", name: "ياسر الدوسري", latin: "Yasser Ad-Dosari", country: "SA", countryAr: "السعودية", isEgyptian: false, style: "مرتّل" },
  { code: "afs", name: "مشاري العفاسي", latin: "Mishary Alafasy", country: "KW", countryAr: "الكويت", isEgyptian: false, style: "مرتّل" },
];

const H = (code: string) =>
  RECITERS.find((r) => r.code === code) ?? null;

export function getSurah(n: number): Surah | null {
  return SURAHS.find((s) => s.n === n) ?? null;
}

/** Whole-surah MP3 source URL (server5 / mp3quran.net). */
export function surahUrl(n: number, code: string): string {
  const pad = String(n).padStart(3, "0");
  return `https://server5.mp3quran.net/${code}/${pad}.mp3`;
}

/** Our in-app stream proxy (Range-capable) for playback. */
export function streamProxy(n: number, code: string): string {
  return `/api/quran/stream?surah=${n}&reciter=${code}`;
}

/** Our in-app download URL (Content-Disposition) for the full surah. */
export function downloadUrl(n: number, code: string): string {
  return `/api/quran/download?surah=${n}&reciter=${code}`;
}

export function reciterByCode(code: string): Reciter | null {
  return H(code);
}

export const QURAN_SOURCE_LABEL = "القرآن الكريم";
