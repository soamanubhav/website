const fmt = (n) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const STORAGE_KEY = 'cfp_dashboard_state_v1';
const THEME_KEY = 'theme';
const REMEMBERED_EMAIL_KEY = 'pfm_last_email';
let renderQueued = false;
let cloudSaveTimer = null;
let supabaseClient = null;
let currentUser = null;
let authSubscription = null;

const parseDateInput = (value) => {
  if (!value) return null;
  const v = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const cloudConfig = window.PFM_CLOUD_CONFIG || { url: '', anonKey: '', table: 'pfm_user_state' };
const state = {
  family: [], income: [],
  expenseMaster: [
    ["Housing & Utilities", "House rent"],["Housing & Utilities", "Home maintenance / society charges"],["Housing & Utilities", "Electricity bill"],["Housing & Utilities", "Water bill"],["Housing & Utilities", "Cooking gas (LPG / PNG)"],["Housing & Utilities", "Internet / broadband"],["Housing & Utilities", "Mobile phone bill / recharge"],["Housing & Utilities", "Cable / DTH / OTT subscriptions"],["Food & Groceries", "Monthly groceries"],["Food & Groceries", "Milk & dairy supplies"],["Food & Groceries", "Vegetables & fruits"],["Food & Groceries", "Cooking oil & staples"],["Food & Groceries", "Eating out / food delivery"],["Food & Groceries", "Snacks & beverages"],["Transportation", "Fuel (petrol / diesel / EV charging)"],["Transportation", "Public transport pass"],["Transportation", "Auto / taxi / cab"],["Transportation", "Parking fees"],["Transportation", "Toll charges"],["Child & Education", "School fees (monthly / averaged)"],["Child & Education", "Tuition / coaching classes"],["Child & Education", "School transport / bus fees"],["Child & Education", "Books & stationery"],["Child & Education", "Uniforms (monthly average)"],["Child & Education", "Online classes / learning apps"],["Child & Education", "Extracurricular activities"],["Child & Education", "Daycare / creche fees"],["Personal Care & Household", "Toiletries & personal care"],["Personal Care & Household", "Laundry / dry cleaning"],["Personal Care & Household", "Cleaning supplies"],["Personal Care & Household", "Household replacements"],["Personal Care & Household", "Salon / grooming"],["Health & Wellness", "Medicines"],["Health & Wellness", "Doctor consultations"],["Health & Wellness", "Diagnostic tests (average)"],["Health & Wellness", "Health insurance premium (monthly share)"],["Health & Wellness", "Gym / yoga / fitness"],["Work, Learning & Communication", "Work internet usage"],["Work, Learning & Communication", "Office supplies"],["Work, Learning & Communication", "Professional courses"],["Work, Learning & Communication", "Books / reading material"],["Entertainment & Lifestyle", "Movies / outings"],["Entertainment & Lifestyle", "Streaming & app subscriptions"],["Entertainment & Lifestyle", "Hobbies & recreation"],["Entertainment & Lifestyle", "Clothing"],["Financial Obligations", "Insurance premiums (life / vehicle – monthly share)"],["Financial Obligations", "Bank charges & fees"],["Household Support & Services", "Maid / cook / domestic help"],["Household Support & Services", "Driver salary"],["Household Support & Services", "Technician & service visits"],["Household Support & Services", "Minor repairs & maintenance"],["Social, Religious & Personal", "Donations / charity"],["Social, Religious & Personal", "Religious offerings"],["Social, Religious & Personal", "Gifts (routine)"],["Social, Religious & Personal", "Personal discretionary spending"]
  ],
  expenseValues: Array(55).fill(0),
  loanMaster: ["Home Loan","Car Loan","Personal Loan","Education Loan","Gold Loan","Loan Against Property (LAP)","Business Loan","Credit Card Outstanding","Consumer Durable Loan","Other Loans"],
  loanData: Array(10).fill(0).map(() => ({ amount: 0, emi: 0, endDate: todayISO(), yearsLeft: 0 })),
  goalMaster: ["Buying Home","Upgrading to bigger home","Buying another home","Personal renovation","Child education","Higher education","Spouse personal requirement","Child Birth Planning","Self wedding Planning","Childs wedding planning","Buying a car","Buying a Two wheeler","Emergency fund","Medical Emergency","Parents Medical care","Retirement corpus","Early retirement","Post-retirement healthcare","Passive income generation","Starting a business"],
  goalData: Array(20).fill(0).map(() => ({ present: 0, years: 0, future: 0 })),
  lumpsumIn: [], lumpsumOut: [], inflation: 0.05, annualReturn: 0.12, currentAge: 30, retirementAge: 60, startCorpus: 0, sipAmount: 0,
};

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
    renderAll();
  });
}

