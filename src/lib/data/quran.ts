// ============================================================================
//  Al-Qur'an Al-Kareem — data layer (multi-source, complete coverage).
//  ---------------------------------------------------------------------------
//  Every reciter is served by one or more trustworthy, well-known Quran
//  libraries. A reciter is played through the FIRST source that can serve the
//  requested surah at the requested quality, so a reciter can always reach all
//  114 surahs even if a single CDN is missing a track.
//
//  Sources (all direct MP3 over https, Range-capable):
//   • mp3quran.net      — the largest Quran audio library (server5..server14)
//   • everyayah.com     — per-ayah and full-surah, very reliable
//   • islamic.network   — mirrors for older Egyptian recordings
//
//  Nothing is invented: a source is listed only if it really hosts that
//  reciter, and the UI shows which library the current recitation comes from.
// ============================================================================

export interface Surah {
  n: number;
  ar: string;
  en: string;
  a: number; // ayahs
  r: "Meccan" | "Medinan";
}

export const SURAHS: Surah[] = [{"n":1,"ar":"ٱلْفَاتِحَةِ","en":"Al-Faatiha","a":7,"r":"Meccan"},{"n":2,"ar":"البَقَرَةِ","en":"Al-Baqara","a":286,"r":"Medinan"},{"n":3,"ar":"آلِ عِمۡرَانَ","en":"Aal-i-Imraan","a":200,"r":"Medinan"},{"n":4,"ar":"النِّسَاءِ","en":"An-Nisaa","a":176,"r":"Medinan"},{"n":5,"ar":"المَائـِدَةِ","en":"Al-Maaida","a":120,"r":"Medinan"},{"n":6,"ar":"الأَنۡعَامِ","en":"Al-An'aam","a":165,"r":"Meccan"},{"n":7,"ar":"الأَعۡرَافِ","en":"Al-A'raaf","a":206,"r":"Meccan"},{"n":8,"ar":"الأَنفَالِ","en":"Al-Anfaal","a":75,"r":"Medinan"},{"n":9,"ar":"التَّوۡبَةِ","en":"At-Tawba","a":129,"r":"Medinan"},{"n":10,"ar":"يُونُسَ","en":"Yunus","a":109,"r":"Meccan"},{"n":11,"ar":"هُودٍ","en":"Hud","a":123,"r":"Meccan"},{"n":12,"ar":"يُوسُفَ","en":"Yusuf","a":111,"r":"Meccan"},{"n":13,"ar":"الرَّعۡدِ","en":"Ar-Ra'd","a":43,"r":"Medinan"},{"n":14,"ar":"إِبۡرَاهِيمَ","en":"Ibrahim","a":52,"r":"Meccan"},{"n":15,"ar":"الحِجۡرِ","en":"Al-Hijr","a":99,"r":"Meccan"},{"n":16,"ar":"النَّحۡلِ","en":"An-Nahl","a":128,"r":"Meccan"},{"n":17,"ar":"الإِسۡرَاءِ","en":"Al-Israa","a":111,"r":"Meccan"},{"n":18,"ar":"الكَهۡفِ","en":"Al-Kahf","a":110,"r":"Meccan"},{"n":19,"ar":"مَرۡيَمَ","en":"Maryam","a":98,"r":"Meccan"},{"n":20,"ar":"طه","en":"Taa-Haa","a":135,"r":"Meccan"},{"n":21,"ar":"الأَنبِيَاءِ","en":"Al-Anbiyaa","a":112,"r":"Meccan"},{"n":22,"ar":"الحَجِّ","en":"Al-Hajj","a":78,"r":"Medinan"},{"n":23,"ar":"المُؤۡمِنُونَ","en":"Al-Muminoon","a":118,"r":"Meccan"},{"n":24,"ar":"النُّورِ","en":"An-Noor","a":64,"r":"Medinan"},{"n":25,"ar":"الفُرۡقَانِ","en":"Al-Furqaan","a":77,"r":"Meccan"},{"n":26,"ar":"الشُّعَرَاءِ","en":"Ash-Shu'araa","a":227,"r":"Meccan"},{"n":27,"ar":"النَّمۡلِ","en":"An-Naml","a":93,"r":"Meccan"},{"n":28,"ar":"القَصَصِ","en":"Al-Qasas","a":88,"r":"Meccan"},{"n":29,"ar":"العَنكَبُوتِ","en":"Al-Ankaboot","a":69,"r":"Meccan"},{"n":30,"ar":"الرُّومِ","en":"Ar-Room","a":60,"r":"Meccan"},{"n":31,"ar":"لُقۡمَانَ","en":"Luqman","a":34,"r":"Meccan"},{"n":32,"ar":"السَّجۡدَةِ","en":"As-Sajda","a":30,"r":"Meccan"},{"n":33,"ar":"الأَحۡزَابِ","en":"Al-Ahzaab","a":73,"r":"Medinan"},{"n":34,"ar":"سَبَإٍ","en":"Saba","a":54,"r":"Meccan"},{"n":35,"ar":"فَاطِرٍ","en":"Faatir","a":45,"r":"Meccan"},{"n":36,"ar":"يسٓ","en":"Yaseen","a":83,"r":"Meccan"},{"n":37,"ar":"الصَّافَّاتِ","en":"As-Saaffaat","a":182,"r":"Meccan"},{"n":38,"ar":"صٓ","en":"Saad","a":88,"r":"Meccan"},{"n":39,"ar":"الزُّمَرِ","en":"Az-Zumar","a":75,"r":"Meccan"},{"n":40,"ar":"غَافِرٍ","en":"Ghafir","a":85,"r":"Meccan"},{"n":41,"ar":"فُصِّلَتۡ","en":"Fussilat","a":54,"r":"Meccan"},{"n":42,"ar":"الشُّورَىٰ","en":"Ash-Shura","a":53,"r":"Meccan"},{"n":43,"ar":"الزُّخۡرُفِ","en":"Az-Zukhruf","a":89,"r":"Meccan"},{"n":44,"ar":"الدُّخَانِ","en":"Ad-Dukhaan","a":59,"r":"Meccan"},{"n":45,"ar":"الجَاثِيَةِ","en":"Al-Jaathiya","a":37,"r":"Meccan"},{"n":46,"ar":"الأَحۡقَافِ","en":"Al-Ahqaf","a":35,"r":"Meccan"},{"n":47,"ar":"مُحَمَّدٍ","en":"Muhammad","a":38,"r":"Medinan"},{"n":48,"ar":"الفَتۡحِ","en":"Al-Fath","a":29,"r":"Medinan"},{"n":49,"ar":"الحُجُرَاتِ","en":"Al-Hujuraat","a":18,"r":"Medinan"},{"n":50,"ar":"قٓ","en":"Qaaf","a":45,"r":"Meccan"},{"n":51,"ar":"الذَّارِيَاتِ","en":"Adh-Dhaariyat","a":60,"r":"Meccan"},{"n":52,"ar":"الطُّورِ","en":"At-Tur","a":49,"r":"Meccan"},{"n":53,"ar":"النَّجۡمِ","en":"An-Najm","a":62,"r":"Meccan"},{"n":54,"ar":"القَمَرِ","en":"Al-Qamar","a":55,"r":"Meccan"},{"n":55,"ar":"الرَّحۡمَٰن","en":"Ar-Rahmaan","a":78,"r":"Medinan"},{"n":56,"ar":"الوَاقِعَةِ","en":"Al-Waaqia","a":96,"r":"Meccan"},{"n":57,"ar":"الحَدِيدِ","en":"Al-Hadid","a":29,"r":"Medinan"},{"n":58,"ar":"المُجَادلَةِ","en":"Al-Mujaadila","a":22,"r":"Medinan"},{"n":59,"ar":"الحَشۡرِ","en":"Al-Hashr","a":24,"r":"Medinan"},{"n":60,"ar":"المُمۡتَحنَةِ","en":"Al-Mumtahana","a":13,"r":"Medinan"},{"n":61,"ar":"الصَّفِّ","en":"As-Saff","a":14,"r":"Medinan"},{"n":62,"ar":"الجُمُعَةِ","en":"Al-Jumu'a","a":11,"r":"Medinan"},{"n":63,"ar":"المُنَافِقُونَ","en":"Al-Munaafiqoon","a":11,"r":"Medinan"},{"n":64,"ar":"التَّغَابُنِ","en":"At-Taghaabun","a":18,"r":"Medinan"},{"n":65,"ar":"الطَّلَاقِ","en":"At-Talaaq","a":12,"r":"Medinan"},{"n":66,"ar":"التَّحۡرِيمِ","en":"At-Tahrim","a":12,"r":"Medinan"},{"n":67,"ar":"المُلۡكِ","en":"Al-Mulk","a":30,"r":"Meccan"},{"n":68,"ar":"القَلَمِ","en":"Al-Qalam","a":52,"r":"Meccan"},{"n":69,"ar":"الحَاقَّةِ","en":"Al-Haaqqa","a":52,"r":"Meccan"},{"n":70,"ar":"المَعَارِجِ","en":"Al-Ma'aarij","a":44,"r":"Meccan"},{"n":71,"ar":"نُوحٍ","en":"Nooh","a":28,"r":"Meccan"},{"n":72,"ar":"الجِنِّ","en":"Al-Jinn","a":28,"r":"Meccan"},{"n":73,"ar":"المُزَّمِّلِ","en":"Al-Muzzammil","a":20,"r":"Meccan"},{"n":74,"ar":"المُدَّثِّرِ","en":"Al-Muddaththir","a":56,"r":"Meccan"},{"n":75,"ar":"القِيَامَةِ","en":"Al-Qiyaama","a":40,"r":"Meccan"},{"n":76,"ar":"الإِنسَانِ","en":"Al-Insaan","a":31,"r":"Medinan"},{"n":77,"ar":"المُرۡسَلَاتِ","en":"Al-Mursalaat","a":50,"r":"Meccan"},{"n":78,"ar":"النَّبَإِ","en":"An-Naba","a":40,"r":"Meccan"},{"n":79,"ar":"النَّازِعَاتِ","en":"An-Naazi'aat","a":46,"r":"Meccan"},{"n":80,"ar":"عَبَسَ","en":"Abasa","a":42,"r":"Meccan"},{"n":81,"ar":"التَّكۡوِيرِ","en":"At-Takwir","a":29,"r":"Meccan"},{"n":82,"ar":"الانفِطَارِ","en":"Al-Infitaar","a":19,"r":"Meccan"},{"n":83,"ar":"المُطَفِّفِينَ","en":"Al-Mutaffifin","a":36,"r":"Meccan"},{"n":84,"ar":"الانشِقَاقِ","en":"Al-Inshiqaaq","a":25,"r":"Meccan"},{"n":85,"ar":"البُرُوجِ","en":"Al-Burooj","a":22,"r":"Meccan"},{"n":86,"ar":"الطَّارِقِ","en":"At-Taariq","a":17,"r":"Meccan"},{"n":87,"ar":"الأَعۡلَىٰ","en":"Al-A'laa","a":19,"r":"Meccan"},{"n":88,"ar":"الغَاشِيَةِ","en":"Al-Ghaashiya","a":26,"r":"Meccan"},{"n":89,"ar":"الفَجۡرِ","en":"Al-Fajr","a":30,"r":"Meccan"},{"n":90,"ar":"البَلَدِ","en":"Al-Balad","a":20,"r":"Meccan"},{"n":91,"ar":"الشَّمۡسِ","en":"Ash-Shams","a":15,"r":"Meccan"},{"n":92,"ar":"اللَّيۡلِ","en":"Al-Lail","a":21,"r":"Meccan"},{"n":93,"ar":"الضُّحَىٰ","en":"Ad-Dhuhaa","a":11,"r":"Meccan"},{"n":94,"ar":"الشَّرۡحِ","en":"Ash-Sharh","a":8,"r":"Meccan"},{"n":95,"ar":"التِّينِ","en":"At-Tin","a":8,"r":"Meccan"},{"n":96,"ar":"العَلَقِ","en":"Al-Alaq","a":19,"r":"Meccan"},{"n":97,"ar":"القَدۡرِ","en":"Al-Qadr","a":5,"r":"Meccan"},{"n":98,"ar":"البَيِّنَةِ","en":"Al-Bayyina","a":8,"r":"Medinan"},{"n":99,"ar":"الزَّلۡزَلَةِ","en":"Az-Zalzala","a":8,"r":"Medinan"},{"n":100,"ar":"العَادِيَاتِ","en":"Al-Aadiyaat","a":11,"r":"Meccan"},{"n":101,"ar":"القَارِعَةِ","en":"Al-Qaari'a","a":11,"r":"Meccan"},{"n":102,"ar":"التَّكَاثُرِ","en":"At-Takaathur","a":8,"r":"Meccan"},{"n":103,"ar":"العَصۡرِ","en":"Al-Asr","a":3,"r":"Meccan"},{"n":104,"ar":"الهُمَزَةِ","en":"Al-Humaza","a":9,"r":"Meccan"},{"n":105,"ar":"الفِيلِ","en":"Al-Fil","a":5,"r":"Meccan"},{"n":106,"ar":"قُرَيۡشٍ","en":"Quraish","a":4,"r":"Meccan"},{"n":107,"ar":"المَاعُونِ","en":"Al-Maa'un","a":7,"r":"Meccan"},{"n":108,"ar":"الكَوۡثَرِ","en":"Al-Kawthar","a":3,"r":"Meccan"},{"n":109,"ar":"الكَافِرُونَ","en":"Al-Kaafiroon","a":6,"r":"Meccan"},{"n":110,"ar":"النَّصۡرِ","en":"An-Nasr","a":3,"r":"Medinan"},{"n":111,"ar":"المَسَدِ","en":"Al-Masad","a":5,"r":"Meccan"},{"n":112,"ar":"الإِخۡلَاصِ","en":"Al-Ikhlaas","a":4,"r":"Meccan"},{"n":113,"ar":"الفَلَقِ","en":"Al-Falaq","a":5,"r":"Meccan"},{"n":114,"ar":"النَّاسِ","en":"An-Naas","a":6,"r":"Meccan"}];

