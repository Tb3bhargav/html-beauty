// ----- state & helpers -----
const LS_TOKEN='aura_token', LS_CART='aura_cart', LS_WISH='aura_wishlist', LS_USER='aura_user';
let productsCache=[], currentFilter='all', currentSearch='', cartState={items:[], total:0, count:0}, wishlistSet=new Set(JSON.parse(localStorage.getItem(LS_WISH)||'[]'));
let authTab='login';
let accountUser=null, accountOrders=[], accountTab='profile', editingAddrIdx=null;
let selectedAddressIdx=0, checkoutInlineOpen=false;
let productsController=null;
function safeUrl(u){ const s=String(u||''); if(!s.startsWith('http://')&&!s.startsWith('https://')) return 'https://via.placeholder.com/600'; if(s.includes('images.unsplash.com') && !s.includes('auto=format')) return s.replace('&fit=crop','&auto=format&fit=crop').replace('?fit=crop','?auto=format&fit=crop'); return s; }
function getToken(){ return localStorage.getItem(LS_TOKEN); }
function isAuthed(){ return !!getToken(); }
function saveWishlist(){ localStorage.setItem(LS_WISH, JSON.stringify([...wishlistSet])); }
function getGuestCart(){ try{ return JSON.parse(localStorage.getItem(LS_CART)||'[]'); }catch{return []} }
function setGuestCart(v){ localStorage.setItem(LS_CART, JSON.stringify(v)); }

function apiFetch(path, opts={}){
  const headers={};
  if(opts.body && !(opts.body instanceof FormData)) headers['Content-Type']='application/json';
  const t=getToken();
  if(t) headers['Authorization']='Bearer '+t;
  headers['Accept']='application/json';
  if(opts.headers) Object.assign(headers, opts.headers);
  return fetch(path, {...opts, headers}).then(async r=>{
    let j; const txt=await r.text(); try{ j=txt?JSON.parse(txt):{} }catch{ j={raw:txt} }
    if(!r.ok) throw new Error((j&&j.error)||`Error ${r.status}`);
    return j;
  });
}

function toast(msg, type='ok'){
  const t=document.getElementById('toast'), m=document.getElementById('toastMsg'), ic=t.querySelector('i');
  m.textContent=msg;
  t.classList.toggle('err', type==='error');
  ic.textContent= type==='error' ? '!' : '✓';
  ic.style.background = type==='error' ? '#ef4444' : 'var(--emerald)';
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide=setTimeout(()=> t.classList.remove('show'), 2800);
}

