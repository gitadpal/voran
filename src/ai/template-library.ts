import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { SavedTemplate } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "../../templates");

export function loadTemplates(): SavedTemplate[] {
  if (!existsSync(TEMPLATES_DIR)) return [];
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const content = readFileSync(resolve(TEMPLATES_DIR, f), "utf-8");
    return JSON.parse(content) as SavedTemplate;
  });
}

export function searchTemplates(query: string): SavedTemplate[] {
  const templates = loadTemplates();
  const q = query.toLowerCase();
  return templates.filter((t) => {
    const searchable = [t.id, t.description, ...t.keywords].join(" ").toLowerCase();
    return searchable.includes(q);
  });
}

export function saveTemplate(saved: SavedTemplate): void {
  if (!existsSync(TEMPLATES_DIR)) {
    mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
  const filePath = resolve(TEMPLATES_DIR, `${saved.id}.json`);
  writeFileSync(filePath, JSON.stringify(saved, null, 2) + "\n");
}
