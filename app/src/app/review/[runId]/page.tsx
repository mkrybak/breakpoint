import { ReviewScreen } from "@/components/review/ReviewScreen";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <ReviewScreen runId={runId} />;
}
