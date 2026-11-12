import { onlineJson } from "@/lib/platform/native";

/** Public upstream data only. Android uses OkHttp (no CORS proxy/backend). */
export async function onlineFetch(url: string, init?: RequestInit): Promise<Response> {
  if (init?.method && init.method !== "GET") return fetch(url, init);
  try {
    const data = await onlineJson<unknown>(url);
    return Response.json(data);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("تعذّر الاتصال بالمصدر");
  }
}

export function networkMessage(error: unknown): string {
  if (!navigator.onLine) return "أنت غير متصل. الملفات المحمّلة وموسيقاي تعمل دون إنترنت.";
  const message = error instanceof Error ? error.message : String(error);
  if (/403|429|sign in|captcha|restricted|unavailable/i.test(message)) return "المصدر رفض الطلب أو يطلب تسجيل الدخول/تحققًا. جرّب مصدرًا آخر؛ لا يمكن تجاوز الحماية أو DRM.";
  if (/timeout|مهلة/i.test(message)) return "انتهت مهلة المصدر. تحقق من الاتصال ثم أعد المحاولة.";
  return message || "المصدر غير متاح حاليًا. أعد المحاولة أو جرّب رابطًا مباشرًا.";
}
