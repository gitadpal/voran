import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { DataSourceDescriptor } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = resolve(__dirname, "sources");

let cachedRegistry: DataSourceDescriptor[] | null = null;

export function loadRegistry(): DataSourceDescriptor[] {
  if (cachedRegistry) return cachedRegistry;

  const files = readdirSync(SOURCES_DIR).filter((f) => f.endsWith(".json"));
  cachedRegistry = files.map((f) => {
    const content = readFileSync(resolve(SOURCES_DIR, f), "utf-8");
    return JSON.parse(content) as DataSourceDescriptor;
  });

  return cachedRegistry;
}

export function findSourceById(id: string): DataSourceDescriptor | undefined {
  return loadRegistry().find((s) => s.id === id);
}

export function findSourcesByCategory(category: DataSourceDescriptor["category"]): DataSourceDescriptor[] {
  return loadRegistry().filter((s) => s.category === category);
}