// ----- auth UI -----
function renderAuthUI(){
  const authed=isAuthed();
  const userRaw=localStorage.getItem(LS_USER);
  let user=null; try{user=userRaw?JSON.parse(userRaw):null}catch{}
  document.getElementById('authBtn').style.display= authed?'none':'inline-flex';
  const pill=document.getElementById('userPill');
  if(authed && user){
    pill.style.display='inline-flex';
    document.getElementById('userName').textContent=user.name||user.email||'Account';
    document.getElementById('mobileAuthLink').textContent='Account • '+ (user.name||user.email);
    document.getElementById('mobileAuthLink').onclick=(e)=>{e.preventDefault(); closeMenu(); openAccount('profile');};
  } else {
    pill.style.display='none';
    document.getElementById('mobileAuthLink').textContent='Sign in / Create account';
    document.getElementById('mobileAuthLink').onclick=(e)=>{e.preventDefault(); openAuth(); closeMenu();};
  }
}
function openAuth(tab){ if(tab) setAuthTab(tab); document.getElementById('authModal').classList.add('open'); document.body.style.overflow='hidden'; }
// ----- account modal -----
function openAccount(tab='profile'){
  if(!isAuthed()){ openAuth(); return; }
  document.getElementById('accountModal').classList.add('open');
  document.body.style.overflow='hidden';
  switchAccountTab(tab);
  loadAccountData();
  if(tab==='orders') loadOrders();
  if(tab==='wishlist') loadAccountWishlist();
}
function switchAccountTab(tab){
  accountTab=tab;
  document.querySelectorAll('.account-tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.account-section').forEach(s=> s.classList.remove('active'));
  const el=document.getElementById('acc'+tab[0].toUpperCase()+tab.slice(1));
  if(el) el.classList.add('active');
  if(tab==='orders') loadOrders();
  if(tab==='wishlist') loadAccountWishlist();
  if(tab==='addresses' || tab==='profile') loadAccountData();
}
async function loadAccountData(){
  if(!isAuthed()) return;
  try{
    const r=await apiFetch('/api/auth/me');
    accountUser=r.data;
    localStorage.setItem(LS_USER, JSON.stringify({name:accountUser.name, email:accountUser.email, id:accountUser.id}));
    renderAuthUI();
    renderProfileTab();
    renderAddressesTab();
    document.getElementById('accSyncEmail').textContent=accountUser.email||'';
    // keep cart drawer address selector in sync (shared load)
    try{ renderCart(); }catch{}
  }catch(e){
    if(String(e.message).toLowerCase().includes('token')||String(e.message).includes('401')){
      toast('Session expired — please sign in','error');
      logout();
      closeModal('accountModal');
      openAuth();
    } else {
      toast(e.message,'error');
    }
  }
}
function renderProfileTab(){
  if(!accountUser) return;
  const init=(accountUser.name||accountUser.email||'A')[0].toUpperCase();
  document.getElementById('accAvatar').textContent=init;
  document.getElementById('accProfileName').textContent=accountUser.name||'—';
  document.getElementById('accProfileEmail').textContent=accountUser.email||'—';
  document.getElementById('accProfileId').textContent=accountUser.id||'';
  document.getElementById('accName').value=accountUser.name||'';
  document.getElementById('accEmail').value=accountUser.email||'';
  const d=accountUser.createdAt? new Date(accountUser.createdAt):null;
  document.getElementById('accMemberSince').textContent=d? 'Member since '+d.toLocaleDateString('en-GB',{month:'long', year:'numeric', day:'numeric'}):'Member';
}
async function handleProfileSave(e){
  e.preventDefault();
  const name=document.getElementById('accName').value.trim();
  const email=document.getElementById('accEmail').value.trim();
  if(!name) return toast('Name cannot be empty','error');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Valid email required','error');
  const btn=document.getElementById('accProfileBtn'); const orig=btn.textContent; btn.disabled=true; btn.textContent='Saving…';
  try{
    const r=await apiFetch('/api/auth/profile',{method:'PUT', body:JSON.stringify({name,email})});
    accountUser=r.data;
    localStorage.setItem(LS_USER, JSON.stringify({name:accountUser.name, email:accountUser.email, id:accountUser.id}));
    renderAuthUI(); renderProfileTab();
    document.getElementById('accSyncEmail').textContent=accountUser.email||'';
    toast('Profile updated');
  }catch(err){ toast(err.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=orig; }
}
function renderAddressesTab(){
  const list=document.getElementById('addrList');
  if(!accountUser) { list.innerHTML='<div class="empty">Sign in to manage addresses.</div>'; return; }
  const addrs=accountUser.addresses||[];
  if(!addrs.length){
    list.innerHTML=`<div class="empty" style="display:grid; gap:10px; place-items:center">
      <div style="font-family:'Syne',sans-serif; font-weight:700; color:var(--text)">No addresses yet</div>
      <p style="font-size:0.82rem">Add your studio or home — used for checkout shippingAddress.</p>
      <button class="btn-ghost" onclick="document.getElementById('addrStreet').focus()">Add address →</button>
    </div>`;
    return;
  }
  list.innerHTML=addrs.map((a,i)=>`
    <div class="address-card">
      <div class="address-card-head">
        <span class="addr-label">${esc(a.label||'Address')}</span>
        <div class="addr-actions">
          <button onclick="startEditAddr(${i})">Edit</button>
          <button class="danger" onclick="deleteAddr(${i})">Delete</button>
        </div>
      </div>
      <div style="font-size:0.88rem; line-height:1.5">${esc(a.street)}<br><span style="color:var(--muted)">${esc(a.city)}${a.zip?', '+esc(a.zip):''}${a.country?', '+esc(a.country):''}</span></div>
    </div>
  `).join('');
}
function esc(s){ return String(s||'').replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function startEditAddr(idx){
  if(!accountUser||!accountUser.addresses[idx]) return;
  editingAddrIdx=idx;
  const a=accountUser.addresses[idx];
  document.getElementById('addrLabel').value=a.label||'';
  document.getElementById('addrStreet').value=a.street||'';
  document.getElementById('addrCity').value=a.city||'';
  document.getElementById('addrZip').value=a.zip||'';
  document.getElementById('addrCountry').value=a.country||'';
  document.getElementById('addrFormTitle').textContent='Edit address • #'+(idx+1);
  document.getElementById('addrSubmitBtn').textContent='Update address →';
  document.getElementById('addrCancelBtn').style.display='inline-flex';
  document.getElementById('addrStreet').focus();
  switchAccountTab('addresses');
}
function cancelEditAddr(){
  editingAddrIdx=null;
  document.getElementById('addrFormTitle').textContent='Add new address';
  document.getElementById('addrSubmitBtn').textContent='Add address →';
  document.getElementById('addrCancelBtn').style.display='none';
  document.getElementById('addrLabel').value='';
  document.getElementById('addrStreet').value='';
  document.getElementById('addrCity').value='';
  document.getElementById('addrZip').value='';
  document.getElementById('addrCountry').value='';
}
async function handleAddressSubmit(e){
  e.preventDefault();
  const label=document.getElementById('addrLabel').value.trim()||'Home';
  const street=document.getElementById('addrStreet').value.trim();
  const city=document.getElementById('addrCity').value.trim();
  const zip=document.getElementById('addrZip').value.trim();
  const country=document.getElementById('addrCountry').value.trim();
  if(!street||!city) return toast('Street and city are required','error');
  const btn=document.getElementById('addrSubmitBtn'); const orig=btn.textContent; btn.disabled=true; btn.textContent='…';
  const wasEditing=editingAddrIdx!==null;
  try{
    if(wasEditing){
      const r=await apiFetch('/api/auth/addresses/'+editingAddrIdx,{method:'PUT', body:JSON.stringify({label,street,city,zip,country})});
      accountUser=r.data;
      toast('Address updated');
      cancelEditAddr();
    } else {
      const r=await apiFetch('/api/auth/addresses',{method:'POST', body:JSON.stringify({label,street,city,zip,country})});
      accountUser=r.data;
      toast('Address added');
      e.target.reset();
    }
    renderAddressesTab();
    try{ renderCart(); }catch{}
  }catch(err){ toast(err.message,'error'); }
  finally{ btn.disabled=false; btn.textContent= wasEditing && editingAddrIdx!==null ? 'Update address →' : 'Add address →'; }
}
async function deleteAddr(idx){
  if(!confirm('Delete this address?')) return;
  try{
    const r=await apiFetch('/api/auth/addresses/'+idx,{method:'DELETE'});
    accountUser=r.data;
    if(editingAddrIdx===idx) cancelEditAddr();
    // keep selected index in bounds
    if(selectedAddressIdx>=accountUser.addresses.length) selectedAddressIdx=Math.max(0, accountUser.addresses.length-1);
    renderAddressesTab();
    try{ renderCart(); }catch{}
    toast('Address removed');
  }catch(err){ toast(err.message,'error'); }
}
async function loadOrders(){
  if(!isAuthed()){ document.getElementById('ordersList').innerHTML='<div class="empty">Sign in to view orders. <button class="btn-ghost" onclick="closeModal(\'accountModal\'); openAuth()">Sign in</button></div>'; return; }
  const list=document.getElementById('ordersList'); const detail=document.getElementById('orderDetail');
  detail.style.display='none';
  list.innerHTML='<div class="empty">Loading orders from <code>/api/orders</code>…</div>';
  try{
    const r=await apiFetch('/api/orders');
    accountOrders=r.data||[];
    if(!accountOrders.length){
      list.innerHTML=`<div class="empty" style="display:grid; gap:10px; place-items:center">
        <div style="font-family:'Syne',sans-serif; font-weight:700; color:var(--text)">No orders yet</div>
        <p style="font-size:0.82rem">Your ritual starts at the collection — checkout posts to <code style="background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:6px">POST /api/orders/checkout</code></p>
        <button class="btn-gold" onclick="closeModal('accountModal'); document.querySelector('#collection').scrollIntoView({behavior:'smooth'})">Browse collection →</button>
      </div>`;
      return;
    }
    list.innerHTML=accountOrders.map(o=>`
      <div class="order-card" onclick="openOrderDetail('${o.id}')">
        <div class="order-top">
          <span class="order-id">${esc(o.id)}</span>
          <span class="order-status confirmed">${esc(o.status||'confirmed')}</span>
        </div>
        <div style="font-size:0.78rem; color:var(--muted); margin-top:6px">${new Date(o.createdAt).toLocaleString()} • €${o.total} • ${o.items.length} items</div>
        <div class="order-items">${o.items.slice(0,5).map(it=>`<img src="${safeUrl(it.image)}" alt="${esc(it.name)}" title="${esc(it.name)} ×${it.qty}" loading="lazy" decoding="async">`).join('')}${o.items.length>5?`<span style="align-self:center; font-size:0.72rem; color:var(--muted)">+${o.items.length-5} more</span>`:''}</div>
        <div style="font-size:0.72rem; color:var(--muted); margin-top:8px">Click to view detail →</div>
      </div>
    `).join('');
  }catch(err){
    list.innerHTML=`<div class="empty">Failed to load orders: ${esc(err.message)} <button class="btn-ghost" style="margin-top:8px" onclick="loadOrders()">Retry</button></div>`;
  }
}
async function openOrderDetail(id){
  const detail=document.getElementById('orderDetail');
  detail.style.display='block';
  detail.innerHTML='Loading order '+esc(id)+'…';
  detail.scrollIntoView({behavior:'smooth', block:'nearest'});
  try{
    const r=await apiFetch('/api/orders/'+id);
    const o=r.data;
    detail.innerHTML=`
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap">
        <div style="font-family:'Syne',sans-serif; font-weight:800">${esc(o.id)}</div>
        <span class="order-status confirmed">${esc(o.status)}</span>
      </div>
      <div style="font-size:0.78rem; color:var(--muted); margin:6px 0 12px">${new Date(o.createdAt).toLocaleString()} • Total €${o.total}</div>
      <div style="display:grid; gap:10px">${o.items.map(it=>`
        <div style="display:flex; gap:12px; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:12px; padding:10px">
          <img src="${safeUrl(it.image)}" alt="${esc(it.name)}" style="width:56px;height:56px; border-radius:10px; border:1px solid var(--border)" loading="lazy" decoding="async">
          <div style="flex:1; min-width:0">
            <div style="font-weight:600; font-size:0.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(it.name)}</div>
            <div style="font-size:0.78rem; color:var(--muted)">€${it.price} × ${it.qty} • €${it.price*it.qty}</div>
          </div>
        </div>
      `).join('')}</div>
      <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border); font-size:0.82rem; color:var(--muted)">
        <strong style="color:var(--text)">Shipping</strong><br>${o.shippingAddress? esc(typeof o.shippingAddress==='string'? o.shippingAddress : [o.shippingAddress.street,o.shippingAddress.city,o.shippingAddress.zip,o.shippingAddress.country].filter(Boolean).join(', ')):'—'}
      </div>
      <button class="btn-ghost" style="margin-top:12px" onclick="document.getElementById('orderDetail').style.display='none'">Close detail</button>
    `;
  }catch(err){
    detail.innerHTML=`<span style="color:#fecaca">Failed: ${esc(err.message)}</span> <button class="btn-ghost" style="margin-left:8px" onclick="openOrderDetail('${id}')">Retry</button>`;
  }
}
async function handlePasswordChange(e){
  e.preventDefault();
  const cur=document.getElementById('curPw').value;
  const nw=document.getElementById('newPw').value;
  const cf=document.getElementById('confirmPw').value;
  if(nw.length<6) return toast('New password must be at least 6 characters','error');
  if(nw!==cf) return toast('New passwords do not match','error');
  const btn=document.getElementById('pwBtn'); const orig=btn.textContent; btn.disabled=true; btn.textContent='Updating…';
  try{
    await apiFetch('/api/auth/password',{method:'PUT', body:JSON.stringify({currentPassword:cur, newPassword:nw})});
    toast('Password updated');
    e.target.reset();
  }catch(err){ toast(err.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=orig; }
}
function logoutElsewhere(){
  // local-only: clears token, mimics "logout elsewhere"
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  accountUser=null;
  renderAuthUI();
  closeModal('accountModal');
  toast('Signed out on this device — token cleared');
}
async function loadAccountWishlist(){
  const grid=document.getElementById('accWishlistGrid');
  grid.innerHTML='<div class="empty">Loading wishlist…</div>';
  let items=[];
  if(isAuthed()){
    try{
      const r=await apiFetch('/api/wishlist');
      items=r.data||[];
    }catch(err){
      grid.innerHTML=`<div class="empty">Failed: ${esc(err.message)}</div>`;
      return;
    }
  } else {
    // guest: resolve from wishlistSet + productsCache
    if(!productsCache.length){ try{ const r=await apiFetch('/api/products'); productsCache=r.data; }catch{} }
    items=[...wishlistSet].map(id=> productsCache.find(p=>p.id===id)).filter(Boolean);
  }
  if(!items.length){
    grid.innerHTML=`<div class="empty" style="display:grid; gap:10px; place-items:center">
      <div style="font-family:'Syne',sans-serif; font-weight:700; color:var(--text)">Wishlist empty</div>
      <p style="font-size:0.82rem">Tap ♡ on any botanical — guest wishlist stays in localStorage, authed syncs to <code style="background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:6px">/api/wishlist</code></p>
      <button class="btn-ghost" onclick="closeModal('accountModal'); document.querySelector('#collection').scrollIntoView({behavior:'smooth'})">Browse collection →</button>
    </div>`;
    return;
  }
  grid.innerHTML=items.map(p=>`
    <div class="wish-card">
      <img src="${safeUrl(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">
      <div style="flex:1; min-width:0">
        <div style="font-weight:600; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(p.name)}</div>
        <div style="font-size:0.78rem; color:var(--muted)">€${p.price} • ${esc(p.category)}</div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap">
        <button class="btn-gold" style="padding:8px 12px; font-size:0.78rem" onclick="addToCartById('${esc(p.id)}')">Add</button>
        <button class="btn-ghost" style="padding:8px 12px; font-size:0.78rem" onclick="toggleWishlist('${esc(p.id)}').then(()=>loadAccountWishlist())">Remove</button>
      </div>
    </div>
  `).join('') + `<div style="font-size:0.72rem; color:var(--muted); text-align:center; margin-top:4px">${items.length} saved • ${isAuthed()?'synced to /api/wishlist':'guest (localStorage)'}</div>`;
}
function setAuthTab(which){
  authTab=which;
  document.getElementById('tabLogin').classList.toggle('active', which==='login');
  document.getElementById('tabRegister').classList.toggle('active', which==='register');
  document.getElementById('authTitle').textContent= which==='login'?'Welcome back':'Create account';
  document.getElementById('authSub').textContent= which==='login'?'Sign in to sync cart & wishlist.':'Join 2,847 ritual keepers. Cart will sync on login.';
  document.getElementById('authName').style.display= which==='register'?'block':'none';
  document.getElementById('authName').required= which==='register';
  document.getElementById('authSubmit').textContent= which==='login'?'Log in →':'Create account →';
}
async function handleAuth(e){
  e.preventDefault();
  const fd=new FormData(e.target);
  const email=String(fd.get('email')||'').trim();
  const password=String(fd.get('password')||'');
  const name=String(fd.get('name')||'').trim();
  const btn=document.getElementById('authSubmit'); const orig=btn.textContent; btn.disabled=true; btn.textContent='…';
  try{
    const path= authTab==='login'?'/api/auth/login':'/api/auth/register';
    const body= authTab==='login'?{email,password}:{name:name||email.split('@')[0],email,password};
    const res=await apiFetch(path,{method:'POST', body:JSON.stringify(body)});
    const token=res.data.token; const user=res.data.user;
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_USER, JSON.stringify(user));
    // merge guest cart to server (best-effort sequential)
    const guest=getGuestCart();
    if(guest.length){
      for(const it of guest){
        try{ await apiFetch('/api/cart',{method:'POST', body:JSON.stringify({productId:it.productId, qty:it.qty})}); }catch{}
      }
      localStorage.removeItem(LS_CART);
    }
    // merge wishlist
    if(wishlistSet.size){
      for(const pid of [...wishlistSet]){
        try{ await apiFetch('/api/wishlist',{method:'POST', body:JSON.stringify({productId:pid})}); }catch{}
      }
    }
    toast(authTab==='login'?'Signed in — cart synced':'Account created — welcome');
    closeModal('authModal');
    e.target.reset();
    setAuthTab('login');
    renderAuthUI();
    await Promise.all([loadCart(), loadWishlist()]);
    try{ const ro=await apiFetch('/api/orders'); accountOrders=ro.data||[]; renderCart(); }catch{}
  }catch(err){ toast(err.message||'Auth failed', 'error'); }
  finally{ btn.disabled=false; btn.textContent=orig; }
}
function logout(){
  localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER);
  accountUser=null; accountOrders=[];
  cartState={items:[],total:0,count:0}; renderCart();
  wishlistSet=new Set(JSON.parse(localStorage.getItem(LS_WISH)||'[]'));
  closeModal('accountModal');
  renderAuthUI(); toast('Signed out — guest mode');
  loadCart(); // will show guest cart
}
async function fetchMe(){
  if(!isAuthed()) return;
  try{
    const r=await apiFetch('/api/auth/me');
    accountUser=r.data;
    localStorage.setItem(LS_USER, JSON.stringify({name:r.data.name, email:r.data.email, id:r.data.id}));
    renderAuthUI();
  }catch{ localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); accountUser=null; renderAuthUI(); }
}

