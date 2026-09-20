import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });
await p.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await p.screenshot({ path: "tmp-login.png", fullPage: false });
// pega cor computada de body pra ter certeza
const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const html = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-bg"));
console.log("body bg =", bg, "| --color-bg =", html);
await b.close();
