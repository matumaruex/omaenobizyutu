import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "tests/portable",
  webServer: {
    command:
      "python -m http.server 3001 --bind 127.0.0.1 --directory artifacts",
    url: "http://127.0.0.1:3001/yohaku-demo.html",
    reuseExistingServer: false,
  },
});