// ----- products -----
function buildProductCard(p){
  const wishActive=wishlistSet.has(p.id);
  const hasDiscount=p.originalPrice && p.originalPrice>p.price;
  const stockLabel=p.leftStock<=8? p.leftStock+' left — low': p.leftStock+' left';
  const stockClass=p.leftStock<=12?'stock-low':'';
  const safeImg=safeUrl(p.image);
  return `<article class="product" tabindex="0" role="button" aria-label="${esc(p.name)}" data-id="${esc(p.id)}" data-tags="${esc(p.tags.join(' '))}" data-tilt onclick="openProduct('${esc(p.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openProduct('${esc(p.id)}')}">
    <div class="product-media">
      <img src="${safeImg}" srcset="${safeImg.replace('w=800','w=400')} 400w, ${safeImg} 800w" sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw" alt="${esc(p.name)}" loading="lazy" decoding="async" width="400" height="420" fetchpriority="low">
      <div class="badge-top">
        <span class="badge badge-gold">${esc(p.badge||p.category)}</span>
        ${hasDiscount?`<span class="badge badge-glass">−${Math.round((1 - p.price/p.originalPrice)*100)}%</span>`:`<span class="badge badge-glass">${esc(p.category)}</span>`}
      </div>
      <button class="wishlist ${wishActive?'active':''}" aria-label="wishlist" onclick="event.stopPropagation(); toggleWishlist('${esc(p.id)}')">${wishActive?'♥':'♡'}</button>
    </div>
    <div class="product-body">
      <div class="product-meta"><span class="product-cat">${esc(p.category)} • ${esc(p.tags.join(' • '))}</span><span class="rating">★ ${p.rating.toFixed(1)} <span style="color:var(--muted); font-size:0.72rem">(${p.reviews})</span></span></div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.description)}</p>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px">
        <span class="stock-hint ${stockClass}">${esc(stockLabel)}</span>
        <span style="font-size:0.68rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted)">${p.inStock?'In stock':'Sold out'}</span>
      </div>
      <div class="product-foot">
        <div class="price">€${p.price} ${hasDiscount?`<small>€${p.originalPrice}</small>`:''}</div>
        <button class="add-btn" onclick="event.stopPropagation(); addToCartById('${esc(p.id)}')" aria-label="add to cart">＋</button>
      </div>
    </div>
  </article>`;
}
function renderProducts(list){
  const grid=document.getElementById('productGrid');
  const empty=document.getElementById('productsEmpty');
  const status=document.getElementById('productsStatus');
  if(!list.length){
    grid.innerHTML='';
    empty.style.display='block';
    status.textContent=`0 results — filter: ${currentFilter} • search: "${currentSearch||'—'}"`;
    return;
  }
  empty.style.display='none';
  status.textContent=`${list.length} botanics • filter: ${currentFilter} • ${currentSearch?'search: "'+currentSearch+'" • ':''}from API`;
  grid.innerHTML=list.map(buildProductCard).join('');
  // re-attach tilt
  grid.querySelectorAll('[data-tilt]').forEach(card=>{
    card.addEventListener('mousemove', (e)=>{
      if(window.innerWidth < 900) return;
      const r=card.getBoundingClientRect();
      const x=(e.clientX - r.left)/r.width - 0.5;
      const y=(e.clientY - r.top)/r.height - 0.5;
      card.style.transform=`perspective(900px) rotateY(${x*6}deg) rotateX(${-y*6}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', ()=> card.style.transform='');
  });
  // lookbook showcase refresh
  renderLookbookPreview();
}
async function fetchProducts(){
  const grid=document.getElementById('productGrid');
  const status=document.getElementById('productsStatus');
  status.textContent='Loading from /api/products…';
  grid.innerHTML='<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  const params=new URLSearchParams();
  if(currentFilter && currentFilter!=='all') params.set('filter', currentFilter);
  if(currentSearch) params.set('search', currentSearch);
  const qs=params.toString()?`?${params.toString()}`:'';
  if(productsController) productsController.abort();
  productsController=new AbortController();
  try{
    const res=await apiFetch(`/api/products${qs}`,{signal: productsController.signal});
    productsCache=res.data;
    renderProducts(productsCache);
  }catch(err){
    if(err.name==='AbortError') return;
    status.textContent='Failed to load products';
    toast(err.message||'Failed to load products','error');
    grid.innerHTML=`<div class="empty" style="display:grid; gap:12px; place-items:center">
      <div style="font-family:'Syne',sans-serif; font-weight:800; color:var(--text)">Could not load botanics</div>
      <div style="font-size:0.82rem; color:var(--muted)">Is the API running on port 3000? <br><small style="word-break:break-all">${esc(err.message||'unknown')}</small></div>
      <button class="btn-gold" onclick="fetchProducts()">Retry →</button>
      <button class="btn-ghost" onclick="clearSearch()">Clear filters</button>
    </div>`;
    document.getElementById('productsEmpty').style.display='none';
  }
}
function clearSearch(){
  currentSearch=''; document.getElementById('collectionSearch').value=''; document.getElementById('navSearch').value=''; document.getElementById('mobileSearch').value='';
  fetchProducts();
}
function renderLookbookPreview(){
  const el=document.getElementById('lookbookProducts');
  if(!el) return;
  const list=productsCache.slice(0,3);
  if(!list.length){ el.innerHTML=''; return; }
  el.innerHTML=list.map(p=> `<div class="lookbook-page"><img src="${safeUrl(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="300" height="400"><div style="position:absolute; bottom:10px; left:10px; right:10px; background:rgba(0,0,0,0.55); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:10px; display:flex; justify-content:space-between; align-items:center"><span style="font-weight:600; font-size:0.82rem">${esc(p.name)}</span><span style="color:var(--gold-light); font-weight:800">€${p.price}</span></div></div>`).join('');
}

// ----- cart -----
function calcGuestCart(){
  const guest=getGuestCart();
  const items=guest.map(ci=>{
    const prod=productsCache.find(p=>p.id===ci.productId);
    if(!prod) return null;
    return { productId:prod.id, name:prod.name, price:prod.price, originalPrice:prod.originalPrice, image:prod.image, qty:ci.qty, subtotal:prod.price*ci.qty, inStock:prod.inStock, leftStock:prod.leftStock };
  }).filter(Boolean);
  const total=items.reduce((s,i)=>s+i.subtotal,0);
  const count=items.reduce((s,i)=>s+i.qty,0);
  return {items,total,count};
}
async function loadCart(){
  if(isAuthed()){
    try{
      const res=await apiFetch('/api/cart');
      cartState=res.data;
      renderCart();
    }catch(err){
      if(String(err.message).includes('401')||String(err.message).toLowerCase().includes('token')){
        localStorage.removeItem(LS_TOKEN); renderAuthUI();
        cartState=calcGuestCart(); renderCart();
      } else {
        toast(err.message,'error');
        cartState=calcGuestCart(); renderCart();
      }
    }
  } else {
    if(!productsCache.length){ try{ const r=await apiFetch('/api/products'); productsCache=r.data; }catch{} }
    cartState=calcGuestCart(); renderCart();
  }
}
function renderCart(){
  document.getElementById('cartCount').textContent=cartState.count||0;
  document.getElementById('cartDrawerCount').textContent= cartState.count?`· ${cartState.count} items`:'· empty';
  const dot=document.querySelector('.cart-dot'); if(dot) dot.style.background= cartState.count?'var(--emerald)':'var(--muted)';
  const body=document.getElementById('cartBody');
  const foot=document.getElementById('cartFoot');
  if(!cartState.items.length){
    body.innerHTML=`<div class="empty">
      <div style="font-family:'Syne',sans-serif; font-weight:800; font-size:1.1rem; color:var(--text)">Your cart is still a seed.</div>
      <p style="margin-top:6px">Add a botanical — guest cart saves to localStorage, login syncs to POST /api/cart.</p>
      <button class="btn-gold" style="margin-top:14px" onclick="closeCart(); document.querySelector('#collection').scrollIntoView({behavior:'smooth'})">Browse collection →</button>
      ${!isAuthed()?`<button class="btn-ghost" style="margin-top:8px; width:100%" onclick="openAuth()">Sign in to sync cart</button>`:''}
      ${isAuthed() && accountOrders.length?`<button class="view-orders-link" style="margin-top:8px; width:100%" onclick="closeCart(); openAccount('orders')">View Orders • ${accountOrders.length} →</button>`:''}
    </div>`;
    foot.innerHTML=`<div style="display:flex; justify-content:space-between; font-size:0.82rem; color:var(--muted)"><span>Shipping</span><span>—</span></div>
      <div style="display:flex; justify-content:space-between; font-weight:700"><span>Total</span><span>€0</span></div>
      <button class="btn-gold" disabled style="width:100%">Checkout</button>
      <span style="font-size:0.7rem; color:var(--muted); text-align:center">${isAuthed()?'Add items to checkout':'Sign in to checkout via API'}</span>`;
    return;
  }
  body.innerHTML=cartState.items.map(it=>`
    <div class="cart-item">
      <img src="${safeUrl(it.image)}" alt="${esc(it.name)}" loading="lazy" decoding="async" width="64" height="64">
      <div style="flex:1; min-width:0">
        <div style="font-weight:600; font-size:0.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(it.name)}</div>
        <div style="font-size:0.78rem; color:var(--muted)">€${it.price} × ${it.qty} • €${it.subtotal}</div>
      </div>
      <div class="qty">
        <button onclick="changeQty('${esc(it.productId)}', ${it.qty-1})" ${it.qty<=1?'disabled':''}>−</button>
        <span style="min-width:20px; text-align:center; font-weight:700; font-size:0.85rem">${it.qty}</span>
        <button onclick="changeQty('${esc(it.productId)}', ${it.qty+1})">＋</button>
      </div>
      <button onclick="removeFromCart('${esc(it.productId)}')" style="background:transparent; border:none; color:var(--muted); cursor:pointer; font-size:1.1rem; padding:6px">✕</button>
    </div>
  `).join('');
  const shipping= cartState.total>=200?0:12;
  const total= cartState.total+shipping;
  // address selector block
  let addrBlock='';
  if(!isAuthed()){
    addrBlock=`<div class="checkout-block">
      <div class="checkout-label">Shipping address</div>
      <div style="font-size:0.82rem; color:var(--muted); line-height:1.6">Sign in to select a saved address. You'll be able to pick one or add inline before checkout.</div>
      <button class="btn-ghost" style="width:100%" onclick="openAuth()">Sign in to checkout →</button>
    </div>`;
  } else {
    const addrs=(accountUser && accountUser.addresses) || [];
    if(!accountUser){
      addrBlock=`<div class="checkout-block">
        <div class="checkout-label">Shipping address</div>
        <div style="font-size:0.82rem; color:var(--muted)">Loading addresses…</div>
      </div>`;
      // trigger load in background
      if(isAuthed()) loadAccountData();
    } else if(!addrs.length){
      addrBlock=`<div class="checkout-block">
        <div class="checkout-label">Shipping address — add one to checkout</div>
        <div style="font-size:0.78rem; color:var(--muted)">No saved addresses. Fill below and we'll save it via <code style="background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:6px">POST /api/auth/addresses</code> then checkout.</div>
        <div class="checkout-inline">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <input id="coStreet" placeholder="Street *" autocomplete="street-address">
            <input id="coCity" placeholder="City *">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <input id="coZip" placeholder="ZIP">
            <input id="coCountry" placeholder="Country (DE)">
          </div>
          <input id="coLabel" placeholder="Label (Home, Studio)">
          <button class="btn-ghost" style="width:100%" onclick="openAccount('addresses')">Manage in Account →</button>
        </div>
      </div>`;
    } else {
      // has addresses: dropdown + inline toggle
      const opts=addrs.map((a,i)=>`<option value="${i}" ${i===selectedAddressIdx?'selected':''}>${esc(a.label||'Address')} — ${esc(a.street)}, ${esc(a.city)}</option>`).join('');
      const selAddr=addrs[selectedAddressIdx]||addrs[0];
      addrBlock=`<div class="checkout-block">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px">
          <span class="checkout-label">Shipping address</span>
          <span style="font-size:0.68rem; color:var(--muted)">${addrs.length} saved</span>
        </div>
        <select class="checkout-select" id="coAddrSelect" onchange="onCheckoutAddrChange(this.value)">
          ${opts}
        </select>
        ${selAddr?`<div style="font-size:0.82rem; line-height:1.5; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:10px; padding:10px">${esc(selAddr.street)}<br><span style="color:var(--muted)">${esc(selAddr.city)}${selAddr.zip?', '+esc(selAddr.zip):''}${selAddr.country?', '+esc(selAddr.country):''}</span> <span style="margin-left:6px; font-size:0.62rem; letter-spacing:0.08em; text-transform:uppercase; background:rgba(212,175,55,0.15); color:var(--gold-light); padding:3px 7px; border-radius:999px">${esc(selAddr.label||'')}</span></div>`:''}
        <button class="btn-ghost" style="width:100%; font-size:0.78rem" onclick="toggleCheckoutInline()">${checkoutInlineOpen?'Cancel new address':'＋ Add new address inline'}</button>
        <div id="coInlineForm" class="checkout-inline" style="display:${checkoutInlineOpen?'grid':'none'}">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <input id="coNewStreet" placeholder="Street *">
            <input id="coNewCity" placeholder="City *">
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px">
            <input id="coNewZip" placeholder="ZIP">
            <input id="coNewCountry" placeholder="Country">
          </div>
          <input id="coNewLabel" placeholder="Label (Studio)">
          <button class="btn-gold" style="width:100%; padding:9px; font-size:0.82rem" onclick="saveInlineAddress()">Save address →</button>
          <span style="font-size:0.7rem; color:var(--muted); text-align:center">Saves via POST /api/auth/addresses</span>
        </div>
        <button class="btn-ghost" style="width:100%; font-size:0.72rem; border-style:dashed" onclick="openAccount('addresses')">Manage addresses in Account →</button>
      </div>`;
    }
  }
  const ordersQuick=isAuthed() && accountOrders.length?`<button class="view-orders-link" onclick="closeCart(); openAccount('orders')">View Orders • ${accountOrders.length} →</button>`:(isAuthed()?`<button class="view-orders-link" style="opacity:0.7" onclick="closeCart(); openAccount('orders')">Orders — view in Account →</button>`:'');
  foot.innerHTML=`
    <div style="display:grid; gap:6px; font-size:0.88rem">
      <div style="display:flex; justify-content:space-between"><span style="color:var(--muted)">Subtotal</span><span style="font-weight:600">€${cartState.total}</span></div>
      <div style="display:flex; justify-content:space-between"><span style="color:var(--muted)">Shipping ${cartState.total>=200?'<small style="color:var(--emerald-light)">free over €200</small>':''}</span><span>${shipping===0?'Free':'€'+shipping}</span></div>
      <div style="display:flex; justify-content:space-between; font-weight:800; font-size:1.05rem; padding-top:6px; border-top:1px solid var(--border)"><span>Total</span><span>€${total}</span></div>
    </div>
    ${addrBlock}
    <button class="btn-gold" style="width:100%" onclick="checkout()">Checkout →</button>
    ${!isAuthed()?`<span style="font-size:0.7rem; color:var(--muted); text-align:center">Checkout requires sign-in → opens auth modal</span>`:`<span style="font-size:0.7rem; color:var(--muted); text-align:center">Secure checkout via POST /api/orders/checkout</span>`}
    ${ordersQuick}
    <button class="btn-ghost" style="width:100%; border-style:dashed; font-size:0.78rem" onclick="clearCart()">Clear cart</button>
  `;
}
function openCart(){
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('cartOverlay').classList.add('open');
  document.body.style.overflow='hidden';
  loadCart();
  // ensure address selector has data + view-orders count
  if(isAuthed()){
    if(!accountUser) loadAccountData();
    apiFetch('/api/orders').then(r=>{accountOrders=r.data||[]; renderCart();}).catch(()=>{});
  }
}
function closeCart(){ document.getElementById('cartDrawer').classList.remove('open'); document.getElementById('cartOverlay').classList.remove('open'); if(!document.querySelector('.modal-overlay.open') && !menu.classList.contains('open')) document.body.style.overflow=''; }
async function addToCartById(productId, qty=1){
  if(window._addingCart) return;
  window._addingCart=true;
  const _releaseCart=()=> setTimeout(()=>window._addingCart=false,400);
  const prod=productsCache.find(p=>p.id===productId);
  if(!prod){ toast('Product not found','error'); _releaseCart(); return; }
  if(!prod.inStock){ toast('Out of stock','error'); _releaseCart(); return; }
  if(isAuthed()){
    try{
      const res=await apiFetch('/api/cart',{method:'POST', body:JSON.stringify({productId, qty})});
      cartState=res.data;
      renderCart();
      pulseCart();
      toast(`${esc(prod.name)} — added to cart`);
    }catch(e){ toast(e.message,'error'); } finally{ _releaseCart(); }
  } else {
    const cart=getGuestCart();
    const ex=cart.find(c=>c.productId===productId);
    if(ex) ex.qty+=qty; else cart.push({productId, qty});
    setGuestCart(cart);
    cartState=calcGuestCart(); renderCart(); pulseCart();
    toast(`${esc(prod.name)} — added (guest)`);
    _releaseCart();
  }
}
async function addToCartFromDetail(pid, qty){
  await addToCartById(pid, qty);
  try{ closeModal('productModal'); }catch{}
  // subtle polish: auto-open cart so user sees it
  setTimeout(()=> openCart(), 180);
}
function openProductByName(name){
  const p=productsCache.find(x=> x.name===name || x.name.includes(name.split(' ')[0]));
  if(p) openProduct(p.id); else document.querySelector('#collection').scrollIntoView({behavior:'smooth'});
}
async function changeQty(productId, newQty){
  if(newQty<0) return;
  if(isAuthed()){
    try{
      if(newQty===0){
        const res=await apiFetch(`/api/cart/${productId}`,{method:'DELETE'});
        cartState=res.data;
      } else {
        const res=await apiFetch(`/api/cart/${productId}`,{method:'PUT', body:JSON.stringify({qty:newQty})});
        cartState=res.data;
      }
      renderCart();
    }catch(e){ toast(e.message,'error'); }
  } else {
    let cart=getGuestCart();
    if(newQty===0) cart=cart.filter(c=>c.productId!==productId);
    else { const it=cart.find(c=>c.productId===productId); if(it) it.qty=newQty; }
    setGuestCart(cart); cartState=calcGuestCart(); renderCart();
  }
}
async function removeFromCart(productId){ await changeQty(productId,0); }
async function clearCart(){
  if(isAuthed()){
    try{ const res=await apiFetch('/api/cart',{method:'DELETE'}); cartState=res.data; renderCart(); toast('Cart cleared'); }catch(e){ toast(e.message,'error'); }
  } else { setGuestCart([]); cartState=calcGuestCart(); renderCart(); toast('Cart cleared (guest)'); }
}
function onCheckoutAddrChange(val){
  selectedAddressIdx=parseInt(val,10)||0;
  renderCart();
}
function toggleCheckoutInline(){
  checkoutInlineOpen=!checkoutInlineOpen;
  renderCart();
  if(checkoutInlineOpen) setTimeout(()=> document.getElementById('coNewStreet')?.focus(), 80);
}
async function saveInlineAddress(){
  const street=document.getElementById('coNewStreet')?.value.trim()||'';
  const city=document.getElementById('coNewCity')?.value.trim()||'';
  const zip=document.getElementById('coNewZip')?.value.trim()||'';
  const country=document.getElementById('coNewCountry')?.value.trim()||'';
  const label=document.getElementById('coNewLabel')?.value.trim()||'Home';
  if(!street||!city) return toast('Street and city required','error');
  const btn=document.querySelector('#coInlineForm .btn-gold'); const orig=btn?btn.textContent:'Save address →'; if(btn){btn.disabled=true; btn.textContent='Saving…';}
  try{
    const r=await apiFetch('/api/auth/addresses',{method:'POST', body:JSON.stringify({label, street, city, zip, country})});
    accountUser=r.data;
    selectedAddressIdx=accountUser.addresses.length-1;
    checkoutInlineOpen=false;
    renderAddressesTab();
    renderCart();
    toast('Address saved — selected for checkout');
  }catch(e){ toast(e.message,'error'); }
  finally{ if(btn){btn.disabled=false; btn.textContent=orig;}}
}
function getInlineNoAddrFormAddress(){
  const street=document.getElementById('coStreet')?.value.trim();
  const city=document.getElementById('coCity')?.value.trim();
  const zip=document.getElementById('coZip')?.value.trim();
  const country=document.getElementById('coCountry')?.value.trim();
  const label=document.getElementById('coLabel')?.value.trim()||'Home';
  if(!street||!city) return null;
  return {label, street, city, zip, country};
}
function ensureCheckoutAddress(){
  if(!isAuthed()) return null;
  const inlineEl=document.getElementById('coInlineForm');
  const inlineOpen = checkoutInlineOpen || (inlineEl && inlineEl.style.display !== 'none' && inlineEl.style.display !== '');
  if(inlineOpen){
    const street=document.getElementById('coNewStreet')?.value.trim()||'';
    const city=document.getElementById('coNewCity')?.value.trim()||'';
    const zip=document.getElementById('coNewZip')?.value.trim()||'';
    const country=document.getElementById('coNewCountry')?.value.trim()||'';
    const label=document.getElementById('coNewLabel')?.value.trim()||'Home';
    if(street && city) return {label, street, city, zip, country};
    if(street || city || zip || country) return null;
  }
  const addrs=(accountUser && accountUser.addresses)||[];
  if(addrs.length){
    return addrs[selectedAddressIdx]||addrs[0];
  } else {
    return getInlineNoAddrFormAddress();
  }
}
function showOrderConfirm(order){
  const shipping= order.total>=200?0:12;
  const grand=order.total+shipping;
  const addr=order.shippingAddress||{};
  const addrStr= typeof addr==='string'? addr : [addr.street, addr.city, addr.zip, addr.country].filter(Boolean).join(', ') || '—';
  const itemsHtml=order.items.map(it=>`
    <div style="display:flex; gap:12px; align-items:center; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:12px; padding:10px">
      <img src="${safeUrl(it.image)}" alt="${esc(it.name)}" style="width:56px;height:56px; border-radius:10px; border:1px solid var(--border); flex-shrink:0" loading="lazy" decoding="async">
      <div style="flex:1; min-width:0">
        <div style="font-weight:600; font-size:0.92rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${esc(it.name)}</div>
        <div style="font-size:0.78rem; color:var(--muted)">€${it.price} × ${it.qty} = €${it.price*it.qty}</div>
      </div>
    </div>
  `).join('');
  document.getElementById('orderConfirmContent').innerHTML=`
    <div class="order-confirm-head">
      <div class="order-confirm-badge">✓</div>
      <div>
        <div class="kicker" style="color:var(--emerald-light)">Order confirmed • ships in 24H</div>
        <h2 style="margin:4px 0 2px; font-size:1.6rem">${esc(order.id)}</h2>
        <div style="font-size:0.78rem; color:var(--muted)">${new Date(order.createdAt).toLocaleString()} • <span class="order-status confirmed" style="font-size:0.62rem">${esc(order.status||'confirmed')}</span></div>
      </div>
    </div>
    <div style="display:grid; gap:12px; margin-top:14px">
      <div class="order-items" style="display:grid; gap:8px; max-height:260px; overflow:auto; padding-right:2px">${itemsHtml}</div>
      <div class="invoice-box">
        <div class="invoice-row"><span style="color:var(--muted)">Subtotal</span><span style="font-weight:600">€${order.total}</span></div>
        <div class="invoice-row"><span style="color:var(--muted)">Shipping ${order.total>=200?'<small style="color:var(--emerald-light)">free over €200</small>':''}</span><span>${shipping===0?'Free':'€'+shipping}</span></div>
        <div class="invoice-total"><span>Total</span><span>€${grand}</span></div>
        <div style="font-size:0.72rem; color:var(--muted); margin-top:4px">Invoice — payment confirmed. You'll get tracking via email.</div>
      </div>
      <div style="background:rgba(255,255,255,0.04); border:1px solid var(--border); border-radius:12px; padding:12px">
        <div style="font-size:0.68rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); font-weight:700">Shipping to</div>
        <div style="font-size:0.88rem; margin-top:6px; line-height:1.6">${esc(addrStr)}<br>${addr.label?`<span style="font-size:0.72rem; background:rgba(212,175,55,0.15); color:var(--gold-light); padding:3px 8px; border-radius:999px">${esc(addr.label)}</span>`:''}</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap">
        <button class="btn-gold" onclick="closeModal('orderConfirmModal'); openAccount('orders')">View in Account → Orders</button>
        <button class="btn-ghost" onclick="closeModal('orderConfirmModal'); document.querySelector('#collection').scrollIntoView({behavior:'smooth'})">Continue Shopping →</button>
      </div>
      <span style="font-size:0.7rem; color:var(--muted); text-align:center">Order synced via <code style="background:rgba(255,255,255,0.06); padding:1px 5px; border-radius:6px">GET /api/orders/${esc(order.id)}</code></span>
    </div>
  `;
  document.getElementById('orderConfirmModal').classList.add('open');
  document.body.style.overflow='hidden';
}
async function checkout(){
  if(!cartState.items.length){ toast('Cart empty','error'); return; }
  if(!isAuthed()){ toast('Sign in to checkout','error'); openAuth(); return; }
  // ensure we have latest user/address data
  if(!accountUser){
    try{ const r=await apiFetch('/api/auth/me'); accountUser=r.data; renderCart(); }catch(e){ toast('Session expired','error'); openAuth(); return; }
  }
  let shippingAddress=ensureCheckoutAddress();
  const addrs=(accountUser.addresses||[]);
  // if no addresses but inline filled, we need to POST it first then use saved one
  if(!addrs.length && shippingAddress){
    // inline no-addr case: save then use last saved
    const btn=document.querySelector('#cartFoot .btn-gold'); const origB=btn?btn.textContent:'Checkout →'; if(btn){btn.disabled=true; btn.textContent='Saving address…';}
    try{
      const r=await apiFetch('/api/auth/addresses',{method:'POST', body:JSON.stringify(shippingAddress)});
      accountUser=r.data;
      shippingAddress=accountUser.addresses[accountUser.addresses.length-1];
      renderAddressesTab();
      renderCart();
      toast('Address saved');
    }catch(e){ if(btn){btn.disabled=false; btn.textContent=origB;} toast(e.message,'error'); return; }
    if(btn){btn.disabled=false; btn.textContent=origB;}
  }
  if(!shippingAddress){
    toast('Select or add a shipping address','error');
    // focus inline
    const el=document.getElementById('coStreet')||document.getElementById('coNewStreet');
    if(el) el.focus();
    // if has addresses but none selected? ensure selection
    if(addrs.length) renderCart();
    return;
  }
  const btn=document.querySelector('#cartFoot .btn-gold'); const orig=btn?btn.textContent:'Checkout →'; if(btn){btn.disabled=true; btn.textContent='Processing…';}
  try{
    const res=await apiFetch('/api/orders/checkout',{method:'POST', body:JSON.stringify({shippingAddress})});
    toast(`Order ${res.data.id} confirmed — €${res.data.total} • shipped in 24H`);
    cartState={items:[], total:0, count:0}; renderCart();
    closeCart();
    showOrderConfirm(res.data);
    // refresh orders if account modal open
    try{
      const r2=await apiFetch('/api/orders');
      accountOrders=r2.data||[];
      // keep cart foot view-orders count fresh after close
      renderCart();
      if(document.getElementById('accountModal').classList.contains('open') && accountTab==='orders'){
        loadOrders();
      }
      // preload orders for next openCart view
      if(accountOrders.length) {/* keep cached */}
    }catch{}
  }catch(e){ toast(e.message,'error'); }
  finally{ if(btn){btn.disabled=false; btn.textContent=orig;} }
}
function pulseCart(){
  const dot=document.querySelector('.cart-dot');
  if(dot) dot.animate([{transform:'scale(1)'},{transform:'scale(1.6)'},{transform:'scale(1)'}],{duration:300});
}

// ----- wishlist -----
async function loadWishlist(){
  if(isAuthed()){
    try{
      const res=await apiFetch('/api/wishlist');
      wishlistSet=new Set(res.data.map(p=>p.id));
      saveWishlist();
    }catch(e){ /* keep guest wishlist */ }
  }
  // refresh UI if products rendered
  if(productsCache.length) renderProducts(productsCache);
  // also refresh product modal wishlist button if open
  const active=document.querySelector('#productModalContent [data-wish-btn]');
  if(active){
    const pid=active.getAttribute('data-wish-btn');
    active.textContent= wishlistSet.has(pid)?'♥ Saved':'♡ Save';
    active.classList.toggle('active', wishlistSet.has(pid));
  }
}
async function toggleWishlist(productId){
  const was=wishlistSet.has(productId);
  // optimistic UI
  if(was) wishlistSet.delete(productId); else wishlistSet.add(productId);
  saveWishlist();
  renderProducts(productsCache);
  const prod=productsCache.find(p=>p.id===productId);
  toast(was?`${esc(prod?prod.name:'Item')} — removed from wishlist`:`${esc(prod?prod.name:'Item')} — saved to wishlist`);
  if(isAuthed()){
    try{
      if(was){
        await apiFetch(`/api/wishlist/${productId}`,{method:'DELETE'});
      } else {
        await apiFetch('/api/wishlist',{method:'POST', body:JSON.stringify({productId})});
      }
      // sync from server to be exact
      const res=await apiFetch('/api/wishlist');
      wishlistSet=new Set(res.data.map(p=>p.id)); saveWishlist(); renderProducts(productsCache);
    }catch(e){
      // revert on error
      if(was) wishlistSet.add(productId); else wishlistSet.delete(productId);
      saveWishlist(); renderProducts(productsCache);
      toast(e.message,'error');
    }
  }
  // keep account wishlist tab fresh if open
  if(document.getElementById('accountModal').classList.contains('open') && accountTab==='wishlist'){
    loadAccountWishlist();
  }
}

// ----- product detail modal -----
let detailQty=1, detailId=null;
function openProduct(id){
  const p=productsCache.find(x=>x.id===id);
  if(!p) return;
  detailId=id; detailQty=1;
  const wish=wishlistSet.has(id);
  const hasDiscount=p.originalPrice>p.price;
  document.getElementById('productModalContent').innerHTML=`
    <div class="product-detail">
      <div class="product-detail-media"><img src="${safeUrl(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" width="600" height="600"></div>
      <div>
        <div class="kicker">${esc(p.category)} • ${esc(p.tags.join(' • '))}</div>
        <h2 style="margin:8px 0 6px">${esc(p.name)}</h2>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
          <span style="color:var(--gold-light)">★ ${p.rating.toFixed(1)} <span style="color:var(--muted); font-size:0.78rem">(${p.reviews} reviews)</span></span>
          <span class="badge badge-gold">${esc(p.badge)}</span>
          <span class="stock-hint ${p.leftStock<=12?'stock-low':''}">${p.leftStock} left</span>
        </div>
        <p style="color:var(--muted); margin:14px 0; line-height:1.7">${esc(p.description)}</p>
        <p style="font-size:0.88rem; color:var(--muted); padding:10px 12px; background:rgba(255,255,255,0.04); border:1px solid var(--border); border-radius:12px">${esc(p.details)}</p>
        <div style="display:flex; align-items:center; gap:12px; margin:16px 0">
          <span style="font-family:'Syne',sans-serif; font-weight:800; font-size:1.6rem">€${p.price}</span>
          ${hasDiscount?`<span style="color:var(--muted); text-decoration:line-through">€${p.originalPrice}</span><span style="background:var(--emerald); color:#00140D; padding:4px 8px; border-radius:999px; font-size:0.72rem; font-weight:800">−${Math.round((1-p.price/p.originalPrice)*100)}%</span>`:''}
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
          <div class="qty">
            <button onclick="detailQty=Math.max(1,detailQty-1); document.getElementById('detailQty').textContent=detailQty">−</button>
            <span id="detailQty" style="min-width:24px; text-align:center; font-weight:800">${detailQty}</span>
            <button onclick="detailQty++; document.getElementById('detailQty').textContent=detailQty">＋</button>
          </div>
          <button class="btn-gold" style="flex:1" onclick="addToCartFromDetail('${esc(p.id)}', detailQty)">Add to cart — €${p.price} →</button>
        </div>
        <div style="display:flex; gap:10px; margin-top:10px">
          <button class="btn-ghost ${wish?'active':''}" data-wish-btn="${esc(p.id)}" style="flex:1; ${wish?'background:var(--emerald); color:#00140D; border-color:var(--emerald)':''}" onclick="toggleWishlist('${esc(p.id)}')">${wish?'♥ Saved':'♡ Save to wishlist'}</button>
          <button class="btn-ghost" onclick="handleSocial('share','${esc(p.name)}')">Share</button>
        </div>
        <p style="font-size:0.72rem; color:var(--muted); margin-top:12px">Ships in 24H • 30-day thrive guarantee • Climate-positive pot</p>
      </div>
    </div>
  `;
  document.getElementById('productModal').classList.add('open'); document.body.style.overflow='hidden';
}

// ----- newsletter & private drop -----
async function handleNewsletter(e){
  e.preventDefault();
  const fd=new FormData(e.target); const email=String(fd.get('email')||'').trim();
  const btn=document.getElementById('newsletterBtn'); const orig=btn.textContent; btn.disabled=true; btn.textContent='…';
  try{
    await apiFetch('/api/newsletter',{method:'POST', body:JSON.stringify({email})});
    toast(`Welcome — check ${email} for invite`);
    e.target.reset();
  }catch(err){ toast(err.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=orig; }
}
function openPrivateDrop(){ document.getElementById('privateDropModal').classList.add('open'); document.body.style.overflow='hidden'; }
async function handlePrivateDrop(e){
  e.preventDefault();
  const fd=new FormData(e.target); const email=String(fd.get('email')||'').trim();
  const btn=document.getElementById('privateDropBtn'); const orig=btn.textContent; btn.disabled=true; btn.textContent='…';
  try{
    await apiFetch('/api/private-drop',{method:'POST', body:JSON.stringify({email})});
    toast(`Added to private drop — ${email} • 48h early access`);
    e.target.reset(); closeModal('privateDropModal');
  }catch(err){ toast(err.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=orig; }
}

// ----- modals: lookbook, journal, video, footer -----
function openLookbook(){ document.getElementById('lookbookModal').classList.add('open'); document.body.style.overflow='hidden'; renderLookbookPreview(); }
function openJournal(){ document.getElementById('journalModal').classList.add('open'); document.body.style.overflow='hidden'; }
function openVideo(){
  document.getElementById('videoModal').classList.add('open'); document.body.style.overflow='hidden';
  const v=document.getElementById('ritualVideo'); if(v){ v.currentTime=0; v.play().catch(()=>{}); }
}
function closeVideo(){
  const v=document.getElementById('ritualVideo'); if(v) v.pause();
  closeModal('videoModal');
}
const footerContent={
  obsidian:`<div class="kicker">Atelier • Obsidian Pots</div><h2>Matte obsidian.<br><em>carbon-negative.</em></h2><img src="https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=1100&q=80" style="width:100%; aspect-ratio:16/9; border-radius:16px; border:1px solid var(--border); margin:14px 0" loading="lazy" decoding="async"><p style="color:var(--muted); line-height:1.7">Each pot is wheel-thrown in Berlin, fired at 1240°C, glazed in matte obsidian. Hidden reservoir + wicking cord = 14 days without water. Carbon-negative clay, recycled packaging. Fits 12 months without repot. <br><br><strong style="color:var(--text)">Specs:</strong> 14cm — 18cm diameter • 1.2kg • hidden 180ml reservoir • breathable glaze • QR birth card.</p><button class="btn-gold" style="margin-top:14px" onclick="closeModal('genericModal'); document.querySelector('#collection').scrollIntoView({behavior:'smooth'})">Shop obsidian editions →</button>`,
  guarantee:`<div class="kicker">Support • Thrive Guarantee</div><h2>30-day thrive<br><em>guarantee.</em></h2><p style="color:var(--muted); margin-top:10px; line-height:1.7">If your botanical doesn't thrive in 30 days, we replace it free or refund fully — no photoshoot, no guilt. Just message hello@aurabotanics.co with your order ID.<br><br><strong style="color:var(--text)">What's covered:</strong> yellowing, drooping, reservoir issues, transit damage. <strong style="color:var(--text)">Not covered:</strong> intentional neglect beyond 21 days without water (reservoir lasts 14).<br><br>We also provide 14-day acclimation support — reply to your shipping email and a grower answers within 12h.</p><div style="display:flex; gap:10px; margin-top:14px"><button class="btn-gold" onclick="openFooterModal('contact')">Contact concierge →</button><button class="btn-ghost" onclick="closeModal('genericModal')">Okay</button></div>`,
  shipping:`<div class="kicker">Support • Shipping</div><h2>Ships in 24H.<br><em>carbon+.</em></h2><p style="color:var(--muted); margin-top:10px; line-height:1.7">All orders dispatch within 24H from Berlin (Mon–Fri). EU delivery 2–4 days, CH/UK 3–5. Climate-positive via DHL GoGreen — we offset 2× emissions.<br><br><strong style="color:var(--text)">Rates:</strong> EU €12, free over €200 • CH/UK €18 • Packaging is plastic-free, pulp-molded, home-compostable.<br><br>Live tracking via email. You'll get a 45s unboxing film for your exact plant.</p>`,
  returns:`<div class="kicker">Support • Returns</div><h2>Free returns.<br><em>14 days.</em></h2><p style="color:var(--muted); margin-top:10px; line-height:1.7">Not your energy? Return within 14 days, even if potted — we rehabilitate returns in our greenhouse. Email hello@aurabotanics.co — we send a prepaid label.<br><br><strong style="color:var(--text)">Refund:</strong> full within 48H of receipt. <strong style="color:var(--text)">Exchange:</strong> swap for another edition, we cover difference or refund it.</p>`,
  contact:`<div class="kicker">Support • Concierge</div><h2>Talk to a<br><em>human grower.</em></h2><p style="color:var(--muted); margin-top:10px">Usually replies in 4H (Berlin time). No bot.</p><form class="form-grid" style="margin-top:14px" onsubmit="handleContact(event)"><input name="name" placeholder="Your name" required><input name="email" type="email" placeholder="you@email.com" required><textarea name="msg" rows="4" placeholder="How can we help? — e.g. low light recommendation" required></textarea><button type="submit" class="btn-gold">Send message →</button></form><p style="font-size:0.82rem; color:var(--muted); margin-top:12px">Or: hello@aurabotanics.co • +49 30 2888 4720 • Rosenthaler Str. 72, 10119 Berlin (by appointment)</p>`,
  privacy:`<div class="kicker">Legal • Privacy</div><h2>Privacy.<br><em>no tracking maze.</em></h2><p style="color:var(--muted); margin-top:10px; line-height:1.7">We store only what we need: email for newsletter/private-drop (separate lists), order & cart for fulfillment. No third-party trackers, no sale of data. Backend is a minimal Express + db.json (see server.js).<br><br><strong style="color:var(--text)">Your rights:</strong> email hello@aurabotanics.co to delete your data — we wipe newsletter/privateDrop/orders within 48H.<br><br>Cookies: only HTTP-only JWT (aura_token) for auth, 7-day expiry. No analytics cookies.</p>`,
  imprint:`<div class="kicker">Legal • Imprint</div><h2>Imprint.<br><em>AURA BOTANICS GmbH</em></h2><p style="color:var(--muted); margin-top:10px; line-height:1.7">Rosenthaler Str. 72, 10119 Berlin, Germany<br>HRB 239481 B • USt-ID DE345678901<br>Managing directors: A. Rivera & J. Tanaka<br><br>Contact: hello@aurabotanics.co • +49 30 2888 4720<br><br>Design system: Syne + Space Grotesk, glassmorphism, obsidian palette. Built as single-file HTML with vanilla JS, no frameworks. Backend: Express (server.js) — see /api/health.</p>`,
  collection:`<div class="kicker">Atelier • Collection</div><h2>Jump to<br><em>collection.</em></h2><p style="color:var(--muted)">Scrolling you there — same glassmorphism, now backed by GET /api/products.</p>`,
  ritual:`<div class="kicker">Ritual & Care</div><h2>Ritual.<br><em>scrolling…</em></h2><p style="color:var(--muted)">Taking you to the ritual film and steps.</p>`
};
function openFooterModal(key){
  if(key==='collection'){ closeModal('genericModal'); document.querySelector('#collection').scrollIntoView({behavior:'smooth'}); return; }
  if(key==='ritual'){ closeModal('genericModal'); document.querySelector('#ritual').scrollIntoView({behavior:'smooth'}); return; }
  const html=footerContent[key]||`<p>Content for ${key} — coming soon.</p>`;
  document.getElementById('genericModalContent').innerHTML=html;
  document.getElementById('genericModal').classList.add('open'); document.body.style.overflow='hidden';
}
function handleContact(e){
  e.preventDefault();
  const fd=new FormData(e.target);
  toast(`Message sent — we'll reply to ${fd.get('email')} within 4H`);
  e.target.reset(); closeModal('genericModal');
}
function handleSocial(which, extra){
  if(which==='share'){
    const url=location.href;
    if(navigator.clipboard) navigator.clipboard.writeText(url+`#${extra||''}`).then(()=> toast('Link copied — share your shrine')).catch(()=> toast(url,'ok'));
    else toast(url,'ok');
    return;
  }
  const map={
    instagram:{label:'Instagram — @aurabotanics', url:'https://instagram.com', msg:'Opening Instagram — @aurabotanics (external)'},
    tiktok:{label:'TikTok — @aurabotanics', url:'https://tiktok.com', msg:'Opening TikTok — @aurabotanics'},
    arena:{label:'Are.na — aura-botanics', url:'https://are.na', msg:'Opening Are.na — aura-botanics (curated moodboards)'}
  };
  const m=map[which];
  if(m){
    toast(m.msg);
    // honor external but stay on page; after toast, offer to open
    setTimeout(()=> { if(confirm(`Open ${m.label} in new tab?`)) window.open(m.url,'_blank','noopener'); }, 400);
  }
}

// ----- generic modal helpers -----
function closeModal(id){ document.getElementById(id).classList.remove('open'); if(!document.querySelector('.modal-overlay.open') && !document.querySelector('.drawer.open') && !menu.classList.contains('open')) document.body.style.overflow=''; }
function handleOverlayClick(e,id){ if(e.target===document.getElementById(id)) closeModal(id); }

// ----- search & filter -----
let searchDebounce;
function bindSearch(){
  const nav=document.getElementById('navSearch');
  const col=document.getElementById('collectionSearch');
  const mob=document.getElementById('mobileSearch');
  function sync(val, src){
    currentSearch=val.trim();
    if(src!==nav) nav.value=val;
    if(src!==col) col.value=val;
    if(src!==mob) mob.value=val;
    clearTimeout(searchDebounce);
    searchDebounce=setTimeout(fetchProducts, 320);
  }
  [nav,col,mob].forEach(el=>{
    if(!el) return;
    el.addEventListener('input', ()=> sync(el.value, el));
    el.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ el.value=''; sync('',el); }});
  });
}
document.querySelectorAll('.chip[data-filter]').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    document.querySelectorAll('.chip[data-filter]').forEach(c=>c.classList.remove('is-active'));
    chip.classList.add('is-active');
    currentFilter=chip.dataset.filter;
    fetchProducts();
  });
});

