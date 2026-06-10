import { SocialFeed } from "@/components/SocialFeed";

export default function SocialPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Match Buzz 📣</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Fan reactions to every goal and result — tying the real World Cup to the Global Football Cup race.
        </p>
      </div>
      <SocialFeed />
    </div>
  );
}
