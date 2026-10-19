import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ history: vi.fn(), reportDisplay: vi.fn() }));
vi.mock("../src/lib/usage/ledger", () => ({
  UsageLedger: class {
    history = mocks.history;
    reportDisplay = mocks.reportDisplay;
  },
}));
import { GET } from "../src/app/api/history/route";
import { POST } from "../src/app/api/history/[id]/display/route";
beforeEach(() => {
  mocks.history.mockReset();
  mocks.reportDisplay.mockReset();
});
afterEach(() => vi.restoreAllMocks());
it("rejects invalid history pages before reading storage", async () => {
  for (const query of [
    "offset=-1",
    "limit=0",
    "offset=1.1",
    "limit=51",
    "offset=1001",
  ])
    expect(
      (await GET(new Request(`https://museum.test/api/history?${query}`)))
        .status,
    ).toBe(400);
  expect(mocks.history).not.toHaveBeenCalled();
});
it("returns read-only paged history with private no-store headers", async () => {
  mocks.history.mockResolvedValue({
    calls: 0,
    entries: [],
    offset: 20,
    limit: 20,
  });
  const r = await GET(new Request("https://museum.test/api/history?offset=20"));
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(mocks.history).toHaveBeenCalledWith(20, 20);
});
it("hides raw storage failures", async () => {
  mocks.history.mockRejectedValue(Error("secret storage response"));
  const r = await GET(new Request("https://museum.test/api/history"));
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("secret");
});
const id = crypto.randomUUID();
function request(value: unknown, origin = "https://museum.test") {
  return new Request(`https://museum.test/api/history/${id}/display`, {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(value),
  });
}
it("validates image outcome reports before writing", async () => {
  expect(
    (
      await POST(request({ displayedIds: [] }, "https://other.test"), {
        params: Promise.resolve({ id }),
      })
    ).status,
  ).toBe(403);
  for (const data of [
    { displayedIds: ["aic-123", "aic-123"] },
    { displayedIds: ["invalid"] },
    { displayedIds: [], input: "unwanted" },
  ])
    expect(
      (await POST(request(data), { params: Promise.resolve({ id }) })).status,
    ).toBe(400);
  expect(mocks.reportDisplay).not.toHaveBeenCalled();
});
it("records image outcomes without making a new selection", async () => {
  mocks.reportDisplay.mockResolvedValue("OK");
  expect(
    (
      await POST(request({ displayedIds: ["aic-123"] }), {
        params: Promise.resolve({ id }),
      })
    ).status,
  ).toBe(204);
  expect(mocks.reportDisplay).toHaveBeenCalledWith(id, ["aic-123"]);
});
