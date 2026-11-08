// Dev-only: renders the app at desktop and phone sizes and writes PNGs, so a change to
// the interface can be looked at rather than reasoned about. Not part of the shipped app.
//
//   node dev/screenshots.mjs [outdir]
//
// Needs the browser: npm run browser:install

import path from 'node:path';
import { chromium } from 'playwright';

import { serveRepo } from '../test/server.mjs';

const OUT = process.argv[2] || '/tmp/oll-shots';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function shoot(browser, url, name, viewport, actions = []) {
    const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        hasTouch: viewport.width < 500,
        isMobile: viewport.width < 500,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text}`); });

    await page.goto(url);
    await page.waitForTimeout(150);
    for (const action of actions)
        await action(page);

    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
    if (errors.length)
        console.log(`${name}: ${errors.join('; ')}`);
    await context.close();
}

async function main() {
    const server = await serveRepo({ prefix: '/oll/' });
    const browser = await chromium.launch();
    const url = server.url;

    const toPractice = async page => { await page.click('#practiceButton'); };
    const selectSome = async page => {
        await page.click('#cases_selection td:has(b:text-is("Squares"))');
        await page.click('#itemTd1');
    };
    const fillGoal = async page => {
        await page.fill('#goal_in', '1000');
        await page.keyboard.press('Tab');
        for (let k = 0; k < 3; ++k) {
            await page.evaluate(() => {
                document.getElementById('timer').innerHTML = '2.00';
                appendStats();
            });
            await page.evaluate(() => showScramble());
        }
    };
    const manyTimes = async page => {
        // A practice session worth scrolling through: several Cases, each with a few solves.
        await page.evaluate(() => {
            window.goal = 1000;
            const cases = window.selCases.length ? window.selCases : [10, 11, 12, 20, 31, 32, 40, 50];
            for (let k = 0; k < 60; ++k) {
                window.timesArray.push({
                    time: '2.00', ms: 1600 + k * 9, details: "R U R' U'", index: k,
                    case: cases[k % cases.length],
                });
            }
            displayStats();
        });
    };
    const openSettings = async page => { await page.click('#settingsToggle'); };
    const dark = async page => {
        await page.click('#practiceButton'); // the theme switch lives on the solve screen
        await page.click('#themeToggle');
    };
    const toRecap = async page => { await page.click('#recapButton'); };
    const peek = async page => {
        await page.evaluate(i => displayBox(null, i), 31);
    };

    await shoot(browser, url, 'desktop-selection', DESKTOP, [selectSome]);
    await shoot(browser, url, 'desktop-practice', DESKTOP, [toPractice, fillGoal]);
    await shoot(browser, url, 'desktop-settings', DESKTOP, [toPractice, openSettings]);
    await shoot(browser, url, 'desktop-dark-peek', DESKTOP, [dark, peek]);
    await shoot(browser, url, 'desktop-dark-practice', DESKTOP, [dark, fillGoal]);

    await shoot(browser, url, 'phone-selection', PHONE, [selectSome]);
    await shoot(browser, url, 'phone-selection-scroll', PHONE, [selectSome, async page => {
        await page.evaluate(() => window.scrollTo(0, 700));
    }]);
    await shoot(browser, url, 'phone-landscape-practice', { width: 844, height: 390 }, [toPractice, manyTimes]);
    await shoot(browser, url, 'phone-selection-bottom', PHONE, [async page => {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }]);
    await shoot(browser, url, 'phone-practice', PHONE, [toPractice, fillGoal]);
    await shoot(browser, url, 'phone-settings', PHONE, [toPractice, openSettings]);
    await shoot(browser, url, 'phone-dark', PHONE, [dark]);
    await shoot(browser, url, 'phone-recap', PHONE, [toRecap, fillGoal]);
    await shoot(browser, url, 'small-phone-selection', { width: 320, height: 568 }, [selectSome]);
    await shoot(browser, url, 'tablet-selection', { width: 820, height: 1180 }, [selectSome]);
    await shoot(browser, url, 'phone-peek', PHONE, [toPractice, peek]);

    // Wide and short windows: the shell fills the window, and a topbar that runs
    // short drops only the status pill.
    await shoot(browser, url, 'wide-desktop-selection', { width: 1920, height: 1000 }, [selectSome]);
    await shoot(browser, url, 'desktop-practice-long', DESKTOP, [toPractice, manyTimes]);
    await shoot(browser, url, 'wide-desktop-practice', { width: 1920, height: 1000 }, [toPractice, manyTimes]);
    await shoot(browser, url, 'narrow-desktop-practice', { width: 520, height: 800 }, [toPractice, fillGoal]);

    await browser.close();
    await server.close();
    console.log(`wrote shots to ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
