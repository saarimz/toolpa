import { SessionClient } from "@/app/sessions/[id]/client";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionClient sessionId={id} />;
}

export const metadata = { title: "Session | ai-daw-tools" };