// ----- mobile menu, reveal, smooth scroll -----
const ham=document.getElementById('hamburger'), menu=document.getElementById('mobileMenu');
ham.addEventListener('click', ()=> {
  menu.classList.toggle('open');
  if(menu.classList.contains('open')) document.body.style.overflow='hidden';
  else if(!document.querySelector('.modal-overlay.open') && !document.querySelector('.drawer.open')) document.body.style.overflow='';
});
function closeMenu(){ menu.classList.remove('open'); if(!document.querySelector('.modal-overlay.open') && !document.querySelector('.drawer.open')) document.body.style.overflow=''; }
const io=new IntersectionObserver((entries)=>{ entries.forEach(e=>{ if(e.isIntersecting) e.target.classList.add('in'); }); },{threshold:0.12});
document.querySelectorAll('.reveal').forEach(el=> io.observe(el));
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click', e=>{
    const id=a.getAttribute('href');
    if(id.length>1){
      e.preventDefault();
      document.querySelector(id)?.scrollIntoView({behavior:'smooth', block:'start'});
      history.pushState(null,'',id);
    }
  });
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape'){
    menu.classList.remove('open');
    closeCart(); closeVideo();
    document.querySelectorAll('.modal-overlay.open').forEach(m=> m.classList.remove('open'));
    if(!document.querySelector('.drawer.open') && !document.querySelector('.modal-overlay.open') && !menu.classList.contains('open')) document.body.style.overflow='';
  }
});
document.getElementById('cartPill').addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' ') {e.preventDefault(); openCart();}});

// ----- init -----
bindSearch();
renderAuthUI();
fetchMe();
fetchProducts().then(()=> loadCart()).then(()=> loadWishlist());
loadWishlist();
if(isAuthed()){
  apiFetch('/api/orders').then(r=>{ accountOrders=r.data||[]; renderCart(); }).catch(()=>{});
}

// keep cart count updated on storage events (multi-tab)
window.addEventListener('storage', (e)=>{ if(e.key===LS_CART||e.key===LS_WISH){ loadCart(); loadWishlist(); }});

// --------- ponytail: minimal single-file vanilla — no frameworks, no deps beyond server.js API ---------