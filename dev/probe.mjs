// Scratch geometry probe: run with `node dev/probe.mjs [width] [height]`.
// Prints the measured box of every element of the solve screen, plus the flex and
// grid properties that decide it. Dev-only; the shipped app never loads it.
import { openServedApp, clickPractice, closeBrowser } from '../test/harness.mjs';

const width = Number(process.argv[2] || 1440);
const height = Number(process.argv[3] || 900);
const solves = Number(process.argv[4] || 8);

const app = await openServedApp({ viewport: { width, height } });
await clickPractice(app.page);
await app.page.evaluate(n => {
    window.goal = 1000;
    for (let k = 0; k < n; ++k) {
        window.timesArray.push({
            time: '2.00', ms: 2000 + k * 7, details: "R U R' U'", index: k, case: (k % 2) ? 20 : 10,
        });
    }
    displayStats();
}, solves);

console.log(await app.page.evaluate(() => {
    const line = (s) => {
        const el = document.querySelector(s);
        if (!el) return s + ' MISSING';
        const b = el.getBoundingClientRect();
        return `${s} x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.width)} h=${Math.round(b.height)}`;
    };
    const flex = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return `${sel} MISSING`;
        const c = getComputedStyle(el);
        return `${sel} flex=${c.flex} minW=${c.minWidth} basis=${c.flexBasis} align=${c.alignSelf}`;
    };
    const shell = getComputedStyle(document.querySelector('.app-shell'));
    const times = document.getElementById('times');
    return [
        line('.app-shell'), line('.topbar'), line('#selectBtn'), line('#selInfo'),
        line('.topbar-right'), line('#themeToggle'), line('#settingsToggle'),
        line('#scramble'), line('.timer-zone'), line('#timer'), line('.goal-row'),
        line('#goal_in'), line('#resetWeightsLink'), line('.goal-note'), line('#stats'),
        line('#times'), line('footer'),
        flex('.topbar'), flex('.topbar-left'), flex('.topbar-right'), flex('#selInfo'),
        `shell height=${shell.height} rows=${shell.gridTemplateRows} cols=${shell.gridTemplateColumns}`,
        `times scrollH=${times.scrollHeight} clientH=${times.clientHeight}`,
        `page scrollH=${document.scrollingElement.scrollHeight} inner=${innerHeight}`,
    ].join('\n');
}));

await app.close();
await closeBrowser();
