export type ComponentKind =
  | "client"
  | "lb"
  | "api_gateway"
  | "app_server"
  | "cache"
  | "db_sql"
  | "db_nosql"
  | "queue"
  | "stream"
  | "cdn"
  | "blob"
  | "search"
  | "worker";

export type ComponentCategory =
  | "entry"
  | "network"
  | "compute"
  | "storage"
  | "async";

export type ConfigField =
  | {
      key: string;
      label: string;
      type: "number";
      min: number;
      max: number;
      step: number;
      default: number;
    }
  | { key: string; label: string; type: "boolean"; default: boolean }
  | {
      key: string;
      label: string;
      type: "select";
      options: string[];
      default: string;
    };

export interface ComponentDef {
  kind: ComponentKind;
  label: string;
  category: ComponentCategory;
  /** lucide icon name — rendered by the shell, string only here */
  icon: string;
  /** node accent color, hex */
  color: string;
  /** capacity per instance; an omitted field means unlimited */
  capacity: {
    rps?: number;
    writeRps?: number;
    storageGb?: number;
    connections?: number;
  };
  latency: { baseMs: number };
  consistency: "strong" | "eventual" | "n/a";
  scaling: "horizontal" | "vertical" | "managed";
  configFields: ConfigField[];
}
