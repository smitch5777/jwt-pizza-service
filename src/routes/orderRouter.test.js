const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
user.name = randomName();
user.email = user.name + '@admin.com';

await DB.addUser(user);

user.password = 'toomanysecrets';
return user;
}

describe('GET /api/order/menu', () => {
  test('should retrieve the menu successfully', async () => {
    const res = await request(app).get('/api/order/menu');

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });
});

describe('PUT /api/order/menu', () => {
  let adminToken;

  beforeAll(async () => {
    const adminUser = await createAdminUser();
    const adminRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = adminRes.body.token;
  });

  test('should add a menu item successfully when user is an admin', async () => {
    const newMenuItem = { title: 'Random Pizza', description: 'not normal, normally', image: 'asdf', price: 9.99 };

    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newMenuItem);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining(newMenuItem)]));
  });

  test('should fail to add a menu item when user is unauthorized', async () => {
    const newMenuItem = { name: 'Burger', price: 7.99 };

    const res = await request(app)
      .put('/api/order/menu')
      .send(newMenuItem);

    expect(res.status).toBe(401);
  });

  test('should fail to add a menu item when user is not an admin', async () => {
    const baseUser = { name: 'Regular User', email: 'user@example.com', password: 'userpassword' };
    const userRes = await request(app).post('/api/auth').send(baseUser);
    const userToken = userRes.body.token;

    const newMenuItem = { name: 'Pasta', price: 12.99 };

    const res = await request(app)
      .put('/api/order/menu')
      .set('Authorization', `Bearer ${userToken}`)
      .send(newMenuItem);

    expect(res.status).toBe(403);
  });
});


describe('GET /api/order', () => {
  let userToken;

  beforeAll(async () => {
    const baseUser = { name: 'Regular User', email: 'user@example.com', password: 'userpassword' };
    const userRes = await request(app).post('/api/auth').send(baseUser);
    userToken = userRes.body.token;
  });

  test('should retrieve orders successfully when user is authenticated', async () => {
    const res = await request(app)
      .get('/api/order')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Object);
  });

  test('should fail to retrieve orders when user is unauthorized', async () => {
    const res = await request(app).get('/api/order');

    expect(res.status).toBe(401);
  });
});


describe('POST /api/order', () => {
  let userToken;

  beforeAll(async () => {
    const baseUser = { name: 'Regular User', email: 'user@example.com', password: 'userpassword' };
    const userRes = await request(app).post('/api/auth').send(baseUser);
    userToken = userRes.body.token;
  });

  test('should create order successfully', async () => {
    const orderToSend = {
      franchiseId: 1,
      storeId: 1,
      items: [
        { menuId: 1, description: 'Veggie', price: 0.05 }
      ]
    }
    const res = await request(app).post('/api/order')
    .set('Authorization', `Bearer ${userToken}`)
    .send(orderToSend);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Object);
  })
});

