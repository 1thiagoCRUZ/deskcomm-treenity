import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://localhost:3000/login");
await p.fill('input[type="email"]', "admin@deskcomm.local");
await p.fill('input[type="password"]', "DevLocal123!");
await p.click('button[type="submit"]');
await p.waitForURL(/\/app/, { timeout: 30000 });
await p.goto("http://localhost:3000/app/settings/marca", { waitUntil: "networkidle" });
await p.screenshot({ path: "tmp-marca.png", fullPage: false });
// mede widths
const w = await p.evaluate(() => {
  const form = document.querySelector("form");
  const main = document.querySelector("main");
  return {
    form: form?.getBoundingClientRect().width,
    main: main?.getBoundingClientRect().width,
    formParent: form?.parentElement?.getBoundingClientRect().width,
  };
});
console.log(JSON.stringify(w));
await b.close();
