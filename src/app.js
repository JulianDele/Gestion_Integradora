const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const path = require('node:path');
const client = require('prom-client');
const { createDatabase } = require('./db');

function createApp(options = {}) {
  const db = options.db || createDatabase(options.dbPath);
  const app = express();
  const metrics = new client.Registry();
  client.collectDefaultMetrics({ register: metrics });
  const responseDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duracion de solicitudes HTTP en segundos.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [metrics]
  });
  const responseErrors = new client.Counter({
    name: 'http_request_errors_total',
    help: 'Solicitudes HTTP con respuesta de error (status 4xx/5xx).',
    labelNames: ['method', 'route', 'status_code'],
    registers: [metrics]
  });
  const staticDir = path.join(__dirname, '..', 'dist');
  const publicDir = path.join(__dirname, '..', 'public');

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const labels = {
        method: req.method,
        route: req.route ? req.route.path : req.path,
        status_code: String(res.statusCode)
      };
      responseDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
      if (res.statusCode >= 400) responseErrors.inc(labels);
    });
    next();
  });
  app.use(session({
    name: 'ventas.sid',
    secret: process.env.SESSION_SECRET || 'development-secret-change-before-deploy',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true'
        || (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production'),
      maxAge: 8 * 60 * 60 * 1000
    }
  }));

  const requireAuth = (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Inicia sesion para continuar.' });
    next();
  };

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Usuario y contrasena son obligatorios.' });
    }

    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username.trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    req.session.regenerate((error) => {
      if (error) return res.status(500).json({ error: 'No se pudo iniciar la sesion.' });
      req.session.user = { id: user.id, username: user.username };
      res.json({ user: req.session.user });
    });
  });

  app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.clearCookie('ventas.sid').status(204).end());
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.contentType).send(await metrics.metrics());
  });

  app.get('/api/dashboard', requireAuth, (req, res) => {
    const products = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
    const inventory = db.prepare('SELECT COALESCE(SUM(stock), 0) AS units FROM products').get().units;
    const sales = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
      FROM sales WHERE date(created_at) = date('now', 'localtime')
    `).get();
    const recentSales = db.prepare('SELECT id, total, created_at FROM sales ORDER BY id DESC LIMIT 5').all();
    res.json({ productCount: products, inventoryUnits: inventory, todaySales: sales.count, todayRevenue: sales.revenue, recentSales });
  });

  app.get('/api/products', requireAuth, (req, res) => {
    res.json(db.prepare('SELECT id, name, description, price, stock, created_at FROM products ORDER BY name').all());
  });

  app.post('/api/products', requireAuth, (req, res) => {
    const { name, description = '', price, stock } = req.body || {};
    if (!validProduct({ name, description, price, stock })) {
      return res.status(400).json({ error: 'Revisa nombre, precio y existencias del producto.' });
    }
    const result = db.prepare('INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)')
      .run(name.trim(), description.trim(), Number(price), Number(stock));
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
  });

  app.put('/api/products/:id', requireAuth, (req, res) => {
    const productId = Number(req.params.id);
    const { name, description = '', price, stock } = req.body || {};
    if (!Number.isInteger(productId) || !validProduct({ name, description, price, stock })) {
      return res.status(400).json({ error: 'Datos del producto no validos.' });
    }
    const result = db.prepare('UPDATE products SET name = ?, description = ?, price = ?, stock = ? WHERE id = ?')
      .run(name.trim(), description.trim(), Number(price), Number(stock), productId);
    if (!result.changes) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(productId));
  });

  app.delete('/api/products/:id', requireAuth, (req, res) => {
    const result = db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.status(204).end();
  });

  app.post('/api/sales', requireAuth, (req, res) => {
    const items = req.body && req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Agrega al menos un producto a la venta.' });
    }

    try {
      const createSale = db.transaction(() => {
        const quantities = new Map();
        for (const item of items) {
          const productId = Number(item.productId);
          const quantity = Number(item.quantity);
          if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
            throw new Error('Producto o cantidad no validos.');
          }
          quantities.set(productId, (quantities.get(productId) || 0) + quantity);
        }

        const saleProducts = [...quantities].map(([productId, quantity]) => {
          const product = db.prepare('SELECT id, name, price, stock FROM products WHERE id = ?').get(productId);
          if (!product) throw new Error('Uno de los productos no existe.');
          if (product.stock < quantity) throw new Error(`Existencias insuficientes para ${product.name}.`);
          return { ...product, quantity };
        });

        const total = saleProducts.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const saleResult = db.prepare('INSERT INTO sales (total) VALUES (?)').run(total);
        const insertItem = db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price)
          VALUES (?, ?, ?, ?, ?)
        `);
        const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
        for (const item of saleProducts) {
          insertItem.run(saleResult.lastInsertRowid, item.id, item.name, item.quantity, item.price);
          updateStock.run(item.quantity, item.id);
        }
        return { id: saleResult.lastInsertRowid, total, items: saleProducts };
      });

      res.status(201).json(createSale());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/sales', requireAuth, (req, res) => {
    const sales = db.prepare('SELECT id, total, created_at FROM sales ORDER BY id DESC').all();
    const getItems = db.prepare('SELECT product_name, quantity, unit_price FROM sale_items WHERE sale_id = ?');
    res.json(sales.map((sale) => ({ ...sale, items: getItems.all(sale.id) })));
  });

  app.use(express.static(require('node:fs').existsSync(staticDir) ? staticDir : publicDir));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  return { app, db };
}

function validProduct({ name, description, price, stock }) {
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 120
    && typeof description === 'string'
    && Number.isFinite(Number(price)) && Number(price) > 0
    && Number.isInteger(Number(stock)) && Number(stock) >= 0;
}

module.exports = { createApp, validProduct };