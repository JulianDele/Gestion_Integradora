const request = require('supertest');
const { createDatabase } = require('../src/db');
const { createApp } = require('../src/app');

describe('API de gestion de ventas', () => {
  let db;
  let client;

  beforeEach(() => {
    db = createDatabase(':memory:');
    const { app } = createApp({ db });
    client = request.agent(app);
  });

  afterEach(() => db.close());

  test('requiere iniciar sesion y rechaza credenciales incorrectas', async () => {
    await client.get('/api/products').expect(401);
    await client.post('/api/login').send({ username: 'admin', password: 'incorrecta' }).expect(401);
    await client.post('/api/login').send({ username: 'admin', password: 'admin123' }).expect(200);
    await client.get('/api/products').expect(200, []);
  });

  test('crea producto, registra venta, descuenta inventario y muestra historial', async () => {
    await client.post('/api/login').send({ username: 'admin', password: 'admin123' }).expect(200);
    const productResponse = await client.post('/api/products')
      .send({ name: 'Teclado', description: 'USB', price: 25.5, stock: 4 })
      .expect(201);

    const saleResponse = await client.post('/api/sales')
      .send({ items: [{ productId: productResponse.body.id, quantity: 2 }] })
      .expect(201);

    expect(saleResponse.body.total).toBe(51);
    expect((await client.get('/api/products')).body[0].stock).toBe(2);
    expect((await client.get('/api/sales')).body[0].items[0].quantity).toBe(2);
  });

  test('actualiza y elimina productos del catalogo', async () => {
    await client.post('/api/login').send({ username: 'admin', password: 'admin123' });
    const product = await client.post('/api/products').send({ name: 'Libreta', price: 5, stock: 8 });

    const updated = await client.put(`/api/products/${product.body.id}`)
      .send({ name: 'Libreta grande', price: 7, stock: 6 })
      .expect(200);
    expect(updated.body.name).toBe('Libreta grande');
    await client.delete(`/api/products/${product.body.id}`).expect(204);
    await client.get('/api/products').expect(200, []);
  });

  test('no registra una venta que exceda las existencias', async () => {
    await client.post('/api/login').send({ username: 'admin', password: 'admin123' });
    const product = await client.post('/api/products').send({ name: 'Mouse', price: 10, stock: 1 });

    await client.post('/api/sales')
      .send({ items: [{ productId: product.body.id, quantity: 2 }] })
      .expect(400);
    expect((await client.get('/api/products')).body[0].stock).toBe(1);
  });
});