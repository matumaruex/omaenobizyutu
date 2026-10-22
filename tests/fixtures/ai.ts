import seed from "../../src/data/catalog-seed.json";
import { retrieveByTags } from "../../src/lib/ai/tag-candidates";
import type { TagProfile } from "../../src/lib/ai/tag-profile";
export const tagOutput = (): TagProfile => ({
  tags: ["喜び", "不安"],
  negatedTags: [],
});
export const candidateWorks = retrieveByTags(
  "嬉しいけれど不安もある",
  tagOutput(),
  seed.selection,
).chosen;
