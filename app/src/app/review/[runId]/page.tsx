import { ReviewScreen } from "@/components/review/ReviewScreen";
import { SmallScreenNotice } from "@/components/layout/SmallScreenNotice";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return (
    <div className="flex h-dvh flex-col">
      <SmallScreenNotice />
      <div className="flex min-h-0 flex-1 flex-col">
        <ReviewScreen runId={runId} />
      </div>
    </div>
  );
}
