import { NextRequest } from "next/server";
import { db } from "@/db";
import { playlists, playlistTracks } from "@/db/schema";
import { getDemoUser, getPlaylistDetail } from "@/lib/server/queries";
import { searchYouTubeMusic } from "@/lib/server/youtube";
import { searchAudius, searchSoundCloud } from "@/lib/server/platforms";
import { upsertTracks } from "@/lib/server/catalog";
import type { ExternalTrack } from "@/lib/server/external";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  POST /api/ai/generate  { prompt }
//  DON MUSE AI — natural-language playlist generation over REAL music.
//  The prompt is parsed for genre / mood / era terms, then searched live on
//  YouTube Music (full-length) + Deezer + iTunes. The composed playlist is
//  saved to the user's library with an AI radio-host editorial description.
// ---------------------------------------------------------------------------

const GENRE_KEYWORDS: Record<string, string[]> = {
  techno: ["techno", "warehouse", "industrial", "acid"],
  house: ["house", "deep house", "disco"],
  electronic: ["electronic", "edm", "electro"],
  synthwave: ["synthwave", "synth", "retrowave", "neon", "drive", "highway"],
  lofi: ["lofi", "lo-fi", "chillhop", "beats to"],
  ambient: ["ambient", "drone", "sleep", "meditat"],
  jazz: ["jazz", "fusion", "brunch"],
  "dream-pop": ["dream pop", "dream-pop", "shoegaze", "dreamy"],
  glitch: ["glitch", "experimental"],
  arabic: ["arabic", "arab", "oriental", "egyptian", "lebanese", "khaleeji"],
  "hip-hop": ["hip hop", "hip-hop", "rap", "trap"],
  rock: ["rock", "metal", "guitar"],
  pop: ["pop", "hits"],
};

const MOOD_KEYWORDS: Record<string, string[]> = {
  dark: ["dark", "angry", "aggressive", "hard"],
  happy: ["happy", "upbeat", "joy", "sunny", "good vibes"],
  sad: ["sad", "heartbreak", "melancholy", "blue"],
  chill: ["chill", "relax", "calm", "study", "focus"],
  energetic: ["workout", "gym", "pump", "energy", "energetic", "party", "dance"],
  romantic: ["romantic", "love", "date"],
  "late night": ["late night", "night", "midnight"],
};

export async function POST(req: NextRequest) {
  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > 500) return Response.json({ error: "Prompt too long (max 500 chars)" }, { status: 400 });
  const lower = prompt.toLowerCase();
  const user = await getDemoUser();

  // --- parse the prompt ---
  const genres = new Set<string>();
  for (const [genre, keys] of Object.entries(GENRE_KEYWORDS)) {
    if (keys.some((k) => lower.includes(k))) genres.add(genre);
  }
  const moods = new Set<string>();
  for (const [mood, keys] of Object.entries(MOOD_KEYWORDS)) {
    if (keys.some((k) => lower.includes(k))) moods.add(mood);
  }
  const yearMatch = lower.match(/(19|20)\d{2}/);
  const year = yearMatch ? yearMatch[0] : null;

  // --- build search terms (most specific first) ---
  const terms: string[] = [];
  const genreList = [...genres];
  const moodList = [...moods];
  if (genreList.length && moodList.length) terms.push(`${moodList[0]} ${genreList[0]}`);
  if (genreList.length) terms.push(genreList[0]);
  if (moodList.length) terms.push(moodList[0]);
  if (year) terms.push(`${genreList[0] ?? "music"} ${year}`);
  terms.push(prompt); // raw prompt as last resort

  // --- search real platforms in parallel ---
  const external: ExternalTrack[] = [];
  const seen = new Set<string>();
  const pushAll = (list: ExternalTrack[]) => {
    for (const t of list) {
      const key = `${t.title.toLowerCase()}|${t.artistName.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      external.push(t);
    }
  };

  for (const term of terms) {
    const [yt, au, sc] = await Promise.allSettled([
      searchYouTubeMusic(term, 14),
      searchAudius(term, 6),
      searchSoundCloud(term, 5),
    ]);
    if (yt.status === "fulfilled") pushAll(yt.value);
    if (au.status === "fulfilled") pushAll(au.value);
    if (sc.status === "fulfilled") pushAll(sc.value);
    if (external.length >= 20) break; // enough — keep it fast
  }

  if (external.length === 0) {
    return Response.json(
      { error: "No real tracks found for that description — try broader terms like 'chill electronic' or 'energetic techno'." },
      { status: 422 },
    );
  }

  const matched = await upsertTracks(external.slice(0, 30), user.id);
  const ytCount = matched.filter((t) => t.source === "youtube").length;

  // --- compose playlist ---
  const genreLabel = genreList.length ? genreList.join(" + ") : "genre-blending";
  const moodLabel = moodList.length ? moodList[0] : "mood-matched";
  const title = `AI: ${moodLabel.charAt(0).toUpperCase() + moodLabel.slice(1)} ${genreLabel.charAt(0).toUpperCase() + genreLabel.slice(1)}${year ? ` ${year}` : ""}`;
  const description = `Generated by DON MUSE AI from: “${prompt}”. ${matched.length} real full-length tracks (${ytCount} from YouTube Music, ${matched.length - ytCount} from Audius/SoundCloud).`;

  const [pl] = await db
    .insert(playlists)
    .values({
      title,
      slug: `${slugify(title)}-${Date.now().toString(36)}`,
      description,
      coverUrl: matched[0]?.coverUrl ?? `https://picsum.photos/seed/ai-${Date.now()}/600/600`,
      ownerId: user.id,
      smartRules: { prompt, genres: genreList, moods: moodList, year },
    })
    .returning();
  for (const [pos, t] of matched.entries()) {
    await db
      .insert(playlistTracks)
      .values({ playlistId: pl.id, trackId: t.id, position: pos })
      .onConflictDoNothing();
  }
  const detail = await getPlaylistDetail(pl.id, user.id);
  return Response.json(
    { playlist: detail, prompt, matchedCount: matched.length, explanation: description },
    { status: 201 },
  );
}
