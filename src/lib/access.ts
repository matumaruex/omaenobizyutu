// Guest builds can generate exhibitions but cannot read shared trial records.
// The branch check also closes access if its environment setting is omitted.
export function inspectionAvailable() {
  return (
    process.env.MUSEUM_GUEST_MODE !== "1" &&
    process.env.VERCEL_GIT_COMMIT_REF !== "codex/museum-family-test"
  );
}
