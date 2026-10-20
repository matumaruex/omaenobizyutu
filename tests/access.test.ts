import { afterEach, beforeEach, expect, it, vi } from "vitest";
import seed from "../src/data/catalog-seed.json";
const reads = vi.hoisted(() => ({ history: vi.fn(), usage: vi.fn() }));
vi.mock("../src/lib/usage/ledger", () => ({
  usageConfigured: () => true,
  UsageLedger: class {
    history = reads.history;
    report = reads.usage;
  },
}));
vi.mock("../src/lib/catalog/server", () => ({ getCatalog: async () => seed }));
import { GET as historyGET } from "../src/app/api/history/route";
import { GET as usageGET } from "../src/app/api/usage/route";
import { GET as configGET } from "../src/app/api/config/route";
beforeEach(() => {
  vi.stubEnv("MUSEUM_GUEST_MODE", "");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/museum-preview");
  reads.history
    .mockReset()
    .mockResolvedValue({ entries: [{ input: "private owner record" }] });
  reads.usage.mockReset().mockResolvedValue({ calls: 3 });
});
afterEach(() => vi.unstubAllEnvs());
for (const branchOnly of [false, true])
  it(`rejects guest history and fees before reading storage (${branchOnly ? "branch guard" : "explicit setting"})`, async () => {
    if (branchOnly)
      vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/museum-family-test");
    else vi.stubEnv("MUSEUM_GUEST_MODE", "1");
    // A caller cannot opt into the owner's mode through query parameters/headers.
    const req = new Request(
      "https://family.test/api/history?MUSEUM_GUEST_MODE=0",
      { headers: { "x-role": "owner" } },
    );
    for (const response of [await historyGET(req), await usageGET()]) {
      expect(response.status).toBe(403);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toContain("private owner record");
    }
    expect(reads.history).not.toHaveBeenCalled();
    expect(reads.usage).not.toHaveBeenCalled();
    expect((await (await configGET()).json()).inspectionAvailable).toBe(false);
  });
it("keeps the owner's protected entry able to read the shared records", async () => {
  expect(
    (await historyGET(new Request("https://owner.test/api/history"))).status,
  ).toBe(200);
  expect((await usageGET()).status).toBe(200);
  expect(reads.history).toHaveBeenCalledOnce();
  expect(reads.usage).toHaveBeenCalledOnce();
  expect((await (await configGET()).json()).inspectionAvailable).toBe(true);
});
