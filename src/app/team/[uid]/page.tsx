import { TeamProfileClient } from "@/components/team/TeamProfileClient";

export default function TeamProfilePage({ params }: { params: { uid: string } }) {
  return <TeamProfileClient uid={params.uid} />;
}
