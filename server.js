try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fsp = require('fs').promises;
const path = require('path');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aura-obsidian-secret-2026';
if (JWT_SECRET === 'aura-obsidian-secret-2026' && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET must be set in production');
  process.exit(1);
}
if (JWT_SECRET === 'aura-obsidian-secret-2026') console.warn('WARN: using default JWT_SECRET — set JWT_SECRET env in prod');
const DB_PATH = path.join(__dirname, 'db.json');

const app = express();
app.set('etag', 'weak');
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','Accept'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// ---------- DB helpers ----------
function seedProducts() {
  return [
    {
      id: 'p1',
      slug: 'monstera-obsidian',
      name: 'Monstera Obsidian',
      category: 'Monstera',
      tags: ['statement', 'focus'],
      price: 189,
      originalPrice: 240,
      rating: 4.9,
      reviews: 412,
      image: 'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=800&q=80',
      badge: 'Obsidian Edition',
      description: 'Fenestrated giant. Grown for desktops — compact root, oversized presence. Thrives on neglect and ambient light.',
      details: 'Low light tolerant • Hidden 14-day reservoir • Matte obsidian glaze • Height 45cm • Ships in 24h',
      inStock: true,
      leftStock: 86
    },
    {
      id: 'p2',
      slug: 'zen-bonsai-shun',
      name: 'Zen Bonsai — Shun',
      category: 'Bonsai',
      tags: ['calm', 'focus'],
      price: 340,
      originalPrice: 340,
      rating: 5.0,
      reviews: 189,
      image: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=800&q=80',
      badge: 'Wabi-Sabi • 12yr',
      description: 'Twelve years shaped by hand. A breathing timer for deep work. Includes ceramic tray & pruning ritual guide.',
      details: '12 years trained • Wabi-sabi pruning • Ceramic tray included • Indirect light • Height 32cm',
      inStock: true,
      leftStock: 12
    },
    {
      id: 'p3',
      slug: 'velvet-calathea',
      name: 'Velvet Calathea',
      category: 'Calathea',
      tags: ['statement', 'calm'],
      price: 89,
      originalPrice: 120,
      rating: 4.8,
      reviews: 276,
      image: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=80',
      badge: 'Rare • Velvet',
      description: 'Hypnotic patterned leaves that close at dusk. For creators who design by moodboard and moonlight.',
      details: 'Humidity lover • Velvet texture • Nyctinastic leaves • Height 28cm • Mist 2×/week',
      inStock: true,
      leftStock: 34
    },
    {
      id: 'p4',
      slug: 'phantom-philodendron',
      name: 'Phantom Philodendron',
      category: 'Philodendron',
      tags: ['statement', 'focus'],
      price: 219,
      originalPrice: 280,
      rating: 4.9,
      reviews: 156,
      image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=800&q=80',
      badge: 'Phantom • Preview',
      description: 'Rare white-variegated phantom with 18 sculpted leaves. Drops Nov 12 — obsidian pot, ghost-white variegation.',
      details: '18 leaves • Rare variegation • Low light resilient • Height 38cm • List price -20% for preview',
      inStock: true,
      leftStock: 8
    },
    {
      id: 'p5',
      slug: 'obsidian-snake-plant',
      name: 'Obsidian Snake Plant',
      category: 'Sansevieria',
      tags: ['calm', 'focus'],
      price: 129,
      originalPrice: 159,
      rating: 4.7,
      reviews: 342,
      image: 'https://images.unsplash.com/photo-1517191434949-5e90cd67d2b6?auto=format&fit=crop&w=800&q=80',
      badge: 'Obsidian Edition',
      description: 'Architectural snake plant in matte obsidian. The ultimate focus companion — thrives on neglect, purifies air.',
      details: 'Air purifying • Water 1×/10 days • Height 52cm • NASA-approved resilience • Hidden reservoir',
      inStock: true,
      leftStock: 41
    },
    {
      id: 'p6',
      slug: 'mini-jade',
      name: 'Mini Jade',
      category: 'Succulent',
      tags: ['calm', 'statement'],
      price: 69,
      originalPrice: 85,
      rating: 4.8,
      reviews: 98,
      image: 'https://images.unsplash.com/photo-1525498128493-380d1990a112?auto=format&fit=crop&w=800&q=80',
      badge: 'Petite • Easy',
      description: 'Compact jade succulent — tiny, glossy, impossibly resilient. Perfect for corners, shelves, and second monitors.',
      details: 'Petite 14cm • Succulent • Water 1×/14 days • Bright indirect light • Carbon-negative pot',
      inStock: true,
      leftStock: 62
    }
  ];
}

