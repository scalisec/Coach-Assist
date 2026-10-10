// End-to-end check in a real browser (Chromium via Playwright) at phone size.
// Run: npm run test:ui   (screenshots go to SHOTS dir if set)

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SHOTS = process.env.SHOTS;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); };
const step = (msg) => console.log(`✓ ${msg}`);

try {
  await page.goto(base);
  await page.getByText('CoachAssist').first().waitFor();
  await shot('01-welcome');
  await page.click('[data-test=try-sample]');
  await page.waitForSelector('[data-test=team-title]');
  assert.equal(await page.textContent('[data-test=team-title]'), 'Expos');
  await shot('02-home');
  step('welcome → sample team → home');

  await page.click('[data-test=build-lineup]');
  await page.waitForSelector('[data-test=opponent]');
  await page.selectOption('[data-test=opponent]', 'Rockies');
  assert.match(await page.textContent('[data-test=here-status]'), /12 of 12 here · 2 sit each inning/);
  await shot('03-setup');
  await page.click('[data-test=generate]');
  await page.waitForSelector('[data-test=fairplay-ok]');
  const rows = await page.locator('[data-test=grid] tbody tr').count();
  assert.equal(rows, 12);
  await shot('04-lineup');
  step('game setup with opponent dropdown → generate → fair play ✓, 12 batters');

  // edit: bench the first batter in inning 1 by swapping with a sitter, then undo
  await page.click('[data-test=edit]');
  const firstCell = page.locator('[data-test=grid] tbody tr').first().locator('button.cell').first();
  const before = (await firstCell.textContent()).trim();
  await firstCell.click();
  await page.waitForSelector('dialog.sheet[open]');
  await shot('05-cell-sheet');
  const target = before === 'SIT' ? page.locator('dialog .pos-btn:not(.current)').first() : page.locator('dialog .pos-btn.sit').first();
  await target.click();
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  const after = (await page.locator('[data-test=grid] tbody tr').first().locator('button.cell').first().textContent()).trim();
  assert.notEqual(after, before, 'cell changed');
  await shot('06-after-edit');
  await page.click('[data-test=undo]');
  const undone = (await page.locator('[data-test=grid] tbody tr').first().locator('button.cell').first().textContent()).trim();
  assert.equal(undone, before, 'undo restores the cell');
  await page.waitForSelector('[data-test=fairplay-ok]');
  step('edit a cell → changed; undo → restored and fair play ✓');

  // force a 4.1 violation: find a player who sits in inning 2, make them sit inning 1 too
  const v = await page.evaluate(() => {
    const trs = [...document.querySelectorAll('[data-test=grid] tbody tr')];
    for (let r = 0; r < trs.length; r++) {
      const cells = [...trs[r].querySelectorAll('.cell')].map((c) => c.textContent.trim());
      if (cells[1] === 'SIT' && cells[0] !== 'SIT') return r;
    }
    return -1;
  });
  if (v >= 0) {
    await page.locator('[data-test=grid] tbody tr').nth(v).locator('button.cell').first().click();
    await page.locator('dialog .pos-btn.sit').first().click();
    await page.waitForSelector('[data-test=fairplay-bad]');
    assert.match(await page.textContent('[data-test=fairplay-bad]'), /sits innings 1 and 2 in a row/);
    await shot('07-violation');
    await page.click('[data-test=fix]');
    await page.waitForSelector('[data-test=fairplay-ok]');
    step('back-to-back sit is flagged in plain words; Fix for me clears it');
  }

  // lock a cell then shuffle: the locked cell stays
  const cell = page.locator('[data-test=grid] tbody tr').nth(2).locator('button.cell').nth(3);
  const lockedVal = (await cell.textContent()).trim();
  await cell.click();
  await page.click('dialog [data-test=lock]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  for (let i = 0; i < 3; i++) await page.click('[data-test=shuffle]');
  assert.equal((await page.locator('[data-test=grid] tbody tr').nth(2).locator('.cell').nth(3).textContent()).trim().replace(/\s/g, ''), lockedVal);
  step('lock a cell → shuffle three times → it stays');

  // game-day change: a player leaves after inning 3
  await page.click('[data-test=gameday]');
  await page.locator('dialog .segmented button', { hasText: 'Leaving early' }).click();
  await page.click('dialog [data-test=apply-change]');
  await page.waitForSelector('dialog.sheet', { state: 'detached' });
  await page.waitForSelector('[data-test=fairplay-ok]');
  await shot('08-after-leave');
  step('player leaves early → rest of game rebuilt, still fair play ✓');

  await page.click('text=Player summary');
  await page.waitForSelector('table.summary');
  assert.equal(await page.locator('table.summary tbody tr').count(), 12);
  await shot('09-summary');
  step('player summary');

  // score sheet PDF: built on the device from the official form
  await page.goBack();
  await page.waitForSelector('[data-test=to-export]');
  await page.click('[data-test=to-export]');
  await page.waitForSelector('[data-test=pdf-status][data-ready=true]', { timeout: 20000 });
  await shot('09b-export');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-test=pdf-download]')]);
  const pdfPath = await download.path();
  const head = fs.readFileSync(pdfPath).subarray(0, 5).toString();
  assert.equal(head, '%PDF-');
  assert.match(download.suggestedFilename(), /^Expos-vs-Rockies-Game1-\d{4}-\d{2}-\d{2}\.pdf$/);
  if (SHOTS) fs.copyFileSync(pdfPath, path.join(SHOTS, 'scoresheet.pdf'));
  step(`score sheet PDF downloads (${download.suggestedFilename()})`);

  // saved data survives a reload
  await page.goto(`${base}#/saved`);
  await page.reload();
  await page.waitForSelector('text=Lineups');
  await shot('10-saved');
  step('saved games persist after reload');

  // roster: add a player
  await page.goto(`${base}#/roster`);
  await page.click('[data-test=add-player]');
  await page.fill('[data-test=player-first] , [data-test=player-first]', 'Ben');
  await page.fill('[data-test=player-last]', 'Adams');
  await page.fill('[data-test=player-jersey]', '11');
  await shot('11-player');
  await page.click('[data-test=player-save]');
  await page.waitForSelector('text=Ben Adams');
  await shot('12-roster');
  step('add a player to the roster');

  // roster to Excel and back
  const [xdl] = await Promise.all([page.waitForEvent('download'), page.click('[data-test=save-excel]')]);
  const xlsx = await xdl.path();
  assert.equal(fs.readFileSync(xlsx).subarray(0, 2).toString(), 'PK');
  assert.equal(xdl.suggestedFilename(), 'Expos-Roster.xlsx');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-test=import-excel]')]);
  await chooser.setFiles({ name: 'Expos-Roster.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: fs.readFileSync(xlsx) });
  await page.waitForSelector('[data-test=import-ready]');
  assert.equal(await page.textContent('[data-test=import-ready]'), '0', 'adding the same players again flags every jersey as a duplicate');
  await page.locator('.segmented button', { hasText: 'New roster' }).click();
  await page.waitForSelector('[data-test=import-ready]:text("13")');
  await shot('13-import');
  await page.click('[data-test=import-go]');
  await page.waitForSelector('text=13 players');
  step('save roster to Excel, import it back as a new roster (13 players)');

  // backup, erase, restore on a "new phone"
  await page.goto(`${base}#/settings`);
  await page.waitForSelector('text=Teams on this device');
  await shot('14-settings');
  assert.match(await page.textContent('[data-test=app-version]'), /^CoachAssist v\d+\.\d+\.\d+$/);
  await page.waitForSelector('[data-test=latest-version]:text("You have the latest version.")');
  step('Settings shows the version and confirms it is the latest');
  const [bdl] = await Promise.all([page.waitForEvent('download'), page.click('[data-test=backup]')]);
  const backupBytes = fs.readFileSync(await bdl.path());
  assert.match(bdl.suggestedFilename(), /^CoachAssist-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await page.click('text=Erase all data on this device');
  await page.locator('dialog button', { hasText: 'Erase everything' }).click();
  await page.waitForSelector('[data-test=welcome-restore]');
  const [bchooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-test=welcome-restore]')]);
  await bchooser.setFiles({ name: bdl.suggestedFilename(), mimeType: 'application/json', buffer: backupBytes });
  await page.locator('dialog button', { hasText: 'Restore' }).click();
  await page.waitForSelector('[data-test=team-title]');
  assert.equal(await page.textContent('[data-test=team-title]'), 'Expos');
  await page.goto(`${base}#/saved`);
  await page.waitForSelector('text=Lineups');
  step('back up, erase everything, restore from the first screen');

  // bottom-bar Home always works: from another tab, and again while already on Home (back to top)
  await page.goto(`${base}#/roster`);
  await page.waitForSelector('[data-test=add-player]');
  await page.click('#nav [data-nav=home]');
  await page.waitForSelector('[data-test=team-title]');
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.click('#nav [data-nav=home]');
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.goto(`${base}#/`);
  await page.waitForSelector('[data-test=team-title]');
  await page.click('#nav [data-nav=roster]');
  await page.waitForSelector('[data-test=add-player]');
  await page.click('#nav [data-nav=home]');
  await page.waitForSelector('[data-test=team-title]');
  step('bottom-bar Home: from Roster, while on Home (scrolls to top), and from the first screen');

  // league schedule: load the Excel file, games appear, next game is on Home
  const y = new Date().getFullYear() + 1;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('9U HL');
  ws.addRow(['Date', 'Day', 'Start time', 'End Time', 'Home team', 'Visitor team', 'Venue', 'Event', 'Week']);
  ws.addRow([`05/11/${y}`, 'Tue', '6:15pm', '8:30pm', 'Expos', 'Yankees', 'Kerns Park 2', 'Game', 1]);
  ws.addRow([`05/13/${y}`, 'Thu', '6:15pm', '8:30pm', 'Rockies', 'Expos', 'Kerns Park 1', 'Game', '']);
  ws.addRow([`05/14/${y}`, 'Fri', '6:15pm', '8:30pm', 'Dodgers', 'Mets', 'Sweetgrass', 'Game', '']);
  ws.addRow([`07/28/${y}`, 'Tue', '6:15pm', '8:30pm', '1st', '10th', 'Thorpe Park', 'Game 1', '']);
  const sched = Buffer.from(await wb.xlsx.writeBuffer());
  await page.click('#nav [data-nav=saved]');
  const [schooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-test=load-schedule]')]);
  await schooser.setFiles({ name: 'Schedule_9U.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: sched });
  await page.waitForSelector('[data-test=schedule-summary]');
  assert.match(await page.textContent('[data-test=schedule-summary]'), /2 games for Expos: 1 home, 1 visitor/);
  await shot('15-schedule-load');
  await page.click('[data-test=schedule-apply]');
  await page.waitForSelector('[data-test=upcoming]');
  assert.equal(await page.locator('[data-test=upcoming] a.row').count(), 2);
  await shot('16-games');
  await page.click('#nav [data-nav=home]');
  await page.waitForSelector('[data-test=next-game]');
  assert.match(await page.textContent('[data-test=next-game]'), /vs Rockies.*lineup ready/, "today's game comes first");
  assert.match(await page.textContent('[data-test=upcoming]'), /Game 1 · vs Yankees.*6:15 PM · Kerns Park 2/);
  await shot('17-home-schedule');
  step('load the league schedule from Excel → 2 games for Expos, listed under Coming up on Home');

  // build the scheduled game, then reset the lineup, then delete the game
  await page.locator('[data-test=upcoming] a.row', { hasText: 'Yankees' }).click();
  await page.waitForSelector('[data-test=opponent]');
  assert.equal(await page.inputValue('[data-test=opponent]'), 'Yankees');
  await page.click('[data-test=generate]');
  await page.waitForSelector('[data-test=fairplay-ok]');
  await page.click('[data-test=reset-lineup]');
  await page.locator('dialog button', { hasText: 'Reset lineup' }).click();
  await page.waitForSelector('[data-test=generate]');
  assert.match(await page.textContent('[data-test=generate]'), /^Generate lineup$/);
  step('Reset lineup clears it and goes back to setup (opponent kept)');
  await page.click('[data-test=generate]');
  await page.waitForSelector('[data-test=delete-game]');
  await page.click('[data-test=delete-game]');
  await page.locator('dialog button', { hasText: 'Delete game' }).click();
  await page.waitForSelector('[data-test=next-game]');
  assert.doesNotMatch(await page.textContent('main'), /Yankees/);
  step('Delete game removes it; Home moves on to the next game');

  // cancel a new game that isn't on the schedule
  await page.click('[data-test=other-game]');
  await page.waitForSelector('[data-test=cancel-game]');
  await page.click('[data-test=cancel-game]');
  await page.locator('dialog button', { hasText: 'Cancel game' }).click();
  await page.waitForSelector('[data-test=next-game]');
  await shot('18-home-after');
  assert.equal(await page.evaluate(async () => (await import('./src/app/store.js')).store.state.games.filter((g) => !g.lineup && !g.scheduleKey).length), 0);
  step('Cancel this game removes a new game before it is built');

  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log('All browser checks passed.');
} finally {
  await browser.close();
  server.close();
}
