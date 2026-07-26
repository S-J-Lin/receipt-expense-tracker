import { redirect } from "next/navigation";

export default async function ProductGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  redirect(`/items?group=${encodeURIComponent(group)}&range=6m`);
}
