
const $=id=>document.getElementById(id);
const API_BASE="https://dasman-law.pages.dev";
const API_ENABLED=true;
let cloudSession=sessionStorage.getItem("lawOfficeCloudLoggedIn")==="1";
let cloudCsrf=sessionStorage.getItem("lawOfficeCloudCsrf")||"";
let cloudHydrating=false;
let cloudSyncTimer=null;
const KEY="lawOfficeAccounts_v1";
const AUTH_KEY="lawOfficeAuth_v1";
let auth=JSON.parse(localStorage.getItem(AUTH_KEY)||"null");
if(!auth){auth={user:"admin",pass:"1234"};localStorage.setItem(AUTH_KEY,JSON.stringify(auth))}
function loggedIn(){return sessionStorage.getItem("lawOfficeLoggedIn")==="1"}
function showLogin(){ $("loginOverlay").style.display="flex" }
function hideLogin(){ $("loginOverlay").style.display="none" }
async function cloudLogin(username,password){
 try{
  const r=await fetch(API_BASE+"/api/auth/login",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({username,password})});
  if(!r.ok)return false;
  const j=await r.json(); cloudCsrf=j.csrfToken||""; cloudSession=!!cloudCsrf;
  if(cloudSession){sessionStorage.setItem("lawOfficeCloudLoggedIn","1");sessionStorage.setItem("lawOfficeCloudCsrf",cloudCsrf)}
  return cloudSession;
 }catch{return false}
}
async function cloudRequest(path,options={}){
 const headers=new Headers(options.headers||{}); headers.set("content-type","application/json");
 if(options.method&&options.method!=="GET")headers.set("X-CSRF-Token",cloudCsrf);
 return fetch(API_BASE+path,{...options,credentials:"include",headers});
}
async function cloudLogout(){try{await cloudRequest("/api/auth/logout",{method:"POST",body:"{}"})}catch{} cloudSession=false;cloudCsrf="";sessionStorage.removeItem("lawOfficeCloudLoggedIn");sessionStorage.removeItem("lawOfficeCloudCsrf")}
function logout(){cloudLogout();sessionStorage.removeItem("lawOfficeLoggedIn");showLogin()}
$("loginForm").addEventListener("submit",async e=>{
	 e.preventDefault();
	 const user=$("loginUser").value, pass=$("loginPass").value;
	 const cloudOk=API_ENABLED&&await cloudLogin(user,pass);
	 if(cloudOk || (user===auth.user && pass===auth.pass)){
	   sessionStorage.setItem("lawOfficeLoggedIn","1");$("loginError").textContent="";hideLogin();
	   if(cloudOk)await hydrateCloud();
	 }else {
     cloudSession=false; cloudCsrf="";
     sessionStorage.removeItem("lawOfficeCloudLoggedIn");
     sessionStorage.removeItem("lawOfficeCloudCsrf");
     $("loginError").textContent="اسم المستخدم أو كلمة السر غير صحيحة.";
   }
});
function openSettings(){
 $("newUser").value=auth.user;$("oldPass").value="";$("newPass").value="";$("confirmPass").value="";
 $("settingsError").textContent="";$("settingsModal").classList.add("show");
}
function closeSettings(){$("settingsModal").classList.remove("show")}
$("settingsForm").addEventListener("submit",e=>{
 e.preventDefault();
 if($("oldPass").value!==auth.pass){$("settingsError").textContent="كلمة السر الحالية غير صحيحة.";return}
 if(!$("newUser").value.trim()){ $("settingsError").textContent="أدخل اسم مستخدم.";return}
 if($("newPass").value!==$("confirmPass").value){$("settingsError").textContent="تأكيد كلمة السر غير مطابق.";return}
 if($("newPass").value.length<4){$("settingsError").textContent="كلمة السر يجب ألا تقل عن 4 أحرف.";return}
 auth={user:$("newUser").value.trim(),pass:$("newPass").value};
 localStorage.setItem(AUTH_KEY,JSON.stringify(auth));closeSettings();alert("تم تغيير بيانات الدخول بنجاح.");
});
if(loggedIn()){ hideLogin(); if(cloudSession) setTimeout(hydrateCloud,0); }


let data=JSON.parse(localStorage.getItem(KEY)||"[]");
const TX_KEY="lawOfficeTransactions_v1";
let transactions=JSON.parse(localStorage.getItem(TX_KEY)||"[]");
const OFFICE_KEY="lawOfficeInfo_v1";
const DEFAULT_ACCOUNTANT_SIGNATURE="/manus-storage/accountant-signature_87e7133b.png";
const EMP_KEY="lawOfficeEmployees_v1";
let employees=JSON.parse(localStorage.getItem(EMP_KEY)||"[]");
 let office=JSON.parse(localStorage.getItem(OFFICE_KEY)||'{"name":"مكتب المحاماة","address":"","phone":"","email":"","logo":""}');
 office.accountantSignature=office.accountantSignature||DEFAULT_ACCOUNTANT_SIGNATURE;
let selectedClient=null;
let editingTransferId="";
let editingTransferPairIds=[];

const num=x=>Number(x)||0;
const money=x=>num(x).toLocaleString("ar-KW-u-nu-latn",{minimumFractionDigits:3,maximumFractionDigits:3})+" د.ك";
function queueCloudSync(){
 if(!API_ENABLED||!cloudSession||cloudHydrating)return;
 clearTimeout(cloudSyncTimer); cloudSyncTimer=setTimeout(syncCloud,450);
}
async function syncCloud(){
 if(!cloudSession||cloudHydrating)return;
 try{
  const r=await cloudRequest("/api/sync",{method:"POST",body:JSON.stringify({replace:true,cases:data,transactions,employees,office})});
  if(!r.ok)console.warn("Cloud sync failed",r.status);
 }catch(err){console.warn("Cloud sync unavailable",err)}
}
function mapCloudCase(x){return {id:x.id,client:x.client_name_snapshot||x.client||"",opponent:x.opponent||"",caseNo:x.case_no||"",caseType:x.case_type||"",contractDate:x.contract_date||"",fees:num(x.fees),advance:num(x.advance),paymentDate:x.payment_date||"",payment:num(x.payment),paymentAuthority:x.payment_authority||"case_payment"}}
function mapCloudTx(x){return {id:x.id,type:x.type,desc:x.description||"",client:x.client_name_snapshot||"",employeeId:x.employee_id||"",employeeName:x.employee_name_snapshot||"",recipientType:x.recipient_type||"",recipient:x.recipient||"",amount:num(x.amount),caseId:x.case_id||"",account:x.account||"cash",date:x.transaction_date||"",notes:x.notes||"",groupId:x.group_id||""}}
async function hydrateCloud(){
 if(!cloudSession)return;
 try{
  const r=await cloudRequest("/api/sync"); if(!r.ok)return;
  const remote=await r.json(); const hasRemote=(remote.cases||[]).length||(remote.transactions||[]).length||(remote.employees||[]).length;
  if(hasRemote || (!data.length&&!transactions.length&&!employees.length)){
   cloudHydrating=true; data=(remote.cases||[]).map(mapCloudCase); transactions=(remote.transactions||[]).map(mapCloudTx); employees=remote.employees||[];
   if(remote.office)office={name:remote.office.name||"مكتب المحاماة",address:remote.office.address||"",phone:remote.office.phone||"",email:remote.office.email||"",logo:remote.office.logo_data_url||"",accountantSignature:remote.office.accountant_signature_data_url||DEFAULT_ACCOUNTANT_SIGNATURE};
   localStorage.setItem(KEY,JSON.stringify(data));localStorage.setItem(TX_KEY,JSON.stringify(transactions));localStorage.setItem(EMP_KEY,JSON.stringify(employees));localStorage.setItem(OFFICE_KEY,JSON.stringify(office));
   cloudHydrating=false;render();renderTransactions();renderFinance();renderOffice();renderEmployees();
  }else await syncCloud();
 }catch(err){cloudHydrating=false;console.warn("Cloud hydrate unavailable",err)}
}
function save(){
	 localStorage.setItem(KEY,JSON.stringify(data));
 localStorage.setItem(TX_KEY,JSON.stringify(transactions));
 localStorage.setItem(OFFICE_KEY,JSON.stringify(office));
	 localStorage.setItem(EMP_KEY,JSON.stringify(employees));
	 render(); renderTransactions(); renderFinance(); renderOffice(); renderEmployees();
	 queueCloudSync();
}
function totalPaid(c){return num(c.advance)+num(c.payment)}
function balance(c){return Math.max(0,num(c.fees)-totalPaid(c))}

function openPayment(){
 const clients=[...new Set(data.map(c=>c.client))].sort((a,b)=>a.localeCompare(b,"ar"));
 $("payClient").innerHTML=clients.length?clients.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(""):`<option value="">لا يوجد موكلون</option>`;
 $("payDate").value=new Date().toISOString().slice(0,10); updatePayCases(); $("paymentModal").classList.add("show");
}
function closePayment(){$("paymentModal").classList.remove("show")}
$("payClient").addEventListener("change",updatePayCases);
$("payCase").addEventListener("change",updatePayInfo);
function updatePayCases(){
 const cs=data.filter(c=>c.client===$("payClient").value);
 $("payCase").innerHTML=cs.map(c=>`<option value="${c.id}">${esc(c.caseNo||"بدون رقم")} — المتبقي ${money(balance(c))}</option>`).join("");
 updatePayInfo();
}
function updatePayInfo(){
 const c=data.find(x=>x.id===$("payCase").value);
 $("payInfo").innerHTML=c?`الأتعاب: <b>${money(c.fees)}</b> | المسدد حالياً: <b>${money(totalPaid(c))}</b> | المتبقي: <b>${money(balance(c))}</b>`:"";
}
$("paymentForm").addEventListener("submit",e=>{
 e.preventDefault();
 const c=data.find(x=>x.id===$("payCase").value), amount=num($("payAmount").value);
 if(!c){alert("اختر الموكل والقضية.");return}
 if(amount<=0){alert("أدخل قيمة دفعة صحيحة.");return}
 if(amount>balance(c)){if(!confirm("قيمة الدفعة أكبر من الرصيد المتبقي. هل تريد تسجيلها رغم ذلك؟"))return}
 c.payment=num(c.payment)+amount;c.paymentDate=$("payDate").value;
 $("payAmount").value="";save();updatePayCases();alert("تم تسجيل الدفعة وخصمها تلقائياً من الرصيد.");closePayment();
});


