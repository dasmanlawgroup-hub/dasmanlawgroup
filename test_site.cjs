const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { JSDOM, VirtualConsole } = require('./test-tools/node_modules/jsdom');
const root = path.join(__dirname, 'legalacct-github');
const errors = [];
const requests = [];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  requests.push(req.url);
  if (!req.url.startsWith('/test-repo/')) { res.writeHead(404); res.end(); return; }
  const rel = decodeURIComponent(req.url.split('?')[0].slice('/test-repo/'.length)) || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/test-repo/`;
  const vc = new VirtualConsole();
  vc.on('jsdomError', err => errors.push(err.message));
  let apiRequests = 0;
  const dom = await JSDOM.fromURL(url, {
    runScripts: 'dangerously', resources: 'usable', virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async () => { apiRequests++; throw new Error('No external network in this test'); };
      w.alert = () => {};
      w.confirm = () => true;
      w.crypto.randomUUID = randomUUID;
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLAnchorElement.prototype.click = function () { w.lastDownload = this.download; };
      w.URL.createObjectURL = blob => { w.lastBlob = blob; return 'blob:local-test'; };
      w.URL.revokeObjectURL = () => {};
      w.open = () => ({ document: { open() {}, write(html) { w.lastPrintedHtml = html; }, close() {} } });
    }
  });
  const w = dom.window;
  if (w.document.readyState !== 'complete') await new Promise(resolve => w.addEventListener('load', resolve, { once: true }));
  const el = id => w.document.getElementById(id);
  const set = (id, value) => { el(id).value = value; };
  const submit = id => el(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const readBlob = blob => new Promise((resolve, reject) => { const r = new w.FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsText(blob); });
  const importData = async obj => {
    const file = new w.File([JSON.stringify(obj)], 'test.json', { type: 'application/json' });
    Object.defineProperty(el('importFile'), 'files', { configurable: true, value: [file] });
    el('importFile').dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(50);
  };

  assert.equal(w.document.title, 'نظام حسابات مكتب المحاماة');
  assert.equal(el('officeNameDisplay').textContent, 'مكتب المحاماة');
  set('loginUser', 'admin'); set('loginPass', 'wrong'); submit('loginForm');
  await sleep(10);
  assert.ok(el('loginError').textContent.includes('غير صحيحة'));
  set('loginPass', '1234'); submit('loginForm'); await sleep(10);
  assert.equal(el('loginOverlay').style.display, 'none');
  console.log('PASS: wrong password rejected; initial local login accepted');

  set('client', 'موكل تجريبي'); set('opponent', 'خصم تجريبي'); set('caseNo', 'TEST-01');
  set('caseType', 'مدني'); set('contractDate', '2026-11-01'); set('fees', '1000');
  set('advance', '100'); set('paymentDate', '2026-11-01'); submit('caseForm');
  assert.equal(w.eval('data.length'), 1);
  assert.equal(w.eval('balance(data[0])'), 900);
  assert.ok(el('caseBody').textContent.includes('موكل تجريبي'));
  w.openPayment(); set('payAmount', '200'); set('payDate', '2026-11-05'); submit('paymentForm');
  assert.equal(w.eval('balance(data[0])'), 700);
  console.log('PASS: case creation and payment preserved');

  w.openTransaction('receipt'); set('txDesc', 'سند تجريبي'); set('txAmount', '150');
  set('txDate', '2026-11-06'); submit('txForm');
  assert.equal(w.eval('transactions.length'), 1);
  assert.equal(w.eval('balance(data[0])'), 550);
  assert.equal(w.getAccountBalance('cash'), 150);
  w.openTransferModal(); set('transferAmount', '50'); set('transferDate', '2026-11-07'); submit('transferForm');
  assert.equal(w.getAccountBalance('cash'), 100);
  assert.equal(w.getAccountBalance('bank'), 50);
  console.log('PASS: receipt and balanced cash-to-bank transfer');

  w.openEmployeeModal(); set('employeeName', 'موظف تجريبي'); set('employeeJob', 'محاسب');
  set('employeeSalary', '20'); submit('employeeForm');
  assert.equal(w.eval('employees.length'), 1);
  w.openSalaryPayment(w.eval('employees[0].id')); set('txDate', '2026-11-08'); submit('txForm');
  assert.equal(w.getAccountBalance('cash'), 80);
  assert.ok(el('employeeList').textContent.includes('موظف تجريبي'));
  console.log('PASS: employee and outgoing salary transaction');

  w.openOfficeSettings(); set('officeName', 'مكتب الاختبار'); set('officePhone', '00000000'); submit('officeForm');
  assert.equal(el('officeNameDisplay').textContent, 'مكتب الاختبار');
  set('reportMonth', '2026-11'); w.renderMonthlyReport();
  assert.ok(el('monthlyReportBody').textContent.includes('التقرير المالي'));
  w.printMonthlyReport(); assert.ok(w.lastPrintedHtml.includes('مكتب الاختبار'));
  w.printTransaction(w.eval('transactions[0].id'));
  assert.ok(w.lastPrintedHtml.includes(url + 'assets/accountant-signature.png'));
  w.printCase(w.eval('data[0].id')); assert.ok(w.lastPrintedHtml.includes('TEST-01'));
  w.exportMonthlyReportExcel(); assert.ok(w.lastDownload.endsWith('.xls'));
  assert.ok((await readBlob(w.lastBlob)).includes('التقرير المالي الشهري'));
  console.log('PASS: office, report, printable HTML and Excel export generation');

  el('exportBtn').onclick();
  const backup = JSON.parse(await readBlob(w.lastBlob));
  assert.equal(backup.office.name, 'مكتب الاختبار');
  assert.equal(backup.cases.length, 1);
  assert.equal(backup.employees.length, 1);
  assert.equal(backup.transactions.length, 4);
  assert.equal(backup.auth, undefined);
  w.eval('data=[];transactions=[];employees=[];office={name:"فارغ"};save()');
  await importData(backup);
  assert.equal(w.eval('data.length'), 1);
  assert.equal(w.eval('transactions.length'), 4);
  assert.equal(el('officeNameDisplay').textContent, 'مكتب الاختبار');
  await importData({ cases: backup.cases, transactions: backup.transactions, employees: backup.employees });
  assert.equal(w.eval('data.length'), 1);
  console.log('PASS: full JSON backup, restore and legacy backup compatibility');

  const keys = Object.keys(w.localStorage);
  assert.ok(keys.every(key => key.startsWith('lawOfficeStandalone:/test-repo/:')));
  w.openSettings(); set('newUser', 'tester'); set('oldPass', '1234'); set('newPass', 'newpass'); set('confirmPass', 'newpass'); submit('settingsForm');
  w.logout(); await sleep(10);
  set('loginUser', 'tester'); set('loginPass', 'newpass'); submit('loginForm'); await sleep(10);
  assert.equal(el('loginOverlay').style.display, 'none');
  await w.cloudLogin('test', 'test'); await w.hydrateCloud(); await w.syncCloud();
  assert.equal(apiRequests, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: scoped storage, changed password and no cloud/API requests');

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  for (const node of w.document.querySelectorAll('script[src],link[href]')) {
    const value = node.getAttribute('src') || node.getAttribute('href');
    assert.ok(value.startsWith('./'), `Non-relative asset: ${value}`);
    assert.ok(fs.existsSync(path.join(root, value)), `Missing asset: ${value}`);
  }
  assert.ok(fs.existsSync(path.join(root, manifest.icons[0].src)));
  console.log('PASS: referenced files exist and resolve inside the repository subpath');
  console.log('All local DOM checks passed. No live-site data was accessed or changed.');
  dom.window.close(); server.close();
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
