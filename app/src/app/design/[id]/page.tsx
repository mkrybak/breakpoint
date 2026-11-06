import { DesignWorkspace } from "@/components/layout/DesignWorkspace";

export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DesignWorkspace designId={id} />;
}
