// Scratch geometry probe: run with `node dev/probe.mjs [width] [height]`.
import { openServedApp, clickPractice, closeBrowser } from '../test/harness.mjs';

const width = Number(process.argv[2] || 1440);
const height = Number(process.argv[3] || 900);

const app = await openServedApp({ viewport: { width, height } });
await clickPractice(app.page);
for (let i = 0; i < 8; i++) {
    await app.page.keyboard.press('Space');
    await app.page.waitForTimeout(120);
    await app.page.keyboard.press('Space');
    await app.page.waitForTimeout(420);
}

console.log(await app.page.evaluate(() => {
    const line = (s) => {
        const el = document.querySelector(s);
        if (!el) return s + ' MISSING';
        const b = el.getBoundingClientRect();
        return `${s} x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.width)} h=${Math.round(b.height)}`;
    };
    const shell = getComputedStyle(document.querySelector('.app-shell'));
    return [
        line('.app-shell'), line('.topbar'), line('#selInfo'), line('#selectBtn'),
        line('.topbar-right'), line('#themeToggle'), line('#settingsToggle'),
        line('#scramble'), line('.timer-zone'), line('#timer'), line('.goal-row'),
        line('#goal_in'), line('#resetWeightsLink'), line('.goal-note'), line('#stats'),
        line('#times'), line('footer'),
        (() => {
            const f = (sel) => {
                const el = document.querySelector(sel);
                const c = getComputedStyle(el);
                return `${sel} flex=${c.flex} minW=${c.minWidth} basis=${c.flexBasis} wrap=${c.flexWrap}`;
            };
            return [f('.topbar'), f('.topbar-left'), f('.topbar-right'), f('#selInfo')].join('\n');
        })(),
        `scrollH=${document.scrollingElement.scrollHeight} inner=${innerHeight}`,
        `shellMaxWidth=${shell.maxWidth} cols=${shell.gridTemplateColumns}`,
    ].join('\n');
}));

await app.close();
await closeBrowser();