function renderOffice(){
 const logo=$("officeLogoDisplay");
 if(office.logo){logo.src=office.logo;logo.style.display="block"}else{logo.removeAttribute("src");logo.style.display="none"}
 $("officeNameDisplay").textContent=office.name||"مكتب المحاماة";
 const parts=[];
 if(office.address) parts.push("العنوان: "+esc(office.address));
 if(office.phone) parts.push("الهاتف: "+esc(office.phone));
 if(office.email) parts.push("البريد الإلكتروني: "+esc(office.email));
 $("officeDetailsDisplay").innerHTML=parts.length?parts.join(" &nbsp; | &nbsp; "):"لم تتم إضافة بيانات المكتب بعد.";
}
function openOfficeSettings(){
 $("officeName").value=office.name||"";
 $("officeAddress").value=office.address||"";
 $("officePhone").value=office.phone||"";
 $("officeEmail").value=office.email||"";
 $("officeLogo").value="";
 $("officeSignature").value="";
 $("officeModal").classList.add("show");
}
function closeOfficeSettings(){$("officeModal").classList.remove("show")}
$("officeForm").addEventListener("submit",e=>{
 e.preventDefault();
 const file=$("officeLogo").files[0];
 const signatureFile=$("officeSignature").files[0];
 const finish=(logo,accountantSignature)=>{office={
   name:$("officeName").value.trim(),address:$("officeAddress").value.trim(),
   phone:$("officePhone").value.trim(),email:$("officeEmail").value.trim(),
   logo:logo || office.logo || "",
   accountantSignature:accountantSignature || office.accountantSignature || DEFAULT_ACCOUNTANT_SIGNATURE
 };
 save(); closeOfficeSettings(); alert("تم حفظ بيانات المكتب بنجاح.");};
 const readImage=(imageFile,done,message)=>{
   if(!imageFile){done("");return}
   if(imageFile.size>2*1024*1024){alert(message);return}
   const r=new FileReader(); r.onload=()=>done(r.result); r.readAsDataURL(imageFile);
 };
 readImage(file,logo=>readImage(signatureFile,signature=>finish(logo,signature),"يفضل أن يكون حجم التوقيع أقل من 2 ميجابايت."),"يفضل أن يكون حجم الشعار أقل من 2 ميجابايت.");
});
function accountLabel(account){return account==="cash"?"صندوق الكاش":account==="bank"?"الحساب البنكي":account==="expenses"?"صندوق المصروفات":"—"}
function renderFinance(){
 const balanceFor=account=>transactions.reduce((sum,t)=>sum+(t.account===account?(t.type==="receipt"||t.type==="transfer_in"?num(t.amount):-num(t.amount)):0),0);
 const cash=balanceFor("cash"),bank=balanceFor("bank"),expenses=balanceFor("expenses");
 $("cashBalance").textContent=money(cash);
 $("bankBalance").textContent=money(bank);
 $("expenseBalance").textContent=money(expenses);
 $("grandBalance").textContent=money(cash+bank+expenses);
}