let dbCache = null;

async function loadDb() {
  if (dbCache) return dbCache;
  try {
    await fsp.access(DB_PATH);
    const raw = await fsp.readFile(DB_PATH, 'utf8');
    const db = JSON.parse(raw);
    let changed = false;
    if (!Array.isArray(db.users)) { db.users = []; changed = true; }
    if (!Array.isArray(db.products) || db.products.length === 0) { db.products = seedProducts(); changed = true; }
    if (!Array.isArray(db.newsletter)) { db.newsletter = []; changed = true; }
    if (!Array.isArray(db.orders)) { db.orders = []; changed = true; }
    if (!Array.isArray(db.privateDrops)) { db.privateDrops = []; changed = true; }
    if (db.products.length < 6) { db.products = seedProducts(); changed = true; }
    if (changed) await fsp.writeFile(DB_PATH, JSON.stringify(db, null, 2));
    dbCache = db;
    return db;
  } catch (_) {
    const db = { users: [], products: seedProducts(), newsletter: [], orders: [], privateDrops: [] };
    await fsp.writeFile(DB_PATH, JSON.stringify(db, null, 2));
    dbCache = db;
    return db;
  }
}

function readDb() {
  return dbCache;
}

function writeDb(_db) {
  // fire-and-forget async write to avoid blocking event loop
  fsp.writeFile(DB_PATH, JSON.stringify(dbCache, null, 2)).catch(err => console.error('DB write error', err));
}

// ---------- helpers ----------
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
function signToken(user) { return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' }); }
function ok(res, data, status = 200) { return res.status(status).json({ success: true, data }); }
function fail(res, error, status = 400) { return res.status(status).json({ success: false, error }); }
function sanitizeUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return fail(res, 'Missing token', 401);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = readDb();
    const user = db.users.find(x => x.id === decoded.id);
    if (!user) return fail(res, 'User not found', 401);
    req.user = user;
    req.db = db;
    next();
  } catch (e) {
    return fail(res, 'Invalid or expired token', 401);
  }
}

// ---------- health ----------
app.get('/api/health', (req, res) => {
  ok(res, { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString(), service: 'AURA BOTANICS' });
});

// ---------- auth ----------
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !String(name).trim()) return fail(res, 'Name is required');
  if (!email || !emailRegex.test(String(email).trim())) return fail(res, 'Valid email is required');
  if (!password || String(password).length < 6) return fail(res, 'Password must be at least 6 characters');
  const db = readDb();
  const normEmail = String(email).trim().toLowerCase();
  if (db.users.find(u => u.email.toLowerCase() === normEmail)) return fail(res, 'Email already registered', 409);
  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = {
    id: uid(),
    name: String(name).trim(),
    email: normEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
    addresses: [],
    wishlist: [],
    cart: []
  };
  db.users.push(user);
  writeDb(db);
  const token = signToken(user);
  ok(res, { token, user: { id: user.id, name: user.name, email: user.email } }, 201);
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !emailRegex.test(String(email).trim())) return fail(res, 'Valid email is required');
  if (!password) return fail(res, 'Password is required');
  const db = readDb();
  const normEmail = String(email).trim().toLowerCase();
  const user = db.users.find(u => u.email.toLowerCase() === normEmail);
  if (!user) return fail(res, 'Invalid email or password', 401);
  const match = await bcrypt.compare(String(password), user.passwordHash);
  if (!match) return fail(res, 'Invalid email or password', 401);
  const token = signToken(user);
  ok(res, { token, user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/api/auth/me', auth, (req, res) => {
  ok(res, sanitizeUser(req.user));
});

