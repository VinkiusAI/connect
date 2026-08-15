const { spawn } = require('node:child_process');
const { chromium } = require('C:/Users/renat/Projects/VinkiusAutonomous/site/node_modules/playwright');

const cwd = __dirname;
const port = 4328;
const url = `http://127.0.0.1:${port}/pt/getting-started/introduction`;
const server = spawn(
  process.execPath,
  ['./node_modules/astro/bin/astro.mjs', 'preview', '--host', '127.0.0.1', '--port', String(port)],
  { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(150);
  }
  throw new Error('Astro preview did not become ready.');
}

(async () => {
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1706, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const result = await page.evaluate(() => {
      const selectors = {
        header: 'header.header',
        brand: '.vk-header__brand',
        mainFrame: '.main-frame',
        twoColumn: '.main-frame > div',
        mainPane: '.main-pane',
        main: '.main-pane > main',
        sidebar: '.sidebar-pane',
        sidebarContent: '.sidebar-content',
        sidebarLabel: '.sidebar-content .top-level > li:first-child .group-label > .large',
        introPanel: 'main > .content-panel:first-of-type',
        intro: '.vk-page-intro',
        introLabel: '.vk-page-intro__eyebrow',
        bodyPanel: 'main > .content-panel + .content-panel',
        tocColumn: '.right-sidebar',
        tocPanel: '.right-sidebar-panel',
        tocNav: 'starlight-toc nav',
        tocLabel: 'starlight-toc nav > h2#starlight__on-this-page',
        tocList: 'starlight-toc nav > ul',
        tocFirstLink: 'starlight-toc nav > ul > li:first-child > a',
      };
      const data = {};
      for (const [name, selector] of Object.entries(selectors)) {
        const element = document.querySelector(selector);
        if (!element) {
          data[name] = null;
          continue;
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        data[name] = {
          x: Number(rect.x.toFixed(3)),
          y: Number(rect.y.toFixed(3)),
          width: Number(rect.width.toFixed(3)),
          height: Number(rect.height.toFixed(3)),
          centerY: Number((rect.y + rect.height / 2).toFixed(3)),
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          paddingTop: style.paddingTop,
          paddingInlineStart: style.paddingInlineStart,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
        };
      }
      return {
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        rootFont: getComputedStyle(document.documentElement).fontSize,
        data,
        labelTopDelta: {
          sidebarVsIntro: Number((data.sidebarLabel.y - data.introLabel.y).toFixed(3)),
          tocVsIntro: Number((data.tocLabel.y - data.introLabel.y).toFixed(3)),
        },
        labelCenterDelta: {
          sidebarVsIntro: Number((data.sidebarLabel.centerY - data.introLabel.centerY).toFixed(3)),
          tocVsIntro: Number((data.tocLabel.centerY - data.introLabel.centerY).toFixed(3)),
        },
        tocTextWidth: data.tocFirstLink.width,
        brandVsSidebarX: Number((data.brand.x - data.sidebarLabel.x).toFixed(3)),
      };
    });

    await page.screenshot({ path: './layout-audit-before.png', fullPage: false });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
