import { getDemoUser } from "@/lib/server/queries";
import { buildHomeSections } from "@/app/api/home/route";
import { HeroCarousel } from "@/components/sections/HeroCarousel";
import { HomeSections } from "@/components/sections/HomeSections";
import type { TrackDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  Home — personalized real music. Sections are built from the user's own
//  listening history ("Because you listened to …", "Your top genre") plus
//  live YouTube Music / Audius trending. Everything is full-length.
// ---------------------------------------------------------------------------
export default async function HomePage() {
  const user = await getDemoUser();
  const sections = await buildHomeSections(user.id);
  const hero = (sections.find((s) => s.id === "hero")?.items ?? []) as TrackDTO[];

  return (
    <div className="p-4 md:p-6">
      <HeroCarousel tracks={hero} />
      <HomeSections sections={sections.filter((s) => s.id !== "hero")} />
    </div>
  );
}