app.put('/api/auth/profile', auth, (req, res) => {
  const { name, email } = req.body || {};
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  if (name !== undefined) {
    if (!String(name).trim()) return fail(res, 'Name cannot be empty');
    user.name = String(name).trim();
  }
  if (email !== undefined) {
    const norm = String(email).trim().toLowerCase();
    if (!emailRegex.test(norm)) return fail(res, 'Valid email is required');
    if (db.users.some(u => u.id !== user.id && u.email.toLowerCase() === norm)) return fail(res, 'Email already in use', 409);
    user.email = norm;
  }
  writeDb(db);
  ok(res, sanitizeUser(user));
});

app.put('/api/auth/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return fail(res, 'currentPassword and newPassword are required');
  if (String(newPassword).length < 6) return fail(res, 'New password must be at least 6 characters');
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  const match = await bcrypt.compare(String(currentPassword), user.passwordHash);
  if (!match) return fail(res, 'Current password is incorrect', 401);
  user.passwordHash = await bcrypt.hash(String(newPassword), 10);
  writeDb(db);
  ok(res, { message: 'Password updated' });
});

app.post('/api/auth/addresses', auth, (req, res) => {
  const { label, street, city, zip, country } = req.body || {};
  if (!street || !city) return fail(res, 'street and city are required');
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  const addr = {
    label: label ? String(label).trim() : 'Home',
    street: String(street).trim(),
    city: String(city).trim(),
    zip: zip ? String(zip).trim() : '',
    country: country ? String(country).trim() : ''
  };
  user.addresses.push(addr);
  writeDb(db);
  ok(res, sanitizeUser(user), 201);
});

app.put('/api/auth/addresses/:idx', auth, (req, res) => {
  const idx = parseInt(req.params.idx, 10);
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  if (Number.isNaN(idx) || idx < 0 || idx >= user.addresses.length) return fail(res, 'Address not found', 404);
  const { label, street, city, zip, country } = req.body || {};
  const cur = user.addresses[idx];
  if (label !== undefined) cur.label = String(label).trim();
  if (street !== undefined) cur.street = String(street).trim();
  if (city !== undefined) cur.city = String(city).trim();
  if (zip !== undefined) cur.zip = String(zip).trim();
  if (country !== undefined) cur.country = String(country).trim();
  writeDb(db);
  ok(res, sanitizeUser(user));
});

app.delete('/api/auth/addresses/:idx', auth, (req, res) => {
  const idx = parseInt(req.params.idx, 10);
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  if (Number.isNaN(idx) || idx < 0 || idx >= user.addresses.length) return fail(res, 'Address not found', 404);
  user.addresses.splice(idx, 1);
  writeDb(db);
  ok(res, sanitizeUser(user));
});

