import { DesignCanvas } from "@/components/canvas/DesignCanvas";

export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DesignCanvas designId={id} />;
}
