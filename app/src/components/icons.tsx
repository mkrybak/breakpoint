import {
  Box,
  Cog,
  Database,
  DatabaseZap,
  Globe,
  HardDrive,
  ListOrdered,
  Monitor,
  Scale,
  Search,
  Server,
  Waves,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Box,
  Cog,
  Database,
  DatabaseZap,
  Globe,
  HardDrive,
  ListOrdered,
  Monitor,
  Scale,
  Search,
  Server,
  Waves,
  Waypoints,
  Zap,
};

/** Registry icon by lucide name; unknown names fall back to Box. */
export function ComponentIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Box;
  return <Icon className={className} aria-hidden />;
}