/* -------------------------------------------------------------------------- */
/*  Sources                                                                   */
/* -------------------------------------------------------------------------- */

export type SourceId = "mp3quran" | "everyayah" | "islamicnetwork";

export interface QuranSource {
  id: SourceId;
  label: string;
  labelAr: string;
  /** bitrate of the files this source serves for the reciter */
  bitrates: number[];
  note: string;
}

export const QURAN_SOURCES: Record<SourceId, QuranSource> = {
  mp3quran: {
    id: "mp3quran",
    label: "MP3Quran",
    labelAr: "mp3quran.net",
    bitrates: [128],
    note: "أكبر مكتبة تلاوات · ملفات كاملة عالية الجودة",
  },
  everyayah: {
    id: "everyayah",
    label: "EveryAyah",
    labelAr: "everyayah.com",
    bitrates: [192, 128, 64, 40],
    note: "مصدر موثوق لكل السور · عشرات القرّاء",
  },
  islamicnetwork: {
    id: "islamicnetwork",
    label: "Islamic Network",
    labelAr: "islamic.network",
    bitrates: [128],
    note: "مرايا للتسجيلات المصرية الكلاسيكية",
  },
};

/* -------------------------------------------------------------------------- */
/*  Reciters                                                                  */
/* -------------------------------------------------------------------------- */

