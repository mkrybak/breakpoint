import { DesignCanvas } from "@/components/canvas/DesignCanvas";
import { Palette } from "@/components/palette/Palette";

export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex h-dvh">
      <Palette />
      <main className="min-w-0 flex-1">
        <DesignCanvas designId={id} />
      </main>
    </div>
  );
}
