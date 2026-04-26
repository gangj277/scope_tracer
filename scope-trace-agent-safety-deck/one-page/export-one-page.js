const path = require("path");
const { chromium } = require("playwright");

async function main() {
  const root = process.cwd();
  const html = path.resolve(root, "scope-trace-agent-safety-deck/one-page/scope-trace-one-page.html");
  const outPng = path.resolve(root, "scope-trace-agent-safety-deck/one-page/scope-trace-one-page.png");
  const outPdf = path.resolve(root, "scope-trace-agent-safety-deck/one-page/scope-trace-one-page.pdf");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`file://${html}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: outPng, fullPage: false });
  await page.pdf({
    path: outPdf,
    width: "1920px",
    height: "1080px",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" }
  });
  await browser.close();
  console.log(outPng);
  console.log(outPdf);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