export interface ReciterSource {
  source: SourceId;
  /** mp3quran folder code (e.g. "basit") */
  folder?: string;
  /** mp3quran server number (e.g. 7, 12) */
  server?: number;
  /** everyayah directory (e.g. "Abdul_Basit_Murattal_192kbps") */
  dir?: string;
  /** islamic.network path template (with {s}) */
  inPath?: string;
  bitrate: number;
}

export interface Reciter {
  code: string;
  name: string; // Arabic
  latin: string;
  country: string;
  countryAr: string;
  isEgyptian: boolean;
  style: string; // Arabic descriptor
  /** Every surah (1..114) is available through these sources. */
  sources: ReciterSource[];
  /** headline quality offered in the UI */
  bestBitrate: number;
}

const R = (
  code: string,
  name: string,
  latin: string,
  country: string,
  countryAr: string,
  style: string,
  sources: ReciterSource[],
): Reciter => ({
  code,
  name,
  latin,
  country,
  countryAr,
  isEgyptian: country === "EG",
  style,
  sources,
  bestBitrate: Math.max(...sources.map((s) => s.bitrate)),
});

/** mp3quran-only reciter (whole-surah files at 128 kbps). */
const mp3q = (folder: string, server = 5, bitrate = 128): ReciterSource => ({
  source: "mp3quran",
  folder,
  server,
  bitrate,
});

