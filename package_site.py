from pathlib import Path
from bs4 import BeautifulSoup
import json
import shutil

root = Path('/home/ubuntu/legalacct-export')
original = root / 'original'
site = root / 'legalacct-github'
(site / 'assets').mkdir(parents=True, exist_ok=True)

soup = BeautifulSoup((original / 'index.html').read_text(), 'html.parser')
styles = soup.find('style')
styles.replace_with(soup.new_tag('link', rel='stylesheet', href='./assets/styles.css'))

# Only the original application script is retained; host editor and telemetry
# scripts are not part of the stand-alone website.
app_tag = next(tag for tag in soup.find_all('script') if 'const $=id=>document.getElementById(id);' in tag.get_text())
for tag in list(soup.find_all('script')):
    if tag is app_tag:
        tag.clear()
        tag['src'] = './assets/app.js'
    else:
        tag.decompose()
for tag in list(soup.find_all('link')):
    if 'canonical' in tag.get('rel', []):
        tag.decompose()
    elif 'manifest' in tag.get('rel', []):
        tag['href'] = './manifest.webmanifest'
soup.head.append(soup.new_tag('link', rel='icon', href='./assets/icon.svg', type='image/svg+xml'))
for tag in list(soup.head.find_all('meta')):
    key = tag.get('property') or tag.get('name') or ''
    if key in {'og:url', 'og:image', 'og:image:width', 'og:image:height', 'twitter:image', 'twitter:image:width', 'twitter:image:height'}:
        tag.decompose()
    elif key == 'twitter:card':
        tag['content'] = 'summary'
bootstrap = soup.new_tag('script', src='./assets/register-sw.js')
soup.body.append(bootstrap)
(site / 'index.html').write_text(str(soup) + '\n', encoding='utf-8')
(site / 'assets' / 'styles.css').write_text((original / 'styles.css').read_text(), encoding='utf-8')

app = (original / 'app.js').read_text()
app = app.replace('const API_BASE="https://dasman-law.pages.dev";\nconst API_ENABLED=true;', '// Stand-alone GitHub Pages edition: no cloud server is bundled.\nconst API_BASE="";\nconst API_ENABLED=false;')
app = app.replace('let cloudSession=sessionStorage.getItem("lawOfficeCloudLoggedIn")==="1";', 'let cloudSession=API_ENABLED && sessionStorage.getItem("lawOfficeCloudLoggedIn")==="1";')
app = app.replace('async function cloudLogin(username,password){\n try{', 'async function cloudLogin(username,password){\n if(!API_ENABLED)return false;\n try{')
app = app.replace('async function cloudRequest(path,options={}){\n const headers', 'async function cloudRequest(path,options={}){\n if(!API_ENABLED)throw new Error("Cloud API is disabled in this local edition.");\n const headers')
app = app.replace('async function cloudLogout(){try{await cloudRequest', 'async function cloudLogout(){try{if(API_ENABLED && cloudSession)await cloudRequest')
app = app.replace('if(!cloudSession||cloudHydrating)return;', 'if(!API_ENABLED||!cloudSession||cloudHydrating)return;')
app = app.replace('async function hydrateCloud(){\n if(!cloudSession)return;', 'async function hydrateCloud(){\n if(!API_ENABLED||!cloudSession)return;')
app = app.replace('const DEFAULT_ACCOUNTANT_SIGNATURE="/manus-storage/accountant-signature_87e7133b.png";', 'const DEFAULT_ACCOUNTANT_SIGNATURE=new URL("./assets/accountant-signature.png",document.baseURI).href;')
app = 'const APP_STORAGE_SCOPE = new URL("./", document.baseURI).pathname;\nconst storageKey = key => "lawOfficeStandalone:" + APP_STORAGE_SCOPE + ":" + key;\n' + app
for key in ['lawOfficeAccounts_v1', 'lawOfficeAuth_v1', 'lawOfficeTransactions_v1', 'lawOfficeInfo_v1', 'lawOfficeEmployees_v1', 'lawOfficeLoggedIn', 'lawOfficeCloudLoggedIn', 'lawOfficeCloudCsrf']:
    app = app.replace('"' + key + '"', 'storageKey("' + key + '")')
app = app.replace('office.accountantSignature=office.accountantSignature||DEFAULT_ACCOUNTANT_SIGNATURE;', 'office.accountantSignature=office.accountantSignature||DEFAULT_ACCOUNTANT_SIGNATURE;\n if(String(office.accountantSignature).startsWith("/manus-storage/"))office.accountantSignature=DEFAULT_ACCOUNTANT_SIGNATURE;')
app = app.replace('JSON.stringify({cases:data,transactions,employees},null,2)', 'JSON.stringify({version:2,cases:data,transactions,employees,office},null,2)')
app = app.replace('employees=Array.isArray(x.employees)?x.employees:[]; save()', 'employees=Array.isArray(x.employees)?x.employees:[];\n     if(x.office && typeof x.office==="object" && !Array.isArray(x.office)){\n       office={name:String(x.office.name||"مكتب المحاماة"),address:String(x.office.address||""),phone:String(x.office.phone||""),email:String(x.office.email||""),logo:String(x.office.logo||""),accountantSignature:String(x.office.accountantSignature||DEFAULT_ACCOUNTANT_SIGNATURE)};\n       if(office.accountantSignature.startsWith("/manus-storage/"))office.accountantSignature=DEFAULT_ACCOUNTANT_SIGNATURE;\n     }\n     save()')
app = app.replace('render(); renderTransactions(); renderFinance(); renderEmployees(); renderMonthlyReport();', 'render(); renderTransactions(); renderFinance(); renderOffice(); renderEmployees(); renderMonthlyReport();')
(site / 'assets' / 'app.js').write_text(app, encoding='utf-8')
shutil.copyfile(original / 'icon.svg', site / 'assets' / 'icon.svg')
shutil.copyfile(original / 'manus-storage' / 'accountant-signature_87e7133b.png', site / 'assets' / 'accountant-signature.png')
manifest = json.loads((original / 'manifest.webmanifest').read_text())
manifest.update({'id': './', 'start_url': './', 'scope': './'})
manifest['icons'][0]['src'] = './assets/icon.svg'
(site / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
(site / '.nojekyll').write_text('')
(site / '.gitignore').write_text('.DS_Store\nThumbs.db\nnode_modules/\n.env\n.env.*\n*.log\n*backup*.json\nlaw-office-*.json\n')
print('Portable application files prepared at:', site)