// ---------- products ----------
app.get('/api/products', (req, res) => {
  const db = readDb();
  let list = [...db.products];
  const { filter, search, sort } = req.query;
  if (filter && filter !== 'all') {
    const f = String(filter).toLowerCase().trim();
    list = list.filter(p => p.tags.map(t => t.toLowerCase()).includes(f) || p.category.toLowerCase() === f);
  }
  if (search) {
    const q = String(search).toLowerCase().trim();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.join(' ').toLowerCase().includes(q) ||
      (p.badge && p.badge.toLowerCase().includes(q))
    );
  }
  if (sort) {
    const s = String(sort).toLowerCase();
    if (s === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (s === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (s === 'rating') list.sort((a, b) => b.rating - a.rating);
    else if (s === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (s === 'reviews') list.sort((a, b) => b.reviews - a.reviews);
  }
  res.set('Cache-Control', 'public, max-age=60, must-revalidate');
  res.set('Last-Modified', new Date().toUTCString());
  ok(res, list);
});

app.get('/api/products/:id', (req, res) => {
  const db = readDb();
  const id = req.params.id;
  const p = db.products.find(x => x.id === id || x.slug === id);
  if (!p) return fail(res, 'Product not found', 404);
  res.set('Cache-Control', 'public, max-age=60, must-revalidate');
  ok(res, p);
});

// ---------- cart (protected) ----------
function enrichCart(user, db) {
  const items = (user.cart || []).map(ci => {
    const prod = db.products.find(p => p.id === ci.productId);
    if (!prod) return null;
    return {
      productId: prod.id,
      slug: prod.slug,
      name: prod.name,
      price: prod.price,
      originalPrice: prod.originalPrice,
      image: prod.image,
      qty: ci.qty,
      subtotal: prod.price * ci.qty,
      inStock: prod.inStock,
      leftStock: prod.leftStock
    };
  }).filter(Boolean);
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  return { items, total, count: items.reduce((s, i) => s + i.qty, 0) };
}

app.get('/api/cart', auth, (req, res) => {
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  ok(res, enrichCart(user, db));
});

app.post('/api/cart', auth, (req, res) => {
  const { productId, qty = 1 } = req.body || {};
  if (!productId) return fail(res, 'productId is required');
  const q = parseInt(qty, 10);
  if (Number.isNaN(q) || q < 1) return fail(res, 'qty must be >= 1');
  const db = req.db;
  const prod = db.products.find(p => p.id === productId || p.slug === productId);
  if (!prod) return fail(res, 'Product not found', 404);
  if (!prod.inStock) return fail(res, 'Product out of stock', 400);
  if (q > prod.leftStock) return fail(res, `Only ${prod.leftStock} left`, 400);
  const user = db.users.find(u => u.id === req.user.id);
  user.cart = user.cart.filter(c=> db.products.find(p=>p.id===c.productId));
  const existing = user.cart.find(c => c.productId === prod.id);
  if (existing) { if (existing.qty + q > prod.leftStock) return fail(res, `Only ${prod.leftStock} left`, 400); existing.qty += q; }
  else user.cart.push({ productId: prod.id, qty: q });
  writeDb(db);
  ok(res, enrichCart(user, db), 201);
});

app.put('/api/cart/:productId', auth, (req, res) => {
  const pid = req.params.productId;
  const { qty } = req.body || {};
  const q = parseInt(qty, 10);
  if (Number.isNaN(q) || q < 0) return fail(res, 'qty must be >= 0');
  const db = req.db;
  const prod = db.products.find(p => p.id === pid);
  if (prod && q > prod.leftStock) return fail(res, `Only ${prod.leftStock} left`, 400);
  const user = db.users.find(u => u.id === req.user.id);
  const item = user.cart.find(c => c.productId === pid);
  if (!item) return fail(res, 'Item not in cart', 404);
  if (q === 0) user.cart = user.cart.filter(c => c.productId !== pid);
  else item.qty = q;
  writeDb(db);
  ok(res, enrichCart(user, db));
});

app.delete('/api/cart/:productId', auth, (req, res) => {
  const pid = req.params.productId;
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  const len = user.cart.length;
  user.cart = user.cart.filter(c => c.productId !== pid);
  if (user.cart.length === len) return fail(res, 'Item not in cart', 404);
  writeDb(db);
  ok(res, enrichCart(user, db));
});

app.delete('/api/cart', auth, (req, res) => {
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  user.cart = [];
  writeDb(db);
  ok(res, enrichCart(user, db));
});

// ---------- wishlist ----------
app.get('/api/wishlist', auth, (req, res) => {
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  const items = (user.wishlist || []).map(pid => db.products.find(p => p.id === pid)).filter(Boolean);
  ok(res, items);
});

app.post('/api/wishlist', auth, (req, res) => {
  const { productId } = req.body || {};
  if (!productId) return fail(res, 'productId is required');
  const db = req.db;
  const prod = db.products.find(p => p.id === productId || p.slug === productId);
  if (!prod) return fail(res, 'Product not found', 404);
  const user = db.users.find(u => u.id === req.user.id);
  if (!user.wishlist.includes(prod.id)) user.wishlist.push(prod.id);
  writeDb(db);
  const items = user.wishlist.map(pid => db.products.find(p => p.id === pid)).filter(Boolean);
  ok(res, items, 201);
});

app.delete('/api/wishlist/:productId', auth, (req, res) => {
  const pid = req.params.productId;
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  const before = user.wishlist.length;
  user.wishlist = user.wishlist.filter(id => id !== pid);
  if (user.wishlist.length === before) return fail(res, 'Item not in wishlist', 404);
  writeDb(db);
  const items = user.wishlist.map(id => db.products.find(p => p.id === id)).filter(Boolean);
  ok(res, items);
});

// ---------- newsletter ----------
app.post('/api/newsletter', (req, res) => {
  const { email } = req.body || {};
  if (!email || !emailRegex.test(String(email).trim())) return fail(res, 'Valid email is required');
  const norm = String(email).trim().toLowerCase();
  const db = readDb();
  if (db.newsletter.find(n => n.email.toLowerCase() === norm)) return fail(res, 'Already subscribed', 409);
  db.newsletter.push({ email: norm, createdAt: new Date().toISOString() });
  writeDb(db);
  ok(res, { message: 'Subscribed', email: norm }, 201);
});

app.get('/api/newsletter', (req, res) => {
  const db = readDb();
  ok(res, db.newsletter);
});

// ---------- private drop ----------
app.post('/api/private-drop', (req, res) => {
  const { email } = req.body || {};
  if (!email || !emailRegex.test(String(email).trim())) return fail(res, 'Valid email is required');
  const norm = String(email).trim().toLowerCase();
  const db = readDb();
  if (db.privateDrops.find(x => x.email.toLowerCase() === norm)) return fail(res, 'Already on the list', 409);
  db.privateDrops.push({ email: norm, createdAt: new Date().toISOString() });
  writeDb(db);
  ok(res, { message: 'Added to private drop', email: norm }, 201);
});

// ---------- orders / checkout ----------
app.post('/api/orders/checkout', auth, (req, res) => {
  const { shippingAddress } = req.body || {};
  if (!shippingAddress) return fail(res, 'shippingAddress is required');
  const db = req.db;
  const user = db.users.find(u => u.id === req.user.id);
  if (!user.cart || user.cart.length === 0) return fail(res, 'Cart is empty', 400);
  const items = user.cart.map(ci => {
    const prod = db.products.find(p => p.id === ci.productId);
    if (!prod) return null;
    return { productId: prod.id, name: prod.name, price: prod.price, qty: ci.qty, image: prod.image };
  }).filter(Boolean);
  if (items.length === 0) return fail(res, 'Cart contains invalid products', 400);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = total >= 200 ? 0 : 12;
  const grandTotal = total + shipping;
  user.cart.forEach(ci => { const pr=db.products.find(p=>p.id===ci.productId); if(pr){ pr.leftStock=Math.max(0, pr.leftStock - ci.qty); if(pr.leftStock===0) pr.inStock=false; } });
  const order = {
    id: 'ord_' + uid(),
    userId: user.id,
    items,
    total,
    shipping,
    grandTotal,
    shippingAddress: typeof shippingAddress === 'string' ? { street: shippingAddress } : shippingAddress,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  user.cart = [];
  writeDb(db);
  ok(res, order, 201);
});

app.get('/api/orders', auth, (req, res) => {
  const db = req.db;
  const list = db.orders.filter(o => o.userId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  ok(res, list);
});

app.get('/api/orders/:id', auth, (req, res) => {
  const db = req.db;
  const order = db.orders.find(o => o.id === req.params.id && o.userId === req.user.id);
  if (!order) return fail(res, 'Order not found', 404);
  ok(res, order);
});

// ---------- static + SPA fallback ----------
// block sensitive files from being served statically
app.get('/db.json', (req,res)=> fail(res,'Not found',404));
app.get('/db.json*', (req,res)=> fail(res,'Not found',404));
app.get('/.env', (req,res)=> fail(res,'Not found',404));
app.get('/server.js', (req,res)=> fail(res,'Not found',404));
app.get('/package.json', (req,res)=> fail(res,'Not found',404));
app.get('/package-lock.json', (req,res)=> fail(res,'Not found',404));
app.use('/api', (req,res)=> fail(res,'Not found',404));
// serve static files from current dir (where index.html lives)
// Note: express.static must be after /api routes so API takes precedence
app.use(express.static(__dirname, {
  dotfiles: 'ignore',
  index: false,
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    }
  }
}));

// SPA fallback: for non-API GETs that weren't matched as files, serve index.html
app.get('*', async (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  const idx = path.join(__dirname, 'index.html');
  try {
    await fsp.access(idx);
    res.sendFile(idx);
  } catch {
    res.status(404).json({ success: false, error: 'Not found' });
  }
});

// ---------- error handler ----------
app.use((err, req, res, _next) => {
  console.error(err);
  fail(res, err.message || 'Internal server error', 500);
});

// ---------- start ----------
(async () => {
  await loadDb();
  app.listen(PORT, () => {
    console.log(`AURA BOTANICS API running on http://localhost:${PORT}`);
    console.log(`DB: ${DB_PATH}`);
  });
})();