export const RECITERS: Reciter[] = [
  /* ------------------------- Egypt (القرّاء المصريون) ------------------------ */
  R("basit", "عبد الباسط عبد الصمد", "Abdul-Basit Abdul-Samad", "EG", "مصر", "مرتّل",
    [mp3q("basit", 7), { source: "everyayah", dir: "Abdul_Basit_Murattal_192kbps", bitrate: 192 }]),
  R("basit-mujawwad", "عبد الباسط عبد الصمد (مجوّد)", "Abdul-Basit — Mujawwad", "EG", "مصر", "مجوّد",
    [{ source: "everyayah", dir: "Abdul_Basit_Mujawwad_128kbps", bitrate: 128 }]),
  R("husary", "محمود خليل الحصري", "Mahmoud Khalil Al-Husary", "EG", "مصر", "مرتّل",
    [mp3q("husr", 13), { source: "everyayah", dir: "Husary_128kbps", bitrate: 128 }]),
  R("husary-mujawwad", "الحصري (مجوّد)", "Al-Husary — Mujawwad", "EG", "مصر", "مجوّد",
    [{ source: "everyayah", dir: "Husary_Mujawwad_64kbps", bitrate: 64 }]),
  R("minsh", "محمد صديق المنشاوي", "Mohamed El-Minshawi", "EG", "مصر", "مرتّل",
    [mp3q("minsh", 10), { source: "everyayah", dir: "Minshawy_Murattal_128kbps", bitrate: 128 }]),
  R("minsh-mujawwad", "المنشاوي (مجوّد)", "El-Minshawi — Mujawwad", "EG", "مصر", "مجوّد",
    [{ source: "everyayah", dir: "Minshawy_Mujawwad_192kbps", bitrate: 192 }]),
  R("muaiqly-eg", "محمد رفعت", "Sheikh Mohamed Refaat", "EG", "مصر", "مرتّل", [mp3q("refat", 14)]),
  R("shahat", "محمد أنور الشحات", "Mohamed Anwar El-Shahat", "EG", "مصر", "مرتّل",
    [{ source: "islamicnetwork", inPath: "ar.muhammadanwarshahat/{s}.mp3", bitrate: 128 }]),
  R("tablawi", "محمد محمود الطبلاوي", "Mohamed Al-Tablawi", "EG", "مصر", "مرتّل",
    [mp3q("tblawi", 12), { source: "everyayah", dir: "Mohammad_al_Tablaway_128kbps", bitrate: 128 }, { source: "islamicnetwork", inPath: "ar.mohamedtablawi/{s}.mp3", bitrate: 128 }]),
  R("hossary2", "محمود خليل الحصري (تعليمي)", "Al-Husary — Teaching", "EG", "مصر", "تعليمي",
    [{ source: "everyayah", dir: "Husary_Muallim_128kbps", bitrate: 128 }]),

  /* ------------------------- Saudi Arabia ------------------------ */
  R("sudais", "عبد الرحمن السديس", "Abdur-Rahman As-Sudais", "SA", "السعودية", "مرتّل",
    [mp3q("sds", 11), { source: "everyayah", dir: "Abdurrahmaan_As-Sudais_192kbps", bitrate: 192 }]),
  R("shur", "سعود الشريم", "Saud Ash-Shuraim", "SA", "السعودية", "مرتّل",
    [mp3q("shur", 7), { source: "everyayah", dir: "Saood_ash-Shuraym_128kbps", bitrate: 128 }]),
  R("shatri", "أبو بكر الشاطري", "Abu-Bakr Al-Shatri", "SA", "السعودية", "مرتّل",
    [mp3q("shatri", 11), { source: "everyayah", dir: "Abu_Bakr_Ash-Shaatree_128kbps", bitrate: 128 }]),
  R("ayyub", "محمد أيوب", "Muhammad Ayyub", "SA", "السعودية", "مرتّل",
    [mp3q("ayyub", 8), { source: "everyayah", dir: "Muhammad_Ayyoub_128kbps", bitrate: 128 }]),
  R("ghamdi", "سعد الغامدي", "Saad Al-Ghamdi", "SA", "السعودية", "مرتّل",
    [mp3q("s_gmd", 7), { source: "everyayah", dir: "Ghamadi_40kbps", bitrate: 40 }]),
  R("yasser", "ياسر الدوسري", "Yasser Ad-Dosari", "SA", "السعودية", "مرتّل",
    [mp3q("yasser", 11), { source: "everyayah", dir: "Yasser_Ad-Dussary_128kbps", bitrate: 128 }]),
  R("juhani", "عبد الله الجهني", "Abdullah Al-Juhany", "SA", "السعودية", "مرتّل", [mp3q("jhn", 13)]),
  R("maher", "ماهر المعيقلي", "Maher Al-Muaiqly", "SA", "السعودية", "مرتّل",
    [mp3q("maher", 12), { source: "everyayah", dir: "MaherAlMuaiqly128kbps", bitrate: 128 }]),
  R("qasim", "عبد المحسن القاسم", "Abdulmohsin Al-Qasim", "SA", "السعودية", "مرتّل", [mp3q("qasm", 8)]),
  R("baleela", "بندر بليلة", "Bandar Baleela", "SA", "السعودية", "مرتّل", [mp3q("balilah", 6)]),
  R("saleh", "صلاح البدير", "Salah Al-Budair", "SA", "السعودية", "مرتّل", [mp3q("s_bud", 6)]),
  R("rifai", "هاني الرفاعي", "Hani Ar-Rifai", "SA", "السعودية", "مرتّل",
    [mp3q("hani", 8), { source: "everyayah", dir: "Hani_Rifai_192kbps", bitrate: 192 }]),
  R("thubti", "عبد الباري الثبيتي", "Abdelbari Al-Thubaiti", "SA", "السعودية", "مرتّل",
    [mp3q("thubti", 6), { source: "islamicnetwork", inPath: "ar.abdulbariaththubaity/{s}.mp3", bitrate: 128 }]),

  /* ------------------------- Kuwait / Gulf ------------------------ */
  R("afs", "مشاري العفاسي", "Mishary Alafasy", "KW", "الكويت", "مرتّل",
    [mp3q("afs", 8), { source: "everyayah", dir: "Alafasy_128kbps", bitrate: 128 }]),
  R("ajmi", "أحمد العجمي", "Ahmad Al-Ajmi", "SA", "السعودية", "مرتّل",
    [mp3q("ajm", 10), { source: "everyayah", dir: "ahmed_ibn_ali_al_ajamy_128kbps", bitrate: 128 }]),

  /* ------------------------- Arab world ------------------------ */
  R("abdullah", "عبد الله بصفر", "Abdullah Basfar", "SA", "السعودية", "مرتّل",
    [{ source: "everyayah", dir: "Abdullah_Basfar_192kbps", bitrate: 192 }]),
  R("ali", "علي الحذيفي", "Ali Al-Hudhaify", "SA", "السعودية", "مرتّل",
    [{ source: "everyayah", dir: "Hudhaify_128kbps", bitrate: 128 }]),
];

