const { validProduct } = require('../src/app');

describe('validacion de productos', () => {
  test('acepta un producto con nombre, precio positivo y stock entero', () => {
    expect(validProduct({ name: 'Cuaderno', description: '', price: 12.5, stock: 3 })).toBe(true);
  });

  test.each([
    [{ name: ' ', description: '', price: 10, stock: 1 }],
    [{ name: 'Producto', description: '', price: 0, stock: 1 }],
    [{ name: 'Producto', description: '', price: 10, stock: -1 }],
    [{ name: 'Producto', description: '', price: 10, stock: 1.5 }]
  ])('rechaza datos fuera de las reglas: %o', (product) => {
    expect(validProduct(product)).toBe(false);
  });
});