function openEmployeeModal(id=""){
  const e=employees.find(x=>x.id===id);
  $("employeeModalTitle").textContent=e?"تعديل موظف":"إضافة موظف";
  $("employeeId").value=e?.id||"";
  $("employeeName").value=e?.name||"";
  $("employeeJob").value=e?.job||"";
  $("employeeSalary").value=e?.salary??0;
  $("employeePhone").value=e?.phone||"";
  $("employeeNotes").value=e?.notes||"";
  $("employeeModal").classList.add("show");
}
function closeEmployeeModal(){$("employeeModal").classList.remove("show")}
$("employeeForm").addEventListener("submit",e=>{
  e.preventDefault();
  const id=$("employeeId").value;
  const item={id:id||crypto.randomUUID(),name:$("employeeName").value.trim(),job:$("employeeJob").value.trim(),
    salary:num($("employeeSalary").value),phone:$("employeePhone").value.trim(),notes:$("employeeNotes").value.trim()};
  if(!item.name){alert("أدخل اسم الموظف.");return}
  if(id){const i=employees.findIndex(x=>x.id===id);if(i>=0)employees[i]=item}
  else employees.push(item);
  save();closeEmployeeModal();alert("تم حفظ بيانات الموظف.");
});
function editEmployee(id){openEmployeeModal(id)}
function removeEmployee(id){
  const e=employees.find(x=>x.id===id);
  if(e&&confirm("هل تريد حذف الموظف «"+e.name+"»؟")){employees=employees.filter(x=>x.id!==id);save()}
}
function openSalaryPayment(id){
  const e=employees.find(x=>x.id===id);if(!e)return;
  openTransaction("payment");
  $("txRecipientType").value="employee";
  updateTxRecipient();
  $("txClient").value=e.id;
  $("txDesc").value="راتب الموظف - "+e.name;
  $("txAmount").value=e.salary||"";
  $("txNotes").value="تحويل راتب";
}
function printAllEmployees(){
  if(!employees.length){alert("لا توجد بيانات موظفين للطباعة.");return}

  const logo=office.logo?`<img src="${office.logo}" style="max-width:70px;max-height:70px;display:block;margin:0 auto 6px">`:"";
  const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");

  const body=employees.map((e,i)=>`<tr>
    <td>${i+1}</td>
    <td>${esc(e.name)}</td>
    <td>${esc(e.job||"موظف")}</td>
    <td>${money(e.salary)}</td>
    <td>${esc(e.phone||"—")}</td>
    <td>${esc(e.notes||"—")}</td>
  </tr>`).join("");

  const totalSalary=employees.reduce((sum,e)=>sum+num(e.salary),0);

  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
  <title>سجل جميع الموظفين</title>
  <style>
    body{font-family:Tahoma,Arial,sans-serif;margin:0;padding:18px;color:#222}
    .head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:10px}
    .head h1{color:#17365d;margin:6px 0;font-size:20px}
    h2{text-align:center;color:#17365d;margin:15px 0}
    table{width:100%;border-collapse:collapse;margin-top:12px;font-size:10px}
    th,td{border:1px solid #999;padding:6px;text-align:right;vertical-align:top}
    th{background:#eef2f7}
    .summary{margin-top:12px;font-weight:bold;border:1px solid #aaa;padding:8px}
    .sign{display:flex;justify-content:space-between;margin-top:35px}
    @media print{
      @page{size:A4 portrait;margin:8mm}
      body{padding:0}
      table{font-size:9px}
      tr{page-break-inside:avoid}
      thead{display:table-header-group}
    }
  </style></head><body>
  <div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div>
  <h2>سجل جميع الموظفين</h2>
  <table>
    <thead><tr><th>#</th><th>اسم الموظف</th><th>المسمى الوظيفي</th><th>الراتب الشهري</th><th>رقم الهاتف</th><th>ملاحظات</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="summary">عدد الموظفين: ${employees.length} &nbsp; | &nbsp; إجمالي الرواتب الشهرية: ${money(totalSalary)}</div>
  <div class="sign"><span>إعداد / __________________</span><span>توقيع المحاسب / __________________</span></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
  </body></html>`;

  const w=window.open("","_blank","width=1100,height=850");
  if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");return}
  w.document.open();w.document.write(html);w.document.close();
}

function printEmployee(id){
  const e=employees.find(x=>x.id===id);
  if(!e){alert("لم يتم العثور على الموظف.");return}

  const logo=office.logo?`<img src="${office.logo}" style="max-width:85px;max-height:85px;display:block;margin:0 auto 8px">`:"";
  const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");

  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
  <title>بيانات الموظف - ${esc(e.name)}</title>
  <style>
    body{font-family:Tahoma,Arial,sans-serif;margin:0;padding:30px;color:#222}
    .sheet{max-width:800px;margin:auto;border:2px solid #17365d;padding:30px}
    .head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:15px}
    .head h1{color:#17365d;margin:8px 0}
    h2{text-align:center;color:#17365d;margin:25px 0}
    .info{border:1px solid #bbb;border-radius:6px;overflow:hidden;margin-top:20px}
    .row{display:grid;grid-template-columns:190px 1fr;border-bottom:1px solid #ddd}
    .row:last-child{border-bottom:0}
    .label{background:#f1f5f9;font-weight:bold;padding:14px}
    .value{padding:14px}
    .salary{font-size:22px;font-weight:bold}
    .sign{display:flex;justify-content:space-between;margin-top:80px}
    @media print{@page{size:A4 portrait;margin:15mm}body{padding:0}.sheet{border:2px solid #17365d}}
  </style></head><body>
  <div class="sheet">
    <div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div>
    <h2>بيانات موظف</h2>
    <div class="info">
      <div class="row"><div class="label">اسم الموظف</div><div class="value">${esc(e.name)}</div></div>
      <div class="row"><div class="label">المسمى الوظيفي</div><div class="value">${esc(e.job||"موظف")}</div></div>
      <div class="row"><div class="label">الراتب الشهري</div><div class="value salary">${money(e.salary)}</div></div>
      <div class="row"><div class="label">رقم الهاتف</div><div class="value">${esc(e.phone||"—")}</div></div>
      <div class="row"><div class="label">ملاحظات</div><div class="value">${esc(e.notes||"—")}</div></div>
    </div>
    <div class="sign"><span>توقيع الموظف: __________________</span><span>توقيع المحاسب: __________________</span></div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
  </body></html>`;

  const w=window.open("","_blank","width=900,height=800");
  if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");return}
  w.document.open();w.document.write(html);w.document.close();
}

function openEmployeeBenefitPayment(id,type){
  const e=employees.find(x=>x.id===id);if(!e)return;
  openTransaction("payment");
  $("txRecipientType").value="employee";
  updateTxRecipient();
  $("txClient").value=e.id;
  const title=type==="commission"?"عمولة":type==="leave"?"بدل أجازات":type==="end"?"نهاية الخدمة":type==="fees"?"رسوم":type==="bonus"?"مكافأة":"هدية";
  $("txDesc").value=title+" - "+e.name;
  $("txAmount").value="";
  $("txNotes").value=title+" للموظف";
}

function renderEmployees(){
  const box=$("employeeList");
  if(!employees.length){box.innerHTML='<div class="empty" style="grid-column:1/-1">لا يوجد موظفون. اضغط «إضافة موظف» لبدء تسجيل الموظفين.</div>';return}
  box.innerHTML=employees.map(e=>`<div class="employee-card">
    <h3>${esc(e.name)}</h3><div>${esc(e.job||"موظف")} <span class="employee-badge">راتب: ${money(e.salary)}</span></div>
    ${e.phone?`<div style="margin-top:6px">الهاتف: ${esc(e.phone)}</div>`:""}
    ${e.notes?`<div style="margin-top:6px;color:#64748b">${esc(e.notes)}</div>`:""}
    <div class="employee-actions">
      <button class="success" type="button" onclick="openSalaryPayment('${e.id}')">راتب</button>
      <button class="primary" type="button" onclick="openEmployeeBenefitPayment('${e.id}','commission')">عمولة</button>
      <button class="primary" type="button" onclick="openEmployeeBenefitPayment('${e.id}','leave')">بدل أجازات</button>
      <button class="primary" type="button" onclick="openEmployeeBenefitPayment('${e.id}','end')">نهاية الخدمة</button>
      <button class="primary" type="button" onclick="openEmployeeBenefitPayment('${e.id}','fees')">رسوم</button>
      <button class="primary" type="button" onclick="openEmployeeBenefitPayment('${e.id}','bonus')">مكافأة</button>
      <button class="primary" type="button" onclick="openEmployeeBenefitPayment('${e.id}','gift')">هدية</button>
      <button class="primary" type="button" onclick="printEmployee('${e.id}')">طباعة البيانات</button>
      <button class="primary" type="button" onclick="editEmployee('${e.id}')">تعديل</button>
      <button class="danger" type="button" onclick="removeEmployee('${e.id}')">حذف</button>
    </div>
  </div>`).join("");
}
function updateTxRecipient(){
 const type=$("txRecipientType").value,select=$("txClient"),other=$("txOtherRecipient"),label=$("txRecipientLabel"),caseWrap=$("txCaseWrap"),caseSelect=$("txCase");
 other.style.display=type==="other"?"block":"none";
 select.style.display=type==="other"?"none":"block";
 caseWrap.style.display=type==="client"?"block":"none";
 label.textContent=type==="employee"?"اسم الموظف":type==="client"?"اسم الموكل":"اسم المستفيد";
 if(type==="employee"){
   select.innerHTML=employees.length?employees.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join(""):'<option value="">لا يوجد موظفون</option>';
 }else if(type==="client"){
   const clients=[...new Set(data.map(c=>c.client))].sort((a,b)=>a.localeCompare(b,"ar"));
   select.innerHTML=clients.length?clients.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join(""):'<option value="">لا يوجد موكلون</option>';
   updateTxCases();
 }else{
   select.innerHTML='<option value="">— غير مرتبط —</option>';
   caseSelect.innerHTML='';
 }
}
function updateTxCases(){
 const client=$("txClient").value;
 const cs=data.filter(c=>c.client===client);
 $("txCase").innerHTML=cs.length?cs.map(c=>`<option value="${c.id}">${esc(c.caseNo||"بدون رقم")} — المتبقي ${money(balance(c))}</option>`).join(""):'<option value="">لا توجد قضايا لهذا الموكل</option>';
}
$("txClient").addEventListener("change",()=>{
 if($("txRecipientType").value==="client") updateTxCases();
});

function getAccountBalance(account){
  return transactions.reduce((sum,t)=>{
    if(t.account!==account) return sum;
    return sum + (t.type==="receipt" || t.type==="transfer_in" ? num(t.amount) : -num(t.amount));
  },0);
}
function openTransferModal(id=""){
  editingTransferId=id||"";
  editingTransferPairIds=[];
  $("transferTitle").textContent=editingTransferId?"تعديل التحويل بين الحسابات والصناديق":"نقل بين الحسابات والصناديق";
  $("transferForm").querySelector("button.primary[type=submit]").textContent=editingTransferId?"حفظ التعديلات":"تنفيذ التحويل";
  $("transferFrom").value="cash";
  $("transferAmount").value="";
  $("transferDate").value=new Date().toISOString().slice(0,10);
  $("transferNotes").value="";
  if(editingTransferId){
    const t=transactions.find(x=>x.id===editingTransferId);
    if(t && (t.type==="transfer_out"||t.type==="transfer_in")){
      const out=t.type==="transfer_out"?t:transactions.find(x=>x.type==="transfer_out"&&(t.groupId?x.groupId===t.groupId:(x.desc===t.desc&&x.date===t.date&&num(x.amount)===num(t.amount)&&x.notes===t.notes&&x.account!==t.account)));
      const incoming=t.type==="transfer_in"?t:transactions.find(x=>x.type==="transfer_in"&&(t.groupId?x.groupId===t.groupId:(x.desc===t.desc&&x.date===t.date&&num(x.amount)===num(t.amount)&&x.notes===t.notes&&x.account!==t.account)));
      if(out&&incoming){editingTransferPairIds=[out.id,incoming.id];$("transferFrom").value=out.account;$("transferAmount").value=out.amount;$("transferDate").value=out.date||new Date().toISOString().slice(0,10);$("transferNotes").value=out.notes||"";window._editingTransferTo=incoming.account;}
    }
  }
  updateTransferTo();
  if(window._editingTransferTo){$("transferTo").value=window._editingTransferTo;window._editingTransferTo="";}
  updateTransferInfo();
  $("transferModal").classList.add("show");
}
function closeTransferModal(){
  $("transferModal").classList.remove("show");
  editingTransferId="";editingTransferPairIds=[];
}
function updateTransferTo(){
  const from=$("transferFrom").value;
  const to=$("transferTo");
  const current=to.value;
  const accounts=[{value:"cash",label:"صندوق الكاش"},{value:"bank",label:"الحساب البنكي"},{value:"expenses",label:"صندوق المصروفات"}];
  to.innerHTML=accounts.filter(a=>a.value!==from).map(a=>`<option value="${a.value}">${a.label}</option>`).join("");
  if(accounts.some(a=>a.value===current && current!==from)) to.value=current;
  else to.selectedIndex=0;
}
function updateTransferInfo(){
  const from=$("transferFrom").value;
  const to=$("transferTo").value;
  const available=editingTransferPairIds.length?transactions.filter(t=>!editingTransferPairIds.includes(t.id)).reduce((sum,t)=>sum+(t.account===from?(t.type==="receipt"||t.type==="transfer_in"?num(t.amount):-num(t.amount)):0),0):getAccountBalance(from);
  $("transferInfo").innerHTML=`الرصيد المتاح في ${accountLabel(from)}: <b>${money(available)}</b>` + (to?`<br>الرصيد الحالي في ${accountLabel(to)}: <b>${money(getAccountBalance(to))}</b>`:"");
}
$("transferFrom").addEventListener("change",()=>{
  updateTransferTo();
  updateTransferInfo();
});
$("transferTo").addEventListener("change",updateTransferInfo);
$("transferForm").addEventListener("submit",e=>{
  e.preventDefault();
  const wasEditing=editingTransferPairIds.length===2;
  const from=$("transferFrom").value;
  const to=$("transferTo").value;
  const amount=num($("transferAmount").value);
  const available=editingTransferPairIds.length?transactions.filter(t=>!editingTransferPairIds.includes(t.id)).reduce((sum,t)=>sum+(t.account===from?(t.type==="receipt"||t.type==="transfer_in"?num(t.amount):-num(t.amount)):0),0):getAccountBalance(from);
  if(!to || to===from){alert("اختر حساباً مختلفاً عن الحساب المصدر.");return}
  if(amount<=0){alert("أدخل مبلغاً صحيحاً.");return}
  if(amount>available){
    alert("لا يمكن تنفيذ التحويل لأن المبلغ أكبر من الرصيد المتاح في الحساب المصدر.");
    return;
  }
  const date=$("transferDate").value;
  const notes=$("transferNotes").value.trim();
  const desc=`تحويل من ${accountLabel(from)} إلى ${accountLabel(to)}`;
  const common={desc,client:"",employeeId:"",employeeName:"",recipientType:"",recipient:"",amount,date,notes};
  if(editingTransferPairIds.length===2){
    const groupId=transactions.find(t=>editingTransferPairIds.includes(t.id))?.groupId||crypto.randomUUID();
    transactions=transactions.filter(t=>!editingTransferPairIds.includes(t.id));
    transactions.push({...common,id:editingTransferPairIds[0],type:"transfer_out",account:from,groupId});
    transactions.push({...common,id:editingTransferPairIds[1],type:"transfer_in",account:to,groupId});
  }else{
    const groupId=crypto.randomUUID();
    transactions.push({...common,id:crypto.randomUUID(),type:"transfer_out",account:from,groupId});
    transactions.push({...common,id:crypto.randomUUID(),type:"transfer_in",account:to,groupId});
  }
  save();
  closeTransferModal();
  alert(wasEditing?"تم تعديل التحويل وتحديث الأرصدة.":`تم التحويل بنجاح من ${accountLabel(from)} إلى ${accountLabel(to)} وتحديث الأرصدة.`);
});

function openTransaction(type){
 $("txType").value=type;
 $("txEditingId").value="";
 $("txTitle").textContent=type==="receipt"?"سند قبض":type==="payment"?"المدفوعات الصادرة":"سند صرف";
 $("txRecipientType").value=type==="receipt"?"client":"";updateTxRecipient();
 $("txDate").value=new Date().toISOString().slice(0,10);
 $("txDesc").value="";$("txAmount").value="";$("txNotes").value="";$("txAccount").value="cash";
 $("txModal").classList.add("show");
}
function editTransaction(id){
 const t=transactions.find(x=>x.id===id);
 if(!t || !["receipt","payment","expense"].includes(t.type)) return;
 $("txEditingId").value=id;
 $("txType").value=t.type;
 $("txTitle").textContent=t.type==="receipt"?"تعديل سند قبض":t.type==="payment"?"تعديل المدفوعات الصادرة":"تعديل سند صرف";
 $("txRecipientType").value=t.recipientType||"";
 updateTxRecipient();
 if(t.recipientType==="client"){
   $("txClient").value=t.client||"";
   updateTxCases();
   $("txCase").value=t.caseId||"";
 }else if(t.recipientType==="employee"){
   $("txClient").value=t.employeeId||"";
 }else if(t.recipientType==="other"){
   $("txOtherRecipient").value=t.recipient||"";
 }
 $("txDesc").value=t.desc||"";
 $("txAmount").value=t.amount||"";
 $("txAccount").value=t.account||"cash";
 $("txDate").value=t.date||new Date().toISOString().slice(0,10);
 $("txNotes").value=t.notes||"";
 $("txModal").classList.add("show");
}
function updateExistingTransaction(){
 const id=$("txEditingId").value;
 const t=transactions.find(x=>x.id===id);
 if(!t) return null;
 const type=$("txType").value, amount=num($("txAmount").value);
 if(!amount || amount<=0){alert("أدخل مبلغاً صحيحاً.");return null}
 const recipientType=$("txRecipientType").value;
 let client="",employeeId="",recipient="";
 if(type==="receipt" && recipientType!=="client"){
   alert("سند القبض يجب أن يكون مرتبطاً بموكل.");return null;
 }
 if(recipientType==="employee"){
   employeeId=$("txClient").value; const e=employees.find(x=>x.id===employeeId); recipient=e?.name||"";
 }else if(recipientType==="client"){
   client=$("txClient").value; recipient=client;
 }else if(recipientType==="other"){
   recipient=$("txOtherRecipient").value.trim();
 }
 let caseId="";
 if(type==="receipt"){
   caseId=$("txCase").value;
   const c=data.find(x=>x.id===caseId && x.client===client);
   if(!c){alert("اختر قضية مرتبطة بسند القبض.");return null}
   const oldCase=t.caseId?data.find(x=>x.id===t.caseId):null;
   if(oldCase) oldCase.payment=Math.max(0,num(oldCase.payment)-num(t.amount));
   const remaining=balance(c);
   if(amount>remaining && !confirm("قيمة سند القبض أكبر من الرصيد المتبقي. هل تريد تسجيله رغم ذلك؟")){
     if(oldCase) oldCase.payment=num(oldCase.payment)+num(t.amount);
     return null;
   }
   c.payment=num(c.payment)+amount;
   c.paymentDate=$("txDate").value;
 }
 Object.assign(t,{desc:$("txDesc").value.trim(),client,employeeId,employeeName:recipientType==="employee"?recipient:"",recipientType,recipient,amount,caseId,account:$("txAccount").value,date:$("txDate").value,notes:$("txNotes").value.trim()});
 save();
 $("txEditingId").value="";
 return t;
}
function closeTransaction(){$("txModal").classList.remove("show")}
function collectTransaction(){
 const type=$("txType").value, amount=num($("txAmount").value);
 if(!amount||amount<=0){alert("أدخل مبلغاً صحيحاً.");return null}
 const recipientType=$("txRecipientType").value;
 let client="",employeeId="",recipient="";
 if(type==="receipt" && recipientType!=="client"){
   alert("سند القبض يجب أن يكون مرتبطاً بموكل.");return null;
 }
 if(recipientType==="employee"){
   employeeId=$("txClient").value;const e=employees.find(x=>x.id===employeeId);recipient=e?.name||"";
 }else if(recipientType==="client"){
   client=$("txClient").value;recipient=client;
 }else if(recipientType==="other"){
   recipient=$("txOtherRecipient").value.trim();
 }
 if(type==="receipt"){
   const caseId=$("txCase").value;
   const c=data.find(x=>x.id===caseId && x.client===client);
   if(!c){alert("اختر قضية مرتبطة بسند القبض.");return null}
   const remaining=balance(c);
   if(amount>remaining && !confirm("قيمة سند القبض أكبر من الرصيد المتبقي. هل تريد تسجيله رغم ذلك؟"))return null;
   c.payment=num(c.payment)+amount;
   c.paymentDate=$("txDate").value;
 }
 const t={id:crypto.randomUUID(),type,desc:$("txDesc").value.trim(),client,employeeId,
 employeeName:recipientType==="employee"?recipient:"",recipientType,recipient,amount,
 caseId:type==="receipt"?$("txCase").value:"",
 account:$("txAccount").value,date:$("txDate").value,notes:$("txNotes").value.trim()};
 transactions.push(t);save();return t;
}
$("txForm").addEventListener("submit",e=>{
 e.preventDefault();
 const editing=!!$("txEditingId").value;
 const t=editing?updateExistingTransaction():collectTransaction();
 if(!t)return;
 closeTransaction();alert(editing?"تم تعديل العملية وتحديث الأرصدة.":"تم حفظ العملية وتحديث إجمالي الأرصدة.");
});
function saveTransactionAndPrint(){
 const t=collectTransaction(); if(!t)return;
 closeTransaction(); setTimeout(()=>printTransaction(t.id),100);
}
function normalizeArabicSearch(value){
 return String(value||"").trim().toLocaleLowerCase("ar")
   .replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
   .replace(/ـ/g,"").replace(/[ًٌٍَُِّْ]/g,"");
}
function getFilteredTransactions(){
 const filter=$("txFilter")?.value||"";
 const clientSearch=normalizeArabicSearch($("txClientSearch")?.value||"");
 const from=$("txDateFrom")?.value||"";
 const to=$("txDateTo")?.value||"";
 return transactions.filter(t=>{
  const date=t.date||"";
  const clientName=normalizeArabicSearch(t.client||"");
  const recipientName=normalizeArabicSearch(t.recipient||t.employeeName||"");
  const matchesClient=!clientSearch || clientName.includes(clientSearch) || recipientName.includes(clientSearch);
  return (!filter||t.type===filter) && matchesClient && (!from||date>=from) && (!to||date<=to);
 });
}
function clearTransactionClientSearch(){
 $("txClientSearch").value="";
 renderTransactions();
}
function clearTransactionDateFilter(){
 $("txDateFrom").value="";
 $("txDateTo").value="";
 renderTransactions();
}
function renderTransactions(){
 const rows=getFilteredTransactions();
 $("txBody").innerHTML=rows.length?rows.map((t,i)=>`
 <tr><td>${i+1}</td>
 <td>${t.type==="receipt"?"سند قبض":t.type==="payment"?"مدفوعات صادرة":t.type==="expense"?"سند صرف":t.type==="transfer_out"?"تحويل صادر":t.type==="transfer_in"?"تحويل وارد":"عملية"}</td>
 <td>${esc(t.desc)}</td><td>${esc(t.employeeName||t.client||t.recipient||"—")}</td><td>${money(t.amount)}</td>
 <td>${accountLabel(t.account)}</td><td>${t.date||""}</td><td>${esc(t.notes)}</td>
 <td>
 <button class="primary" onclick="printTransaction('${t.id}')">طباعة</button>
 ${["receipt","payment","expense"].includes(t.type)?`<button class="success" onclick="editTransaction('${t.id}')">تعديل</button>`:""}
 ${["transfer_out","transfer_in"].includes(t.type)?`<button class="success" onclick="openTransferModal('${t.id}')">تعديل</button>`:""}
 <button class="danger" onclick="removeTransaction('${t.id}')">حذف</button>
</td></tr>`).join("")
 :`<tr><td colspan="9" class="empty">لا توجد عمليات</td></tr>`;
}
function removeTransaction(id){
 const t=transactions.find(x=>x.id===id);
 if(!t)return;
 if(confirm("هل تريد حذف هذه العملية؟ سيتم إعادة احتساب الرصيد وحساب أتعاب الموكل.")){
  if(t.type==="receipt" && t.caseId){
    const c=data.find(x=>x.id===t.caseId);
    if(c)c.payment=Math.max(0,num(c.payment)-num(t.amount));
  }
  transactions=transactions.filter(x=>x.id!==id);save();
 }
}


function currentReportMonth(){
 const input=$("reportMonth");
 return input?.value || new Date().toISOString().slice(0,7);
}
function monthlyReportData(month=currentReportMonth()){
 const cases=data.filter(c=>String(c.contractDate||"").startsWith(month));
 const receiptRows=transactions.filter(t=>t.type==="receipt" && String(t.date||"").startsWith(month));
 const outgoingRows=transactions.filter(t=>(t.type==="payment"||t.type==="expense") && String(t.date||"").startsWith(month));
 const transferRows=transactions.filter(t=>(t.type==="transfer_out"||t.type==="transfer_in") && String(t.date||"").startsWith(month));
 const contractFees=cases.reduce((sum,c)=>sum+num(c.fees),0);
 const advances=cases.reduce((sum,c)=>sum+num(c.advance),0);
 const receipts=receiptRows.reduce((sum,t)=>sum+num(t.amount),0);
 const outgoing=outgoingRows.reduce((sum,t)=>sum+num(t.amount),0);
 const transfersIn=transferRows.filter(t=>t.type==="transfer_in").reduce((sum,t)=>sum+num(t.amount),0);
 const transfersOut=transferRows.filter(t=>t.type==="transfer_out").reduce((sum,t)=>sum+num(t.amount),0);
 const directPayments=data.filter(c=>String(c.paymentDate||"").startsWith(month) && !transactions.some(t=>t.type==="receipt" && t.caseId===c.id && String(t.date||"").startsWith(month))).reduce((sum,c)=>sum+num(c.payment),0);
 return {month,cases,receiptRows,outgoingRows,transferRows,contractFees,advances,receipts,outgoing,transfersIn,transfersOut,directPayments,net:receipts+directPayments-outgoing+transfersIn-transfersOut};
}
function reportMonthLabel(month){
 if(!month)return "—";
 const [y,m]=month.split("-");
 return new Date(Number(y),Number(m)-1,1).toLocaleDateString("ar-KW",{year:"numeric",month:"long"});
}
function reportTransactionLabel(type){return type==="receipt"?"سند قبض":type==="payment"?"مدفوعات صادرة":type==="expense"?"سند صرف":type==="transfer_in"?"تحويل وارد":type==="transfer_out"?"تحويل صادر":"عملية"}
function renderMonthlyReport(){
 const r=monthlyReportData();
 const tx=[...r.receiptRows,...r.outgoingRows,...r.transferRows].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
 const caseRows=r.cases.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.client)}</td><td>${esc(c.caseNo||"—")}</td><td>${esc(c.contractDate||"")}</td><td>${money(c.fees)}</td><td>${money(c.advance)}</td></tr>`).join("");
 const txRows=tx.map((t,i)=>`<tr><td>${i+1}</td><td>${esc(t.date||"")}</td><td>${reportTransactionLabel(t.type)}</td><td>${esc(t.client||t.recipient||t.employeeName||"—")}</td><td>${esc(t.desc||"—")}</td><td>${money(t.amount)}</td><td>${accountLabel(t.account)}</td></tr>`).join("");
 $("monthlyReportBody").innerHTML=`<h3 style="margin:6px 0;color:#17365d">التقرير المالي لشهر ${esc(reportMonthLabel(r.month))}</h3>
  <div class="report-summary"><div class="report-stat"><span>أتعاب العقود الجديدة</span><strong>${money(r.contractFees)}</strong></div><div class="report-stat"><span>المقدم في العقود الجديدة</span><strong>${money(r.advances)}</strong></div><div class="report-stat"><span>سندات القبض</span><strong>${money(r.receipts+r.directPayments)}</strong></div><div class="report-stat"><span>المدفوعات والمصروفات</span><strong>${money(r.outgoing)}</strong></div><div class="report-stat"><span>التحويلات الواردة</span><strong>${money(r.transfersIn)}</strong></div><div class="report-stat"><span>التحويلات الصادرة</span><strong>${money(r.transfersOut)}</strong></div><div class="report-stat"><span>صافي الحركة النقدية</span><strong>${money(r.net)}</strong></div><div class="report-stat"><span>عدد العمليات</span><strong>${tx.length}</strong></div></div>
  <h3>الحسابات والعقود الجديدة (${r.cases.length})</h3><div class="table-wrap"><table class="report-table"><thead><tr><th>#</th><th>الموكل</th><th>رقم القضية</th><th>تاريخ التعاقد</th><th>الأتعاب</th><th>المقدم</th></tr></thead><tbody>${caseRows||`<tr><td colspan="6" class="empty">لا توجد حسابات جديدة في هذا الشهر.</td></tr>`}</tbody></table></div>
  <h3>حركة السندات والعمليات (${tx.length})</h3><div class="table-wrap"><table class="report-table"><thead><tr><th>#</th><th>التاريخ</th><th>نوع العملية</th><th>المستفيد/الموكل</th><th>البيان</th><th>المبلغ</th><th>الحساب</th></tr></thead><tbody>${txRows||`<tr><td colspan="7" class="empty">لا توجد عمليات في هذا الشهر.</td></tr>`}</tbody></table></div>`;
}
function monthlyReportHtml(r){
 const tx=[...r.receiptRows,...r.outgoingRows,...r.transferRows].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
 const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");
 const logo=office.logo?`<img src="${office.logo}" style="max-width:70px;max-height:70px;display:block;margin:0 auto 6px">`:"";
 const cases=r.cases.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.client)}</td><td>${esc(c.caseNo||"—")}</td><td>${esc(c.contractDate||"")}</td><td>${money(c.fees)}</td><td>${money(c.advance)}</td></tr>`).join("");
 const txRows=tx.map((t,i)=>`<tr><td>${i+1}</td><td>${esc(t.date||"")}</td><td>${reportTransactionLabel(t.type)}</td><td>${esc(t.client||t.recipient||t.employeeName||"—")}</td><td>${esc(t.desc||"—")}</td><td>${money(t.amount)}</td><td>${accountLabel(t.account)}</td></tr>`).join("");
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير مالي شهري - ${esc(reportMonthLabel(r.month))}</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:20px;color:#222}.head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:12px}.head h1,h2,h3{color:#17365d}.head h1{text-align:center}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.box{border:1px solid #aaa;padding:10px;text-align:center;background:#f8fafc}.box b{display:block;font-size:16px;margin-top:5px;color:#17365d}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:10px}th,td{border:1px solid #999;padding:6px;text-align:right}th{background:#eef2f7}.sign{display:flex;justify-content:space-between;margin-top:45px}@media print{@page{size:A4 landscape;margin:10mm}body{padding:0}tr{page-break-inside:avoid}thead{display:table-header-group}}</style></head><body><div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div><h2>التقرير المالي الشهري — ${esc(reportMonthLabel(r.month))}</h2><div class="summary"><div class="box">أتعاب العقود الجديدة<b>${money(r.contractFees)}</b></div><div class="box">المقدم<b>${money(r.advances)}</b></div><div class="box">القبض<b>${money(r.receipts+r.directPayments)}</b></div><div class="box">المدفوعات والمصروفات<b>${money(r.outgoing)}</b></div><div class="box">التحويلات الواردة<b>${money(r.transfersIn)}</b></div><div class="box">التحويلات الصادرة<b>${money(r.transfersOut)}</b></div><div class="box">صافي الحركة<b>${money(r.net)}</b></div><div class="box">عدد العمليات<b>${tx.length}</b></div></div><h3>الحسابات والعقود الجديدة</h3><table><thead><tr><th>#</th><th>الموكل</th><th>رقم القضية</th><th>التعاقد</th><th>الأتعاب</th><th>المقدم</th></tr></thead><tbody>${cases||`<tr><td colspan="6">لا توجد حسابات جديدة</td></tr>`}</tbody></table><h3>حركة السندات والعمليات</h3><table><thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>المستفيد/الموكل</th><th>البيان</th><th>المبلغ</th><th>الحساب</th></tr></thead><tbody>${txRows||`<tr><td colspan="7">لا توجد عمليات</td></tr>`}</tbody></table><div class="sign"><span>إعداد / __________________</span><span>توقيع المحاسب / __________________</span></div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
}
function printMonthlyReport(){
 const r=monthlyReportData();
 const w=window.open("","_blank","width=1200,height=900");
 if(!w){alert("تعذر فتح نافذة التقرير. يرجى السماح بالنوافذ المنبثقة.");return}
 w.document.open();w.document.write(monthlyReportHtml(r));w.document.close();
}
function exportMonthlyReportExcel(){
 const r=monthlyReportData();
 const tx=[...r.receiptRows,...r.outgoingRows,...r.transferRows].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
 const escCell=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
 const summary=[['البند','القيمة'],['أتعاب العقود الجديدة',money(r.contractFees)],['المقدم في العقود الجديدة',money(r.advances)],['سندات القبض',money(r.receipts+r.directPayments)],['المدفوعات والمصروفات',money(r.outgoing)],['التحويلات الواردة',money(r.transfersIn)],['التحويلات الصادرة',money(r.transfersOut)],['صافي الحركة النقدية',money(r.net)],['عدد العمليات',tx.length]];
 const summaryRows=summary.map(row=>`<tr>${row.map(v=>`<td>${escCell(v)}</td>`).join("")}</tr>`).join("");
 const caseRows=r.cases.map((c,i)=>`<tr><td>${i+1}</td><td>${escCell(c.client)}</td><td>${escCell(c.caseNo||"—")}</td><td>${escCell(c.contractDate||"")}</td><td>${escCell(money(c.fees))}</td><td>${escCell(money(c.advance))}</td></tr>`).join("");
 const txRows=tx.map((t,i)=>`<tr><td>${i+1}</td><td>${escCell(t.date||"")}</td><td>${escCell(reportTransactionLabel(t.type))}</td><td>${escCell(t.client||t.recipient||t.employeeName||"—")}</td><td>${escCell(t.desc||"—")}</td><td>${escCell(money(t.amount))}</td><td>${escCell(accountLabel(t.account))}</td></tr>`).join("");
 const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>body{font-family:Tahoma,Arial}table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #999;padding:7px;text-align:right}th{background:#dbeafe;font-weight:bold}h1,h2{color:#17365d}</style></head><body dir="rtl"><h1>${escCell(office.name||"مكتب المحاماة")}</h1><h2>التقرير المالي الشهري — ${escCell(reportMonthLabel(r.month))}</h2><table><tr><th>البند</th><th>القيمة</th></tr>${summaryRows.replace(/^<tr><td>البند[\s\S]*?<\/tr>/,'')}</table><h3>الحسابات والعقود الجديدة</h3><table><tr><th>#</th><th>الموكل</th><th>رقم القضية</th><th>التعاقد</th><th>الأتعاب</th><th>المقدم</th></tr>${caseRows||'<tr><td colspan="6">لا توجد حسابات جديدة</td></tr>'}</table><h3>حركة السندات والعمليات</h3><table><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>المستفيد/الموكل</th><th>البيان</th><th>المبلغ</th><th>الحساب</th></tr>${txRows||'<tr><td colspan="7">لا توجد عمليات</td></tr>'}</table></body></html>`;
 const blob=new Blob(["\ufeff",html],{type:"application/vnd.ms-excel;charset=utf-8"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`تقرير_مالي_${r.month}.xls`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function printAllClientsStatement(){
  const clients=[...new Set(data.map(c=>c.client).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"));
  if(!clients.length){alert("لا توجد بيانات عملاء للطباعة.");return}
  const logo=office.logo?`<img src="${office.logo}" style="max-width:70px;max-height:70px;display:block;margin:0 auto 6px">`:"";
  const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");
  let totalFees=0,totalPaidAll=0;
  const rows=clients.map((name,i)=>{
    const cs=data.filter(c=>c.client===name);
    const fees=cs.reduce((sum,c)=>sum+num(c.fees),0);
    const paid=cs.reduce((sum,c)=>sum+totalPaid(c),0);
    totalFees+=fees; totalPaidAll+=paid;
    return `<tr><td>${i+1}</td><td>${esc(name)}</td><td>${cs.length}</td><td>${money(fees)}</td><td>${money(paid)}</td><td class="remaining">${money(Math.max(0,fees-paid))}</td></tr>`;
  }).join("");
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف حساب جميع العملاء</title>
  <style>body{font-family:Tahoma,Arial,sans-serif;margin:0;padding:18px;color:#222}.head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:10px}.head h1{color:#17365d;margin:6px 0;font-size:20px}h2{text-align:center;color:#17365d;margin:15px 0}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:11px}th,td{border:1px solid #999;padding:8px;text-align:right}th{background:#eef2f7}.remaining{font-weight:bold}.summary{margin-top:14px;border:1px solid #aaa;padding:10px;font-weight:bold;line-height:2}.sign{display:flex;justify-content:space-between;margin-top:40px}@media print{@page{size:A4 portrait;margin:10mm}body{padding:0}tr{page-break-inside:avoid}thead{display:table-header-group}}</style></head><body>
  <div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div><h2>كشف حساب جميع العملاء</h2>
  <table><thead><tr><th>#</th><th>اسم العميل</th><th>عدد القضايا</th><th>قيمة أتعاب المحاماة</th><th>المبلغ المدفوع</th><th>المبلغ المتبقي</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="summary">إجمالي العملاء: ${clients.length}<br>إجمالي أتعاب المحاماة: ${money(totalFees)} &nbsp; | &nbsp; إجمالي المبلغ المدفوع: ${money(totalPaidAll)} &nbsp; | &nbsp; إجمالي المبلغ المتبقي: ${money(Math.max(0,totalFees-totalPaidAll))}</div>
  <div class="sign"><span>إعداد / __________________</span><span>توقيع المحاسب / __________________</span></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
  const w=window.open("","_blank","width=1100,height=850");
  if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");return}
  w.document.open();w.document.write(html);w.document.close();
}

function openMultiStatement(){
 const clients=[...new Set(data.map(c=>c.client))].sort((a,b)=>a.localeCompare(b,"ar"));
 $("multiClientChecks").innerHTML=clients.length?clients.map((x,i)=>`
  <label class="client-check"><input type="checkbox" class="clientSelect" value="${esc(x)}"> ${esc(x)}</label>
 `).join(""):`<div class="empty">لا يوجد موكلون.</div>`;
 $("multiStatementModal").classList.add("show");
}
function closeMultiStatement(){$("multiStatementModal").classList.remove("show")}
function selectAllClients(){document.querySelectorAll(".clientSelect").forEach(x=>x.checked=true)}
function clearClientSelection(){document.querySelectorAll(".clientSelect").forEach(x=>x.checked=false)}
function printSelectedClients(){
 const names=[...document.querySelectorAll(".clientSelect:checked")].map(x=>x.value);
 if(!names.length){alert("اختر موكلاً واحداً على الأقل.");return}
 const logo=office.logo?`<img src="${office.logo}" style="max-width:80px;max-height:80px;display:block;margin:0 auto 8px">`:"";
 const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");
 const pages=names.map(name=>{
   const cs=data.filter(c=>c.client===name);
   const fees=cs.reduce((a,c)=>a+num(c.fees),0);
   const paid=cs.reduce((a,c)=>a+totalPaid(c),0);
   const remaining=fees-paid;
   const rows=cs.map(c=>`<tr>
     <td>${esc(c.contractDate||"")}</td>
     <td>${esc(c.caseNo||"بدون رقم")}</td>
     <td>${esc(c.caseType||"")}</td>
     <td>${esc(c.opponent||"")}</td>
     <td>${money(c.fees)}</td>
     <td>${money(totalPaid(c))}</td>
     <td>${money(balance(c))}</td>
   </tr>`).join("");
   return `<section class="page">
   <div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div>
   <h2>كشف حساب الموكل</h2>
   <div class="client-title"><b>اسم الموكل المختار:</b> ${esc(name)}</div>
   <div class="client-meta"><b>عدد القضايا:</b> ${cs.length}</div>
   <table><thead><tr>
     <th>التعاقد</th><th>رقم القضية</th><th>نوع القضية</th><th>الخصم</th>
     <th>أتعاب المحاماة</th><th>المبلغ المسدد</th><th>باقي أتعاب المحاماة</th>
   </tr></thead><tbody>${rows}</tbody></table>
   <div class="summary-box">
     <div><span>قيمة أتعاب المحاماة</span><strong>${money(fees)}</strong></div>
     <div><span>إجمالي المبلغ المسدد</span><strong>${money(paid)}</strong></div>
     <div><span>باقي أتعاب المحاماة</span><strong>${money(remaining)}</strong></div>
   </div>
   <p class="sign">توقيع المحاسب: ____________________</p></section>`;
 }).join("");
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشوف حساب الموكلين</title>
 <style>body{font-family:Tahoma,Arial,sans-serif;margin:0;color:#222}.page{padding:25px;page-break-after:always}.head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:12px}.head h1{color:#17365d}h2{text-align:center;color:#17365d}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #bbb;padding:7px;text-align:right}th{background:#eee}.client-title{font-size:19px;margin:18px 0 6px;padding:12px;border:2px solid #17365d;background:#f8fafc;color:#17365d}.client-meta{margin-bottom:10px}.summary-box{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.summary-box div{border:1px solid #aaa;padding:12px;text-align:center;background:#f8fafc}.summary-box span{display:block;font-weight:bold;margin-bottom:7px}.summary-box strong{font-size:18px;color:#17365d}.sign{margin-top:55px}@media print{.page{page-break-after:always}.summary-box{grid-template-columns:repeat(3,1fr)}}</style></head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
 const w=window.open("","_blank","width=1100,height=850");
 if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");return}
 w.document.open();w.document.write(html);w.document.close();closeMultiStatement();
}

function getFilteredAccounts(){
 const q=$("search").value.trim().toLowerCase();
 const field=$("accountDateField")?.value||"contractDate";
 const from=$("accountDateFrom")?.value||"";
 const to=$("accountDateTo")?.value||"";
 return data.filter(c=>{
   const textMatch=[c.client,c.opponent,c.caseNo,c.caseType].join(" ").toLowerCase().includes(q);
   if(!textMatch) return false;
   const d=c[field]||"";
   if(from && (!d || d<from)) return false;
   if(to && (!d || d>to)) return false;
   return true;
 });
}
function clearAccountDateFilter(){
 $("accountDateFrom").value="";
 $("accountDateTo").value="";
 render();
}
function printAccountsRegister(){
 const rows=getFilteredAccounts();
 if(!rows.length){alert("لا توجد حسابات ضمن نطاق البحث المحدد.");return}
 const logo=office.logo?`<img src="${office.logo}" style="max-width:75px;max-height:75px;display:block;margin:0 auto 8px">`:"";
 const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");
 const body=rows.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.client)}</td><td>${esc(c.opponent)}</td><td>${esc(c.caseNo)}</td><td>${esc(c.caseType)}</td><td>${esc(c.contractDate||"")}</td><td>${money(c.fees)}</td><td>${money(c.advance)}</td><td>${money(c.payment)}</td><td>${money(totalPaid(c))}</td><td>${money(balance(c))}</td></tr>`).join("");
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>سجل الحسابات</title>
 <style>body{font-family:Tahoma,Arial,sans-serif;padding:20px;color:#222}.head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:12px}.head h1{color:#17365d}h2{text-align:center}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #aaa;padding:6px;text-align:right}th{background:#eee}.summary{margin:15px 0;font-weight:bold}@media print{@page{size:A4 landscape;margin:10mm}}</style></head><body>
 <div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div>
 <h2>سجل حسابات المكتب</h2>
 <div class="summary">عدد الحسابات: ${rows.length} ${$("accountDateFrom")?.value||$("accountDateTo")?.value?` | البحث حسب ${$("accountDateField")?.value==="paymentDate"?"تاريخ السداد":"تاريخ التعاقد"}: ${esc($("accountDateFrom")?.value||"بداية السجل")} إلى ${esc($("accountDateTo")?.value||"نهاية السجل")}`:""}</div>
 <table><thead><tr><th>#</th><th>الموكل</th><th>الخصم</th><th>رقم القضية</th><th>نوع القضية</th><th>التعاقد</th><th>الأتعاب</th><th>المقدم</th><th>الدفعة</th><th>المسدّد</th><th>المتبقي</th></tr></thead><tbody>${body}</tbody></table>
 <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
 const w=window.open("","_blank","width=1200,height=850");
 if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");return}
 w.document.open();w.document.write(html);w.document.close();
}

function printTransactionsRegister(){
  const rows=getFilteredTransactions().slice().sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  if(!rows.length){alert("لا توجد سندات أو مدفوعات صادرة ضمن نطاق البحث المحدد.");return}

  const logo=office.logo?`<img src="${office.logo}" style="max-width:80px;max-height:80px;display:block;margin:0 auto 8px">`:"";
  const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");
   const dateFrom=$("txDateFrom")?.value||"";
   const dateTo=$("txDateTo")?.value||"";
   const dateRange=dateFrom||dateTo
     ? `<div style="margin:8px 0;font-weight:bold">نطاق البحث: ${esc(dateFrom||"بداية السجل")} إلى ${esc(dateTo||"نهاية السجل")}</div>`
     : "";

  let totalReceipts=0,totalPayments=0,totalExpenses=0;
  const body=rows.map((t,i)=>{
    const amount=num(t.amount);
    if(t.type==="receipt") totalReceipts+=amount;
    else if(t.type==="payment") totalPayments+=amount;
    else if(t.type==="expense") totalExpenses+=amount;
    const typeName=t.type==="receipt"?"سند قبض":t.type==="payment"?"مدفوعات صادرة":t.type==="expense"?"سند صرف":t.type==="transfer_out"?"تحويل صادر":t.type==="transfer_in"?"تحويل وارد":"عملية";
    const recipient=t.client||"—";
    const account=t.account==="cash"?"صندوق الكاش":"الحساب البنكي";
    return `<tr>
      <td>${i+1}</td>
      <td>${esc(t.id.slice(0,8).toUpperCase())}</td>
      <td>${esc(t.date||"")}</td>
      <td>${typeName}</td>
      <td>${esc(t.desc||"")}</td>
      <td>${esc(recipient)}</td>
      <td>${money(amount)}</td>
      <td>${account}</td>
      <td>${esc(t.notes||"")}</td>
    </tr>`;
  }).join("");

  const net=totalReceipts-totalPayments-totalExpenses;
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
  <title>سجل السندات والمدفوعات الصادرة</title>
  <style>
    body{font-family:Tahoma,Arial,sans-serif;padding:18px;color:#222}
    .head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:12px}
    .head h1{color:#17365d;margin:8px 0}
    h2{text-align:center;color:#17365d;margin:18px 0}
    table{width:100%;border-collapse:collapse;margin-top:15px;font-size:10px}
    th,td{border:1px solid #999;padding:6px;text-align:right;vertical-align:top}
    th{background:#eee}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:15px 0}
    .box{border:1px solid #aaa;padding:10px;font-weight:bold}
    .sign{margin-top:45px;display:flex;justify-content:space-between}
    @media print{
      @page{size:A4 landscape;margin:8mm}
      body{padding:0}
      tr{page-break-inside:avoid}
      thead{display:table-header-group}
    }
  </style></head><body>
  <div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div>
  <h2>سجل السندات والمدفوعات الصادرة</h2>
   ${dateRange}
  <div class="summary">
    <div class="box">عدد العمليات: ${rows.length}</div>
    <div class="box">إجمالي سندات القبض: ${money(totalReceipts)}</div>
    <div class="box">إجمالي المدفوعات والصرف: ${money(totalPayments+totalExpenses)}</div>
    <div class="box">صافي الحركة: ${money(net)}</div>
  </div>
  <table>
    <thead><tr><th>#</th><th>رقم السند</th><th>التاريخ</th><th>نوع العملية</th><th>البيان</th><th>المستفيد / الموكل</th><th>المبلغ</th><th>الحساب</th><th>ملاحظات</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="sign"><span>إعداد / __________________</span><span>توقيع المحاسب / __________________</span></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
  </body></html>`;

  const w=window.open("","_blank","width=1200,height=850");
  if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");return}
  w.document.open();w.document.write(html);w.document.close();
}

function printSelectedClientRegister(){
 if(!selectedClient){alert("اختر موكلاً أولاً.");return}
 const name=selectedClient, cs=data.filter(c=>c.client===name);
 if(!cs.length){alert("لا توجد حسابات لهذا الموكل.");return}
 const logo=office.logo?`<img src="${office.logo}" style="max-width:80px;max-height:80px;display:block;margin:0 auto 8px">`:"";
 const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");
 const rows=cs.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.opponent||"")}</td><td>${esc(c.caseNo||"")}</td><td>${esc(c.caseType||"")}</td><td>${esc(c.contractDate||"")}</td><td>${money(c.fees)}</td><td>${money(c.advance)}</td><td>${money(c.payment)}</td><td>${money(totalPaid(c))}</td><td>${money(balance(c))}</td></tr>`).join("");
 const fees=cs.reduce((a,c)=>a+num(c.fees),0), paid=cs.reduce((a,c)=>a+totalPaid(c),0);
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>سجل حساب ${esc(name)}</title>
 <style>body{font-family:Tahoma,Arial,sans-serif;padding:20px;color:#222}.head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:12px}.head h1{color:#17365d}h2{text-align:center;color:#17365d}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px}th,td{border:1px solid #aaa;padding:7px;text-align:right}th{background:#eee}.summary{margin:15px 0;font-weight:bold;line-height:2}.sign{margin-top:55px}@media print{@page{size:A4 landscape;margin:10mm}}</style></head><body>
 <div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div>
 <h2>سجل حساب موكل</h2><div class="summary">اسم الموكل: ${esc(name)}<br>عدد القضايا: ${cs.length}</div>
 <table><thead><tr><th>#</th><th>الخصم</th><th>رقم القضية</th><th>نوع القضية</th><th>تاريخ التعاقد</th><th>الأتعاب</th><th>المقدم</th><th>الدفعات</th><th>إجمالي المسدد</th><th>المتبقي</th></tr></thead><tbody>${rows}</tbody></table>
 <div class="summary">إجمالي الأتعاب: ${money(fees)} | إجمالي المسدد: ${money(paid)} | إجمالي المتبقي: ${money(fees-paid)}</div>
 <div class="sign">توقيع المحاسب: ______________________________</div>
 <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
 const w=window.open("","_blank","width=1200,height=850");
 if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");return}
 w.document.open();w.document.write(html);w.document.close();
}
function printClientStatement(){
 if(!selectedClient){
   const q=$("clientSearch").value.trim();
   if(q) {
     const match=[...new Set(data.map(c=>c.client))].find(x=>x.includes(q));
     if(match) selectedClient=match;
   }
 }
 if(!selectedClient){alert("اختر موكلاً من شجرة حسابات الموكلين أولاً.");return}
 const cs=data.filter(c=>c.client===selectedClient);
 const logo=$("printLogo");
 if(office.logo){logo.src=office.logo;logo.style.display="block"}else logo.style.display="none";
 $("printOfficeName").textContent=office.name||"مكتب المحاماة";
 $("printOfficeDetails").textContent=[office.address,office.phone,office.email].filter(Boolean).join(" | ");
 $("printClientInfo").innerHTML="<b>اسم الموكل:</b> "+esc(selectedClient)+" &nbsp; | &nbsp; <b>عدد القضايا:</b> "+cs.length;
 let totalFees=0,totalPaidAll=0;
 $("printBody").innerHTML=cs.map(c=>{
   totalFees+=num(c.fees);totalPaidAll+=totalPaid(c);
   return `<tr><td>${c.paymentDate||c.contractDate||""}</td><td>حساب القضية</td><td>${esc(c.caseNo||"بدون رقم")}</td>
   <td>${money(c.fees)}</td><td>${money(c.advance)}</td><td>${money(c.payment)}</td><td>${money(totalPaid(c))}</td><td>${money(balance(c))}</td></tr>`;
 }).join("");
 $("printTotals").innerHTML=`إجمالي الأتعاب: ${money(totalFees)} &nbsp; | &nbsp; إجمالي المسدد: ${money(totalPaidAll)} &nbsp; | &nbsp; إجمالي المتبقي: ${money(totalFees-totalPaidAll)}`;
 window.print();
}

function printTransaction(id){
 const t=transactions.find(x=>x.id===id);
 if(!t){alert("لم يتم العثور على العملية.");return}
 const typeName=t.type==="receipt"?"سند قبض":t.type==="payment"?"المدفوعات الصادرة":"سند صرف";
 const accountName=accountLabel(t.account);
 const caseInfo=t.caseId?(data.find(c=>c.id===t.caseId)?.caseNo||"بدون رقم"):"";
 const logo=office.logo?`<img src="${office.logo}" style="max-width:85px;max-height:85px;display:block;margin:0 auto 8px">`:"";
 const accountantSignature=office.accountantSignature||DEFAULT_ACCOUNTANT_SIGNATURE;
 const signatureBlock=`<div class="signature-box"><span>توقيع المحاسب</span><img src="${accountantSignature}" alt="توقيع المحاسب"><small>${esc(office.name||"مكتب المحاماة")}</small></div>`;
 const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");
 const voucher=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
 <title>${typeName}</title><style>
 body{font-family:Tahoma,Arial,sans-serif;margin:0;padding:25px;color:#222}
 .voucher{max-width:800px;margin:auto;border:2px solid #17365d;padding:28px}
 h1,h2{text-align:center;color:#17365d}.details{text-align:center;margin-bottom:15px}
 .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:16px 0}
 .amount{text-align:center;font-size:30px;font-weight:bold;margin:28px 0}
 .sign{display:flex;justify-content:space-between;align-items:flex-end;margin-top:80px}.signature-box{display:flex;flex-direction:column;align-items:center;min-width:220px;font-weight:bold}.signature-box img{width:190px;height:95px;object-fit:contain;margin:4px 0 -4px}.signature-box small{font-size:11px;color:#475569;font-weight:normal}
 @media print{body{padding:0}.voucher{border:2px solid #17365d}}
 </style></head><body>
 <div class="voucher">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1>
 <div class="details">${details}</div><h2>${typeName}</h2>
 <div class="meta">
 <div><b>رقم السند:</b> ${esc(t.id.slice(0,8).toUpperCase())}</div>
 <div><b>التاريخ:</b> ${esc(t.date||"")}</div>
 <div><b>البيان:</b> ${esc(t.desc)}</div>
 <div><b>اسم الموكل:</b> ${esc(t.client||"—")}</div>
 <div><b>الحساب:</b> ${accountName}</div>
 <div><b>ملاحظات:</b> ${esc(t.notes||"—")}</div></div>
 <div class="amount">${money(t.amount)}</div>
 <p style="text-align:center">تم تسجيل هذه العملية في نظام حسابات مكتب المحاماة.</p>
 <div class="sign"><span>توقيع المستلم: __________________</span>${signatureBlock}</div>
 </div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
 const w=window.open("","_blank","width=900,height=800");
 if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة لهذا الملف.");return}
 w.document.open();w.document.write(voucher);w.document.close();
}
function render(){
  const rows=getFilteredAccounts();
  $("caseBody").innerHTML=rows.length?rows.map((c,i)=>`
    <tr>
      <td>${data.indexOf(c)+1}</td><td>${esc(c.client)}</td><td>${esc(c.opponent)}</td>
      <td>${esc(c.caseNo)}</td><td>${esc(c.caseType)}</td><td>${c.contractDate||""}</td>
      <td>${money(c.fees)}</td><td>${money(c.advance)}</td><td>${money(c.payment)}</td>
      <td>${c.paymentDate||""}</td><td>${money(totalPaid(c))}</td><td class="balance">${money(balance(c))}</td>
      <td><div style="display:flex;gap:5px;flex-wrap:wrap"><button class="primary" type="button" onclick="editCase('${c.id}')">تعديل</button><button class="success" type="button" onclick="printCase('${c.id}')">طباعة</button><button class="danger" type="button" onclick="removeCase('${c.id}')">حذف</button></div></td>
    </tr>`).join(""):`<tr><td colspan="13" class="empty">لا توجد بيانات</td></tr>`;
  $("totalFees").textContent=money(data.reduce((s,c)=>s+num(c.fees),0));
  $("totalAdvance").textContent=money(data.reduce((s,c)=>s+num(c.advance),0));
  $("totalPayments").textContent=money(data.reduce((s,c)=>s+num(c.payment),0));
  $("totalBalance").textContent=money(data.reduce((s,c)=>s+balance(c),0));
  renderClients();
}
function renderClients(){
  const input=$("clientSearch");
  const q=normalizeArabicSearch(input ? input.value : "");
  const unique=new Map();

  data.forEach(c=>{
    const name=String(c.client||"").trim();
    if(!name)return;
    const key=normalizeArabicSearch(name);
    if(!key)return;
    if(!unique.has(key)) unique.set(key,name);
  });

  const clients=[...unique.values()]
    .filter(name=>!q || normalizeArabicSearch(name).includes(q))
    .sort((a,b)=>a.localeCompare(b,"ar"));

  const list=$("clientList");
  if(!list)return;

  list.innerHTML=clients.length?clients.map(name=>{
    const cs=data.filter(c=>String(c.client||"").trim()===name);
    const remaining=cs.reduce((s,c)=>s+balance(c),0);
    return `<div class="client-item ${selectedClient===name?"active":""}"
      data-client="${esc(name)}"
      onclick='selectClient(${JSON.stringify(name)})'>
      <b>${esc(name)}</b>
      <small>${cs.length} قضية — المتبقي: ${money(remaining)}</small>
    </div>`;
  }).join(""):`<div class="empty">لا يوجد موكلون</div>`;

  if(selectedClient && !clients.includes(selectedClient)){
    selectedClient=null;
    $("clientDetails").innerHTML='<div class="empty">اختر موكلاً لعرض شجرة حساباته وتفاصيل القضايا والدفعات.</div>';
  }else if(selectedClient){
    showClient(selectedClient);
  }
}

function selectClient(name){
  selectedClient=String(name||"").trim();
  if(!selectedClient)return;
  renderClients();
  showClient(selectedClient);
}

function showClient(name){
  const clientName=String(name||"").trim();
  const cs=data.filter(c=>String(c.client||"").trim()===clientName);
  const details=$("clientDetails");

  if(!details){
    console.error("عنصر clientDetails غير موجود.");
    return;
  }

  if(!cs.length){
    details.innerHTML='<div class="empty">لا توجد بيانات لهذا الموكل.</div>';
    return;
  }

  const fees=cs.reduce((s,c)=>s+num(c.fees),0);
  const paid=cs.reduce((s,c)=>s+totalPaid(c),0);
  const remaining=cs.reduce((s,c)=>s+balance(c),0);

  details.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h3 style="margin:0">شجرة حساب: ${esc(clientName)}</h3>
      <button class="primary" type="button" onclick="printSelectedClientRegister()">طباعة سجل حساب الموكل</button>
    </div>
    <p>
      <b>إجمالي الأتعاب:</b> ${money(fees)}
      &nbsp; | &nbsp; <b>إجمالي المسدد:</b> ${money(paid)}
      &nbsp; | &nbsp; <b>المتبقي:</b> ${money(remaining)}
    </p>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>القضية</th><th>نوع القضية</th><th>الخصم</th><th>الأتعاب</th>
        <th>المقدم</th><th>الدفعة</th><th>المسدّد</th><th>المتبقي</th><th>تاريخ السداد</th>
      </tr></thead>
      <tbody>${cs.map(c=>`<tr>
        <td>${esc(c.caseNo||"بدون رقم")}</td>
        <td>${esc(c.caseType||"")}</td>
        <td>${esc(c.opponent||"")}</td>
        <td>${money(c.fees)}</td>
        <td>${money(c.advance)}</td>
        <td>${money(c.payment)}</td>
        <td>${money(totalPaid(c))}</td>
        <td class="balance">${money(balance(c))}</td>
        <td>${esc(c.paymentDate||"")}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
let editingCaseId=null;
function resetCaseForm(){editingCaseId=null;$("caseForm").reset();$("fees").value=0;$("advance").value=0;const b=$("caseForm").querySelector('button[type="submit"]');if(b)b.textContent="إضافة الحساب";$("caseForm").querySelector("h2");}
function editCase(id){
 const c=data.find(x=>x.id===id);if(!c)return;
 editingCaseId=id;
 $("client").value=c.client||"";$("opponent").value=c.opponent||"";$("caseNo").value=c.caseNo||"";$("caseType").value=c.caseType||"";
 $("contractDate").value=c.contractDate||"";$("fees").value=num(c.fees);$("advance").value=num(c.advance);$("paymentDate").value=c.paymentDate||"";
 const b=$("caseForm").querySelector('button[type="submit"]');if(b)b.textContent="حفظ التعديلات";
 $("caseForm").scrollIntoView({behavior:"smooth",block:"start"});$("client").focus();
}
function printCase(id){
 const c=data.find(x=>x.id===id);if(!c){alert("لم يتم العثور على الحساب.");return}
 const logo=office.logo?`<img src="${office.logo}" style="max-width:75px;max-height:75px;display:block;margin:0 auto 8px">`:"";
 const details=[office.address,office.phone,office.email].filter(Boolean).map(esc).join(" | ");
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كشف حساب - ${esc(c.client)}</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#222}.head{text-align:center;border-bottom:2px solid #17365d;padding-bottom:12px}.head h1,h2{color:#17365d;text-align:center}.info{width:100%;border-collapse:collapse;margin-top:20px}.info th,.info td{border:1px solid #aaa;padding:10px;text-align:right}.info th{background:#eef2f7;width:25%}.total{margin-top:18px;font-weight:bold}@media print{@page{size:A4 portrait;margin:12mm}}</style></head><body><div class="head">${logo}<h1>${esc(office.name||"مكتب المحاماة")}</h1><div>${details}</div></div><h2>كشف حساب موكل / قضية</h2><table class="info"><tr><th>اسم الموكل</th><td>${esc(c.client)}</td></tr><tr><th>اسم الخصم</th><td>${esc(c.opponent||"—")}</td></tr><tr><th>رقم القضية</th><td>${esc(c.caseNo||"—")}</td></tr><tr><th>نوع القضية</th><td>${esc(c.caseType||"—")}</td></tr><tr><th>تاريخ التعاقد</th><td>${esc(c.contractDate||"—")}</td></tr><tr><th>تاريخ السداد</th><td>${esc(c.paymentDate||"—")}</td></tr><tr><th>أتعاب المحاماة</th><td>${money(c.fees)}</td></tr><tr><th>مقدم الأتعاب</th><td>${money(c.advance)}</td></tr><tr><th>الدفعات</th><td>${money(c.payment)}</td></tr><tr><th>إجمالي المسدد</th><td>${money(totalPaid(c))}</td></tr><tr><th>المتبقي</th><td>${money(balance(c))}</td></tr></table><p class="total">حرر هذا الكشف بناءً على البيانات المسجلة في النظام.</p><p style="margin-top:45px">توقيع المحاسب: ____________________</p><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
 const w=window.open("","_blank","width=900,height=800");if(!w){alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.");return}w.document.open();w.document.write(html);w.document.close();
}
$("caseForm").addEventListener("submit",e=>{
 e.preventDefault();
 const clientName=$("client").value.trim();
 if(!clientName){alert("أدخل اسم الموكل.");$("client").focus();return}
 const fields={client:clientName,opponent:$("opponent").value.trim(),caseNo:$("caseNo").value.trim(),caseType:$("caseType").value.trim(),contractDate:$("contractDate").value,fees:num($("fees").value),advance:num($("advance").value),paymentDate:$("paymentDate").value};
 if(editingCaseId){const c=data.find(x=>x.id===editingCaseId);if(c)Object.assign(c,fields);editingCaseId=null;alert("تم حفظ تعديلات الحساب بنجاح.");}
 else data.push({id:crypto.randomUUID(),...fields,payment:0});
 e.target.reset();$("fees").value=0;$("advance").value=0;const b=e.target.querySelector('button[type="submit"]');if(b)b.textContent="إضافة الحساب";save();
});
function removeCase(id){if(confirm("هل تريد حذف هذا الحساب؟")){data=data.filter(c=>c.id!==id);if(editingCaseId===id)resetCaseForm();save()}}
$("search").addEventListener("input",render);
$("accountDateFrom").addEventListener("change",render);
$("accountDateTo").addEventListener("change",render);
$("accountDateField").addEventListener("change",render);
$("clientSearch").addEventListener("input",()=>{selectedClient=null;renderClients();});
$("clearBtn").onclick=()=>{if(confirm("سيتم حذف جميع الحسابات نهائياً من هذا المتصفح. هل أنت متأكد؟")){data=[];selectedClient=null;save()}};
$("exportBtn").onclick=()=>{
 const blob=new Blob([JSON.stringify({cases:data,transactions,employees},null,2)],{type:"application/json"});
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="نسخة_احتياطية_حسابات_مكتب_المحاماة.json";a.click();URL.revokeObjectURL(a.href);
};
$("importFile").onchange=e=>{
 const f=e.target.files[0];if(!f)return;const r=new FileReader();
 r.onload=()=>{try{const x=JSON.parse(r.result);
   const importedCases=Array.isArray(x)?x:x.cases;
   if(!Array.isArray(importedCases))throw 0;
   if(confirm("استيراد البيانات سيستبدل البيانات الحالية. متابعة؟")){
     data=importedCases; transactions=Array.isArray(x.transactions)?x.transactions:[]; employees=Array.isArray(x.employees)?x.employees:[]; save()
   }
 }catch{alert("ملف غير صالح.")}};r.readAsText(f);e.target.value="";
};
const reportMonthInput=$("reportMonth"); if(reportMonthInput){reportMonthInput.value=new Date().toISOString().slice(0,7);}
render(); renderTransactions(); renderFinance(); renderEmployees(); renderMonthlyReport();