function setStatus(message, type = 'muted-text') {
  const el = document.getElementById('auth_status');
  if (!el) return;
  el.className = `status-text ${type}`;
  el.textContent = message;
}

function syncAuthControls() {
  const signedIn = Boolean(currentUser);
  const signOutBtn = document.getElementById('sign_out_btn');
  const syncNowBtn = document.getElementById('sync_now_btn');
  const openAuthModalBtn = document.getElementById('open_auth_modal');
  if (signOutBtn) signOutBtn.disabled = !signedIn;
  if (syncNowBtn) syncNowBtn.disabled = !signedIn;
  if (openAuthModalBtn) openAuthModalBtn.textContent = signedIn ? 'Switch Account' : 'Sign In / Sign Up';
}

function closeAuthModal() {
  const modal = document.getElementById('auth_modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function initSupabase() {
  if (!cloudConfig.url || !cloudConfig.anonKey || !window.supabase?.createClient) {
    setStatus('Supabase not configured yet. Add credentials in pfm.config.js to enable per-user login and sync.', 'muted-text');
    return;
  }
  supabaseClient = window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey);
}

async function loadCloudState() {
  if (!supabaseClient || !currentUser) return;

  const metadataState = currentUser.user_metadata?.pfm_state;
  if (metadataState && typeof metadataState === 'object') {
    Object.assign(state, metadataState);
    renderAll(false);
    setStatus(`Signed in as ${currentUser.email}. Cloud sync ready.`, 'success');
    return;
  }

  if (!cloudConfig.table) {
    setStatus(`Signed in as ${currentUser.email}. Cloud sync ready.`, 'success');
    return;
  }

  const { data, error } = await supabaseClient
    .from(cloudConfig.table)
    .select('state_json')
    .eq('user_id', currentUser.id)
    .maybeSingle();
  if (error) {
    setStatus(`Cloud load warning: ${error.message}`, 'error');
    return;
  }
  if (data?.state_json) {
    Object.assign(state, data.state_json);
    renderAll(false);
  }
  setStatus(`Signed in as ${currentUser.email}. Cloud sync ready.`, 'success');
}

async function saveCloudState() {
  if (!supabaseClient || !currentUser) return;

  const mergedData = { ...(currentUser.user_metadata || {}), pfm_state: state, pfm_updated_at: new Date().toISOString() };
  const { data: updatedUser, error: authError } = await supabaseClient.auth.updateUser({ data: mergedData });
  if (authError) {
    setStatus(`Cloud save failed: ${authError.message}`, 'error');
    return;
  }
  currentUser = updatedUser?.user || currentUser;

  if (cloudConfig.table) {
    const payload = { user_id: currentUser.id, email: currentUser.email, state_json: state, updated_at: new Date().toISOString() };
    const { error: tableError } = await supabaseClient.from(cloudConfig.table).upsert(payload, { onConflict: 'user_id' });
    if (tableError) {
      setStatus(`Synced auth profile. Table mirror warning: ${tableError.message}`, 'muted-text');
      return;
    }
  }

  setStatus(`Synced to cloud for ${currentUser.email}.`, 'success');
}

function queueCloudSave() {
  if (!currentUser || !supabaseClient) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => { saveCloudState(); }, 700);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSave();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved && typeof saved === 'object') Object.assign(state, saved);
  } catch (_) {}
}

function activeTab(){ return document.querySelector('.tab.active')?.dataset.tab || 'profile'; }
function bindTabs(){ document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{ document.querySelectorAll('.tab,.panel').forEach(el=>el.classList.remove('active')); btn.classList.add('active'); document.getElementById(btn.dataset.tab).classList.add('active'); renderAll(false); }); }

