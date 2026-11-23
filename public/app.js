const byId = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
let products = [];
let cart = [];
let messageTimer;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Ocurrió un error inesperado.');
  return body;
}

function showMessage(text, isError = false) {
  const element = byId('app-message');
  element.textContent = text;
  element.classList.toggle('error', isError);
  element.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { element.hidden = true; }, 4000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function loadDashboard() {
  const data = await api('/api/dashboard');
  byId('metric-products').textContent = data.productCount;
  byId('metric-stock').textContent = data.inventoryUnits;
  byId('metric-sales').textContent = data.todaySales;
  byId('metric-revenue').textContent = currency.format(data.todayRevenue);
  byId('recent-sales-body').innerHTML = data.recentSales.map((sale) => `
    <tr><td>Venta #${sale.id}</td><td>${dateFormat.format(new Date(`${sale.created_at.replace(' ', 'T')}Z`))}</td><td class="align-right">${currency.format(sale.total)}</td></tr>
  `).join('');
  byId('recent-empty').hidden = data.recentSales.length > 0;
}

async function loadProducts() {
  products = await api('/api/products');
  byId('products-body').innerHTML = products.map((product) => `
    <tr><td><span class="sale-name"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.description || 'Sin descripción')}</small></span></td>
    <td>${currency.format(product.price)}</td><td>${product.stock}</td>
    <td><div class="row-actions"><button class="text-button" data-edit="${product.id}">Editar</button><button class="text-button danger" data-delete="${product.id}">Eliminar</button></div></td></tr>
  `).join('');
  byId('products-empty').hidden = products.length > 0;
  byId('sale-product').innerHTML = products.filter((product) => product.stock > 0)
    .map((product) => `<option value="${product.id}">${escapeHtml(product.name)} · ${currency.format(product.price)} · ${product.stock} disp.</option>`)
    .join('');
  if (!byId('sale-product').options.length) byId('sale-product').innerHTML = '<option value="">Sin productos disponibles</option>';
}

async function loadHistory() {
  const sales = await api('/api/sales');
  byId('history-body').innerHTML = sales.map((sale) => {
    const items = sale.items.map((item) => `${escapeHtml(item.product_name)} × ${item.quantity}`).join(', ');
    return `<tr><td>Venta #${sale.id}</td><td>${dateFormat.format(new Date(`${sale.created_at.replace(' ', 'T')}Z`))}</td><td>${items}</td><td class="align-right">${currency.format(sale.total)}</td></tr>`;
  }).join('');
  byId('history-empty').hidden = sales.length > 0;
}

function renderCart() {
  byId('cart-body').innerHTML = cart.map((item, index) => `
    <tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${currency.format(item.price * item.quantity)}</td>
    <td><button class="text-button danger" data-remove-cart="${index}" aria-label="Quitar ${escapeHtml(item.name)}">Quitar</button></td></tr>
  `).join('');
  byId('cart-empty').hidden = cart.length > 0;
  byId('cart-total').textContent = currency.format(cart.reduce((sum, item) => sum + item.price * item.quantity, 0));
  byId('complete-sale').disabled = cart.length === 0;
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  byId('page-title').textContent = ({ dashboard: 'Resumen', products: 'Productos', 'new-sale': 'Nueva venta', history: 'Historial' })[name];
  if (name === 'dashboard') loadDashboard().catch((error) => showMessage(error.message, true));
  if (name === 'products' || name === 'new-sale') loadProducts().catch((error) => showMessage(error.message, true));
  if (name === 'history') loadHistory().catch((error) => showMessage(error.message, true));
}

function resetProductForm() {
  byId('product-form').reset();
  byId('product-id').value = '';
  byId('product-submit').textContent = 'Guardar producto';
  byId('product-cancel').hidden = true;
}

async function enterApp(user) {
  byId('login-view').hidden = true;
  byId('app-view').hidden = false;
  byId('logged-user').textContent = user.username;
  byId('today-label').textContent = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(new Date());
  showView('dashboard');
}

byId('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  byId('login-error').textContent = '';
  const form = new FormData(event.currentTarget);
  try {
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) });
    await enterApp(result.user);
  } catch (error) {
    byId('login-error').textContent = error.message;
  }
});

byId('logout-button').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  byId('app-view').hidden = true;
  byId('login-view').hidden = false;
  byId('login-form').reset();
});

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.go)));

byId('product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = byId('product-id').value;
  const product = {
    name: byId('product-name').value,
    description: byId('product-description').value,
    price: Number(byId('product-price').value),
    stock: Number(byId('product-stock').value)
  };
  try {
    await api(id ? `/api/products/${id}` : '/api/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(product) });
    resetProductForm();
    await loadProducts();
    showMessage(id ? 'Producto actualizado.' : 'Producto registrado.');
  } catch (error) { showMessage(error.message, true); }
});

byId('products-body').addEventListener('click', async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const product = products.find((item) => item.id === Number(editId));
    byId('product-id').value = product.id;
    byId('product-name').value = product.name;
    byId('product-description').value = product.description;
    byId('product-price').value = product.price;
    byId('product-stock').value = product.stock;
    byId('product-submit').textContent = 'Actualizar producto';
    byId('product-cancel').hidden = false;
    byId('product-name').focus();
  }
  if (deleteId && window.confirm('¿Eliminar este producto?')) {
    try { await api(`/api/products/${deleteId}`, { method: 'DELETE' }); await loadProducts(); showMessage('Producto eliminado.'); }
    catch (error) { showMessage(error.message, true); }
  }
});

byId('product-cancel').addEventListener('click', resetProductForm);
byId('cart-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const product = products.find((item) => item.id === Number(byId('sale-product').value));
  const quantity = Number(byId('sale-quantity').value);
  if (!product || !Number.isInteger(quantity) || quantity <= 0) return;
  const existing = cart.find((item) => item.id === product.id);
  if ((existing?.quantity || 0) + quantity > product.stock) return showMessage(`Solo hay ${product.stock} unidades de ${product.name}.`, true);
  if (existing) existing.quantity += quantity;
  else cart.push({ id: product.id, name: product.name, price: product.price, quantity });
  byId('sale-quantity').value = '1';
  renderCart();
});

byId('cart-body').addEventListener('click', (event) => {
  const index = Number(event.target.dataset.removeCart);
  if (Number.isInteger(index)) { cart.splice(index, 1); renderCart(); }
});

byId('complete-sale').addEventListener('click', async () => {
  try {
    await api('/api/sales', { method: 'POST', body: JSON.stringify({ items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })) }) });
    cart = [];
    renderCart();
    await loadProducts();
    await loadDashboard();
    showMessage('Venta registrada correctamente.');
  } catch (error) { showMessage(error.message, true); }
});

api('/api/me').then(({ user }) => user && enterApp(user)).catch(() => {});