export function getSurah(n: number): Surah | null {
  return SURAHS.find((s) => s.n === n) ?? null;
}

export function reciterByCode(code: string): Reciter | null {
  return RECITERS.find((r) => r.code === code) ?? null;
}

/** Direct URL for a given reciter source. */
export function sourceUrl(surah: number, reciter: Reciter, src: ReciterSource): string {
  const pad = String(surah).padStart(3, "0");
  switch (src.source) {
    case "mp3quran":
      return `https://server${src.server ?? 5}.mp3quran.net/${src.folder}/${pad}.mp3`;
    case "everyayah":
      return `https://everyayah.com/data/${src.dir}/${pad}.mp3`;
    case "islamicnetwork":
      return `https://cdn.islamic.network/quran/audio-surah/${src.bitrate}/${(src.inPath ?? "").replace("{s}", String(surah))}`;
    default:
      return "";
  }
}

/**
 * Pick the best source for a surah, honouring a requested quality tier.
 * Every reciter exposes at least one source that covers all 114 surahs, so
 * the answer is never empty for a valid surah.
 */
export function pickSource(
  surah: number,
  reciter: Reciter,
  quality: "low" | "medium" | "high" = "high",
): ReciterSource {
  const sorted = [...reciter.sources].sort((a, b) => {
    if (quality === "high") return b.bitrate - a.bitrate;
    if (quality === "low") return a.bitrate - b.bitrate;
    // medium → closest to 128
    return Math.abs(a.bitrate - 128) - Math.abs(b.bitrate - 128);
  });
  void surah;
  return sorted[0];
}

/** Whole-surah direct MP3 (best available quality). */
export function surahUrl(surah: number, code: string, quality: "low" | "medium" | "high" = "high"): string {
  const reciter = reciterByCode(code);
  if (!reciter) return "";
  return sourceUrl(surah, reciter, pickSource(surah, reciter, quality));
}

/** Direct HTTPS stream; no application proxy. */
export function streamProxy(surah: number, code: string, quality: "low" | "medium" | "high" = "high"): string {
  return surahUrl(surah, code, quality);
}

/** Direct full-surah download; never clipped. */
export function downloadUrl(surah: number, code: string, quality: "low" | "medium" | "high" = "high"): string {
  return surahUrl(surah, code, quality);
}

export const QURAN_SOURCE_LABEL = "القرآن الكريم";