function setupGlobalActions() {
  document.getElementById('export_state').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `client-financial-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('import_state').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (imported && typeof imported === 'object') {
        Object.assign(state, imported);
        renderAll();
      }
    } catch (_) { alert('Invalid JSON file.'); }
  };
  document.getElementById('reset_state').onclick = () => {
    if (!confirm('Reset all dashboard data?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };
}

async function refreshAuthState() {
  if (!supabaseClient) return;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    currentUser = null;
    syncAuthControls();
    setStatus(`Authentication check failed: ${error.message}`, 'error');
    return;
  }
  currentUser = data?.session?.user || null;
  syncAuthControls();
  if (currentUser) {
    setStatus(`Signed in as ${currentUser.email}.`, 'success');
    await loadCloudState();
  } else {
    setStatus('First time here? Use Sign Up once. After that, sign in with the same email and password.', 'muted-text');
  }
}



function rememberEmail(email) {
  if (!email) return;
  localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
}

function hydrateRememberedEmail() {
  const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
  const emailInput = document.getElementById('auth_email');
  if (emailInput && remembered && !emailInput.value) emailInput.value = remembered;
}

function setupAuthModal() {
  const modal = document.getElementById('auth_modal');
  const openBtn = document.getElementById('open_auth_modal');
  const closeBtn = document.getElementById('close_auth_modal');
  if (!modal || !openBtn || !closeBtn) return;
  const close = () => { closeAuthModal(); };
  const open = () => { hydrateRememberedEmail(); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); };
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}


function authInputValues() {
  const email = document.getElementById('auth_email').value.trim();
  const password = document.getElementById('auth_password').value;
  return { email, password };
}

function setupAuthActions() {
  document.getElementById('sign_in_btn')?.addEventListener('click', async () => {
    if (!supabaseClient) return setStatus('Supabase is not configured on this page.', 'error');
    const { email, password } = authInputValues();
    if (!email || !password) return setStatus('Enter both email and password.', 'error');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return setStatus(error.message, 'error');
    rememberEmail(email);
    document.getElementById('auth_password').value = '';
    closeAuthModal();
    await refreshAuthState();
  });
  document.getElementById('sign_up_btn')?.addEventListener('click', async () => {
    if (!supabaseClient) return setStatus('Supabase is not configured on this page.', 'error');
    const { email, password } = authInputValues();
    if (!email || !password) return setStatus('Enter both email and password.', 'error');
    if (password.length < 6) return setStatus('Password must be at least 6 characters.', 'error');
    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.href
      }
    });
    if (error) return setStatus(error.message, 'error');
    rememberEmail(email);
    document.getElementById('auth_password').value = '';
    closeAuthModal();
    setStatus('Account created in Supabase Auth. Use the same email/password next time to sign in.', 'success');
    await refreshAuthState();
  });
  document.getElementById('sign_out_btn')?.addEventListener('click', async () => {
    if (!supabaseClient) return setStatus('Supabase is not configured on this page.', 'error');
    await supabaseClient.auth.signOut();
    currentUser = null;
    setStatus('Signed out. Local data remains on this browser unless you reset it.', 'muted-text');
  });
  document.getElementById('sync_now_btn')?.addEventListener('click', async () => {
    if (!currentUser || !supabaseClient) return setStatus('Sign in first to sync.', 'error');
    await saveCloudState();
  });

  document.getElementById('magic_link_btn')?.addEventListener('click', async () => {
    if (!supabaseClient) return setStatus('Supabase is not configured on this page.', 'error');
    const { email } = authInputValues();
    if (!email) return setStatus('Enter your email address to receive a magic link.', 'error');
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.href
      }
    });
    if (error) return setStatus(error.message, 'error');
    rememberEmail(email);
    setStatus('Magic link sent. Check your email to complete sign in or sign up.', 'success');
  });
  authSubscription = supabaseClient?.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    syncAuthControls();
    if (currentUser) {
      setStatus(`Signed in as ${currentUser.email}.`, 'success');
      loadCloudState();
    } else {
      setStatus('First time here? Use Sign Up once. After that, sign in with the same email and password.', 'muted-text');
    }
  });
}

const num=(id)=>Number(document.getElementById(id)?.value||0);
const plotLayout = (title, extra = {}) => ({
  title, paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{color:getComputedStyle(document.documentElement).getPropertyValue('--text').trim()},
  legend:{bgcolor:'rgba(0,0,0,0)'}, margin:{t:50,b:30,l:30,r:30}, ...extra
});

function renderProfile(){
  const totalIncome = state.income.reduce((a,b)=>a+b.income,0), monthlyIncome = totalIncome/12;
  const totalExpense = state.expenseValues.reduce((a,b)=>a+Number(b||0),0);
  const totalEmi = state.loanData.reduce((a,b)=>a+Number(b.emi||0),0);
  const net = monthlyIncome-totalExpense-totalEmi;
  const expenseGroups = state.expenseMaster.reduce((acc, [cat, sub], i) => { if (!acc[cat]) acc[cat] = []; acc[cat].push({ sub, i }); return acc; }, {});
  const expenseSections = Object.entries(expenseGroups).map(([cat, rows]) => {
    const subtotal = rows.reduce((a, r) => a + Number(state.expenseValues[r.i] || 0), 0);
    return `<details class='exp-group' ${subtotal > 0 ? "open" : ""}><summary>${cat} — ${fmt(subtotal)}</summary><table class='table'><tr><th>Subcategory</th><th>Amount</th></tr>${rows.map(r => `<tr><td>${r.sub}</td><td><input type='number' data-exp='${r.i}' step='500' value='${state.expenseValues[r.i]}'></td></tr>`).join('')}</table></details>`;
  }).join('');
  const p = document.getElementById('profile');
  p.innerHTML = `<div class='card'><h3>Family Profile</h3><div class='grid g4'><input id='f_name' placeholder='Name'><select id='f_rel'><option>Head</option><option>Spouse</option><option>Son</option><option>Daughter</option></select><input id='f_dob' type='text' placeholder='YYYY-MM-DD or DD/MM/YYYY'><select id='f_gender'><option>Male</option><option>Female</option></select></div><div style='margin-top:8px'><button class='primary' id='add_family'>Add Family Member</button></div><table class='table'><tr><th>Name</th><th>Relation</th><th>DOB</th><th>Age</th><th>Gender</th><th></th></tr>${state.family.map((r,i)=>`<tr><td>${r.name}</td><td>${r.relation}</td><td>${r.dob||''}</td><td>${r.age}</td><td>${r.gender}</td><td><button data-del-family='${i}'>❌</button></td></tr>`).join('')}</table></div>
  <div class='card'><h3>Earning Members</h3><div class='grid g4'><select id='i_member'>${state.family.length ? state.family.map((f, i) => `<option value='${i}'>${f.name} (${f.relation})</option>`).join('') : "<option value=''>Add family members first</option>"}</select><input id='i_age' type='number' min='18' max='100' placeholder='Age' value='${state.family[0]?.age ?? ""}' readonly><input id='i_income' type='number' step='5000' placeholder='Annual Income'><button class='primary' id='add_income' ${state.family.length ? "" : "disabled"}>Add Income</button></div><table class='table'><tr><th>Name</th><th>Age</th><th>Income</th><th></th></tr>${state.income.map((r,i)=>`<tr><td>${r.name}</td><td>${r.age}</td><td>${fmt(r.income)}</td><td><button data-del-income='${i}'>❌</button></td></tr>`).join('')}</table><div class='metric'><h4>Total Annual Income</h4><p>${fmt(totalIncome)}</p></div></div>
  <div class='card'><h3>Monthly Expenses</h3>${expenseSections}<div class='metric'><h4>Total Monthly Expenses</h4><p>${fmt(totalExpense)}</p></div></div>
  <div class='card'><h3>Current Loans</h3><table class='table'><tr><th>Loan</th><th>Amount</th><th>EMI</th><th>End Date</th><th>Years Left</th></tr>${state.loanMaster.map((l,i)=>`<tr><td>${l}</td><td><input type='number' step='10000' data-loan-amt='${i}' value='${state.loanData[i].amount}'></td><td><input type='number' step='1000' data-loan-emi='${i}' value='${state.loanData[i].emi}'></td><td><input type='text' data-loan-date='${i}' placeholder='YYYY-MM-DD / DD/MM/YYYY' value='${state.loanData[i].endDate}'></td><td>${state.loanData[i].yearsLeft.toFixed(1)} yrs</td></tr>`).join('')}</table><div class='grid g2'><div class='metric'><h4>Total Loan Outstanding</h4><p>${fmt(state.loanData.reduce((a,b)=>a+b.amount,0))}</p></div><div class='metric'><h4>Total Monthly EMI</h4><p>${fmt(totalEmi)}</p></div></div></div>
  <div class='card'><h3>Scenario Planning Tiles</h3><div class='grid g4'><div class='metric'><h4>Income</h4><p>${fmt(monthlyIncome)}</p></div><div class='metric'><h4>Expenses</h4><p>${fmt(totalExpense)}</p></div><div class='metric'><h4>EMI</h4><p>${fmt(totalEmi)}</p></div><div class='metric'><h4>Net Income</h4><p>${fmt(net)}</p></div></div><p class='${net>=0?'success':'error'}'>Net Monthly Savings: ${fmt(net)}</p></div>
  <div class='chart-grid'><div class='chart'><h4>Income Utilization</h4><div id='c_income'></div></div><div class='chart'><h4>Expense Distribution</h4><div id='c_exp'></div></div><div class='chart'><h4>EMI Distribution</h4><div id='c_emi'></div></div></div>`;

  document.getElementById('add_family').onclick=()=>{ const name=document.getElementById('f_name').value.trim(); if(!name)return; const dob=document.getElementById('f_dob').value.trim(); const dobDate = parseDateInput(dob); state.family.push({name, relation:document.getElementById('f_rel').value, dob, age: dobDate ? new Date().getFullYear()-dobDate.getFullYear():0, gender:document.getElementById('f_gender').value}); renderAll(); };
  document.querySelectorAll('[data-del-family]').forEach(b=>b.onclick=()=>{ state.family.splice(Number(b.dataset.delFamily),1); renderAll(); });
  const memberSelect = document.getElementById('i_member');
  const ageInput = document.getElementById('i_age');
  if (memberSelect) memberSelect.onchange = () => { const idx = Number(memberSelect.value); ageInput.value = Number.isInteger(idx) && state.family[idx] ? state.family[idx].age : ''; };
  document.getElementById('add_income').onclick=()=>{ const idx = Number(document.getElementById('i_member').value); if (!Number.isInteger(idx) || !state.family[idx]) return; const familyMember = state.family[idx]; const income=num('i_income'); state.income.push({name: familyMember.name, age: familyMember.age, income}); renderAll(); };
  document.querySelectorAll('[data-del-income]').forEach(b=>b.onclick=()=>{ state.income.splice(Number(b.dataset.delIncome),1); renderAll(); });
  document.querySelectorAll('[data-exp]').forEach(i=>i.onchange=()=>{ state.expenseValues[Number(i.dataset.exp)] = Math.max(0, Number(i.value||0)); renderAll(); });
  document.querySelectorAll('[data-loan-amt]').forEach(i=>i.onchange=()=>{ state.loanData[Number(i.dataset.loanAmt)].amount=Math.max(0, Number(i.value||0)); renderAll(); });
  document.querySelectorAll('[data-loan-emi]').forEach(i=>i.onchange=()=>{ state.loanData[Number(i.dataset.loanEmi)].emi=Math.max(0, Number(i.value||0)); renderAll(); });
  document.querySelectorAll('[data-loan-date]').forEach(i=>i.onchange=()=>{ const idx=Number(i.dataset.loanDate); state.loanData[idx].endDate=i.value.trim(); const parsed = parseDateInput(i.value); const d = parsed ? (parsed - new Date())/(1000*60*60*24) : 0; state.loanData[idx].yearsLeft=Math.max(0,Math.round((d/365)*10)/10); renderAll(); });

  Plotly.newPlot('c_income',[{type:'pie',labels:['Expenses','EMI','Savings'],values:[totalExpense,totalEmi,Math.max(0,net)],hole:.62,marker:{colors:['#ff5ca8','#8b5cf6','#00ffa3']},textfont:{color:getComputedStyle(document.documentElement).getPropertyValue('--text').trim()},textinfo:'label+percent',pull:[0.04,0.06,0.03]}],plotLayout('', {showlegend:true}), {displayModeBar:false, responsive:true});
  const catMap={}; state.expenseMaster.forEach((r,i)=>catMap[r[0]]=(catMap[r[0]]||0)+Number(state.expenseValues[i]||0));
  const cats=Object.keys(catMap).filter(k=>catMap[k]>0);
  Plotly.newPlot('c_exp',[{type:'pie',labels:cats.length ? cats : ['No expenses'],values:cats.length ? cats.map(c=>catMap[c]) : [1],hole:.62,textfont:{color:getComputedStyle(document.documentElement).getPropertyValue('--text').trim()},textinfo:'percent+label',marker:{line:{color:'rgba(0,0,0,0)',width:0}}}],plotLayout(''), {displayModeBar:false, responsive:true});
  const emi = state.loanMaster.map((l,i)=>({loan:l,emi:state.loanData[i].emi})).filter(x=>x.emi>0);
  Plotly.newPlot('c_emi',[{type:'pie',labels:emi.length ? emi.map(x=>x.loan) : ['No EMI'],values:emi.length ? emi.map(x=>x.emi) : [1],hole:.62,textfont:{color:getComputedStyle(document.documentElement).getPropertyValue('--text').trim()},textinfo:'label+percent',marker:{line:{color:'rgba(0,0,0,0)',width:0}}}],plotLayout(''), {displayModeBar:false, responsive:true});
}

function buildAnalysis(){
  const monthlyIncome = state.income.reduce((a,b)=>a+b.income,0)/12;
  const monthlySavings = monthlyIncome - state.expenseValues.reduce((a,b)=>a+Number(b||0),0) - state.loanData.reduce((a,b)=>a+Number(b.emi||0),0);
  const monthlyReturn = state.annualReturn/12;
  const rows = state.goalMaster.map((g,i)=>{ const d=state.goalData[i]; const future=(d.present>0&&d.years>0)?Math.round(d.present*((1+state.inflation)**d.years)):0; d.future=future; const m=d.years*12; const sip=(future>0&&m>0)?Math.round(future*monthlyReturn/(((1+monthlyReturn)**m)-1)):0; return {Goal:g, present:d.present, years:d.years, future, sip}; });
  const totalSip=rows.reduce((a,b)=>a+b.sip,0); return {rows,totalSip,monthlySavings};
}

function renderGoals(){
  const {rows,totalSip,monthlySavings}=buildAnalysis();
  const g = document.getElementById('goals');
  const gap = monthlySavings-totalSip;
  g.innerHTML = `<div class='card'><h3>Personal Financial Goals Planning</h3><div class='grid g3'><label>Inflation Assumption (%)<input id='infl' type='number' step='0.1' value='${state.inflation*100}'></label><label>Current Age<input id='cur_age' type='number' min='18' max='100' value='${state.currentAge}'></label><label>Retirement Age<input id='ret_age' type='number' min='${state.currentAge}' max='100' value='${state.retirementAge}'></label></div><p>Remaining Years to Retirement: ${state.retirementAge-state.currentAge} years</p></div>
  <div class='card'><h3>Goal Details</h3><table class='table'><tr><th>Goal</th><th>Amount Today</th><th>Timeline (Years)</th><th>Future Value</th></tr>${state.goalMaster.map((goal,i)=>`<tr><td>${goal}</td><td><input type='number' step='50000' data-goal-amt='${i}' value='${state.goalData[i].present}'></td><td><input type='number' step='1' min='0' data-goal-yrs='${i}' value='${state.goalData[i].years}'></td><td>${fmt(rows[i].future)}</td></tr>`).join('')}</table><div class='grid g2'><div class='metric'><h4>Total Amount Today</h4><p>${fmt(rows.reduce((a,b)=>a+b.present,0))}</p></div><div class='metric'><h4>Total Future Value</h4><p>${fmt(rows.reduce((a,b)=>a+b.future,0))}</p></div></div></div>
  <div class='card'><h3>Goal Funding & SIP Analysis</h3><label>Expected Investment Return (%)<input id='ann_return' type='number' step='0.1' value='${state.annualReturn*100}'></label><table class='table'><tr><th>Goal</th><th>Amount Today</th><th>Years</th><th>Inflated Value</th><th>Monthly SIP Needed</th></tr>${rows.map(r=>`<tr><td>${r.Goal}</td><td>${fmt(r.present)}</td><td>${r.years}</td><td>${fmt(r.future)}</td><td>${fmt(r.sip)}</td></tr>`).join('')}</table><div class='grid g3'><div class='metric'><h4>Total Current Cost</h4><p>${fmt(rows.reduce((a,b)=>a+b.present,0))}</p></div><div class='metric'><h4>Total Future Cost</h4><p>${fmt(rows.reduce((a,b)=>a+b.future,0))}</p></div><div class='metric'><h4>Total Monthly SIP Required</h4><p>${fmt(totalSip)}</p></div></div></div>
  <div class='card'><h3>SIP vs Current Monthly Savings</h3><div class='grid g2'><div class='metric'><h4>Available Monthly Savings</h4><p>${fmt(monthlySavings)}</p></div><div class='metric'><h4>SIP Gap / Surplus</h4><p>${fmt(gap)}</p></div></div><p class='${gap>=0?'success':'error'}'>${gap>=0?'Current savings are sufficient to fund all goals.':'Savings are insufficient. Increase income, reduce expenses, or extend timelines.'}</p></div>
  <div class='card'><h3>Goal Visualization Dashboard</h3><div class='grid g2'><div id='g_pie'></div><div id='g_bar'></div></div><div id='g_area'></div></div>
  <div class='card'><h3>Year-wise SIP Requirement Schedule</h3><div id='year_wrap'></div></div>`;

  document.getElementById('infl').onchange=()=>{state.inflation=Math.max(0, Number(document.getElementById('infl').value||5))/100; renderAll();};
  document.getElementById('ann_return').onchange=()=>{state.annualReturn=Math.max(0, Number(document.getElementById('ann_return').value||12))/100; renderAll();};
  document.getElementById('cur_age').onchange=()=>{state.currentAge=Number(document.getElementById('cur_age').value||30); renderAll();};
  document.getElementById('ret_age').onchange=()=>{state.retirementAge=Number(document.getElementById('ret_age').value||60); renderAll();};
  document.querySelectorAll('[data-goal-amt]').forEach(i=>i.onchange=()=>{state.goalData[Number(i.dataset.goalAmt)].present=Math.max(0, Number(i.value||0)); renderAll();});
  document.querySelectorAll('[data-goal-yrs]').forEach(i=>i.onchange=()=>{state.goalData[Number(i.dataset.goalYrs)].years=Math.max(0, Number(i.value||0)); renderAll();});

  const nz=rows.filter(r=>r.future>0);
  Plotly.newPlot('g_pie',[{type:'pie',labels:nz.length ? nz.map(r=>r.Goal) : ['No goals'],values:nz.length ? nz.map(r=>r.future) : [1],hole:.66,textinfo:'percent+label',textfont:{color:getComputedStyle(document.documentElement).getPropertyValue('--text').trim()},marker:{line:{color:'rgba(0,0,0,0)',width:0}}}],plotLayout('Future Corpus Allocation by Goal', {height:380}), {displayModeBar:false, responsive:true});
  Plotly.newPlot('g_bar',[{type:'bar',y:nz.map(r=>r.Goal),x:nz.map(r=>r.sip),orientation:'h',marker:{color:'#5b8fff'}}],plotLayout('Monthly SIP Burden by Goal', {height:380, xaxis:{gridcolor:'rgba(0,0,0,0)'}, yaxis:{gridcolor:'rgba(0,0,0,0)'}}), {displayModeBar:false, responsive:true});
  const sorted=[...rows].sort((a,b)=>a.years-b.years); let c=0; const cum=sorted.map(r=>{c+=r.future;return c;});
  Plotly.newPlot('g_area',[{type:'scatter',mode:'lines+markers',fill:'tozeroy',x:sorted.map(r=>r.years),y:cum,line:{color:'#7fffcf',width:3},marker:{color:'#5b8fff'},fillcolor:'rgba(127,255,207,0.18)'}],plotLayout('Cumulative Corpus Required Over Time', {height:340, xaxis:{gridcolor:'rgba(0,0,0,0)'}, yaxis:{gridcolor:'rgba(0,0,0,0)'}}), {displayModeBar:false, responsive:true});

  const maxYear=Math.max(...rows.map(r=>r.years));
  const yw=document.getElementById('year_wrap');
  if(maxYear>0){ const yrows=[]; for(let y=1;y<=maxYear;y++){ const sip=rows.filter(r=>r.years>=y).reduce((a,b)=>a+b.sip,0); yrows.push({y,active:rows.filter(r=>r.years>=y).length,sip}); }
    yw.innerHTML=`<table class='table'><tr><th>Year</th><th>Active Goals</th><th>Total Monthly SIP</th><th>Annual Investment</th></tr>${yrows.map(r=>`<tr><td>${r.y}</td><td>${r.active}</td><td>${fmt(r.sip)}</td><td>${fmt(r.sip*12)}</td></tr>`).join('')}</table><div id='y_bar'></div>`;
    Plotly.newPlot('y_bar',[{type:'bar',x:yrows.map(r=>r.y),y:yrows.map(r=>r.sip),marker:{color:'#c8a96e'}}],plotLayout('Year-wise Monthly SIP Burden', {height:330, xaxis:{gridcolor:'rgba(0,0,0,0)'}, yaxis:{gridcolor:'rgba(0,0,0,0)'}}), {displayModeBar:false, responsive:true});
  } else yw.innerHTML='<p>Enter at least one goal with timeline to see the schedule.</p>';
}

function renderPlanning(){
  const {rows,totalSip}=buildAnalysis();
  const years=Math.max(1,state.retirementAge-state.currentAge);
  const annualSip = (state.sipAmount || totalSip) * 12;
  let wealth = state.startCorpus, proj=[];
  for(let y=1;y<=years;y++){ const inf=state.lumpsumIn.filter(x=>x.year===y).reduce((a,b)=>a+b.amount,0); const out=state.lumpsumOut.filter(x=>x.year===y).reduce((a,b)=>a+b.amount,0); const op=wealth; wealth=wealth*(1+state.annualReturn)+annualSip+inf-out; proj.push({y,opening:op,sip:annualSip,inflow:inf,outflow:out,closing:wealth}); }
  const pl=document.getElementById('planning');
  const final=proj.at(-1)?.closing || 0, totalGoal=rows.reduce((a,b)=>a+b.future,0), ret=rows.filter(r=>r.Goal.toLowerCase().includes('retirement')).reduce((a,b)=>a+b.future,0);
  pl.innerHTML = `<div class='card'><h3>Financial Planning & Portfolio Simulator</h3><div class='grid g4'><label>Current Investment Corpus<input id='start_corpus' type='number' step='100000' value='${state.startCorpus}'></label><label>Expected Annual Return (%)<input id='plan_ret' type='number' step='0.1' value='${state.annualReturn*100}'></label><label>Monthly SIP (From Goals)<input id='plan_sip' type='number' step='1000' value='${state.sipAmount || totalSip}'></label><div class='metric'><h4>Available Monthly Savings</h4><p>${fmt(state.income.reduce((a,b)=>a+b.income,0)/12 - state.expenseValues.reduce((a,b)=>a+b,0)- state.loanData.reduce((a,b)=>a+b.emi,0))}</p></div></div></div>
  <div class='card'><h3>Lumpsum Additions</h3><div class='grid g4'><input id='in_year' type='number' min='1' max='${years}' value='1'><input id='in_amt' type='number' step='100000' placeholder='Amount'><input id='in_label' placeholder='Source'><button class='primary' id='add_in'>Add Inflow</button></div>${state.lumpsumIn.length?`<table class='table'><tr><th>Year</th><th>Amount</th><th>Source</th></tr>${state.lumpsumIn.map(x=>`<tr><td>${x.year}</td><td>${fmt(x.amount)}</td><td>${x.label||''}</td></tr>`).join('')}</table>`:''}</div>
  <div class='card'><h3>Lumpsum Withdrawals</h3><div class='grid g4'><input id='out_year' type='number' min='1' max='${years}' value='1'><input id='out_amt' type='number' step='100000' placeholder='Amount'><input id='out_label' placeholder='Purpose'><button class='primary' id='add_out'>Add Withdrawal</button></div>${state.lumpsumOut.length?`<table class='table'><tr><th>Year</th><th>Amount</th><th>Purpose</th></tr>${state.lumpsumOut.map(x=>`<tr><td>${x.year}</td><td>${fmt(x.amount)}</td><td>${x.label||''}</td></tr>`).join('')}</table>`:''}</div>
  <div class='card'><h3>Portfolio Growth Projection</h3><table class='table'><tr><th>Year</th><th>Opening Corpus</th><th>SIP</th><th>Lumpsum In</th><th>Lumpsum Out</th><th>Closing Corpus</th></tr>${proj.map(r=>`<tr><td>${r.y}</td><td>${fmt(r.opening)}</td><td>${fmt(r.sip)}</td><td>${fmt(r.inflow)}</td><td>${fmt(r.outflow)}</td><td>${fmt(r.closing)}</td></tr>`).join('')}</table></div>
  <div class='card'><h3>Wealth & Cashflow Charts</h3><div class='grid g2'><div id='p_line'></div><div id='p_bar'></div></div></div>
  <div class='card'><h3>Goal & Retirement Readiness</h3><div class='grid g3'><div class='metric'><h4>Total Goal Corpus</h4><p>${fmt(totalGoal)}</p></div><div class='metric'><h4>Retirement Target</h4><p>${fmt(ret)}</p></div><div class='metric'><h4>Projected Corpus</h4><p>${fmt(final)}</p></div></div><p class='${final>=totalGoal?'success':'error'}'>${final>=totalGoal?'All financial goals including retirement are funded.':`Shortfall of ${fmt(totalGoal-final)}. Increase SIP or delay goals.`}</p></div>`;

  document.getElementById('start_corpus').onchange=()=>{state.startCorpus=Math.max(0, num('start_corpus')); renderAll();};
  document.getElementById('plan_ret').onchange=()=>{state.annualReturn=Math.max(0, num('plan_ret'))/100; renderAll();};
  document.getElementById('plan_sip').onchange=()=>{state.sipAmount=Math.max(0, num('plan_sip')); renderAll();};
  document.getElementById('add_in').onclick=()=>{state.lumpsumIn.push({year:num('in_year'),amount:Math.max(0, num('in_amt')),label:document.getElementById('in_label').value}); renderAll();};
  document.getElementById('add_out').onclick=()=>{state.lumpsumOut.push({year:num('out_year'),amount:Math.max(0, num('out_amt')),label:document.getElementById('out_label').value}); renderAll();};
  Plotly.newPlot('p_line',[{type:'scatter',mode:'lines+markers',x:proj.map(x=>x.y),y:proj.map(x=>x.closing),line:{color:'#7fffcf',width:3},marker:{size:7,color:'#5b8fff'}}],plotLayout('Projected Portfolio Value', {height:340, xaxis:{gridcolor:'rgba(0,0,0,0)'}, yaxis:{gridcolor:'rgba(0,0,0,0)'}}), {displayModeBar:false, responsive:true});
  Plotly.newPlot('p_bar',[{type:'bar',x:proj.map(x=>x.y),y:proj.map(x=>x.sip+x.inflow-x.outflow),marker:{color:'#c8a96e'}}],plotLayout('Year-wise Net Investment', {height:340, xaxis:{gridcolor:'rgba(0,0,0,0)'}, yaxis:{gridcolor:'rgba(0,0,0,0)'}}), {displayModeBar:false, responsive:true});
}

function renderAll(shouldSave = true){
  if (shouldSave) saveState();
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const tab = activeTab();
    if (tab === 'profile') renderProfile();
    if (tab === 'goals') renderGoals();
    if (tab === 'planning') renderPlanning();
  });
}

(async function init() {
  initTheme();
  loadState();
  bindTabs();
  setupGlobalActions();
  setupAuthModal();
  initSupabase();
  setupAuthActions();
  await refreshAuthState();
  syncAuthControls();
  renderAll(false);
})();
