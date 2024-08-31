const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

const testFranchise = { name: 'pizzaPocket', admins: [{ email: 'f@jwt.com' }] };
let testUserAuthToken;
let testFranchiseId;
let adminToken;
let adminUser;

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

// beforeAll(async () => {
//   // Register a test user and get the auth token
//   const registerRes = await request(app).post('/api/auth').send({
//     name: 'pizza franchisee',
//     email: 'f@jwt.com',
//     password: 'franchisee'
//   });
//   testUserAuthToken = registerRes.body.token;

//   // Create a test franchise
//   const franchiseRes = await request(app)
//     .post('/api/franchise')
//     .set('Authorization', `Bearer ${testUserAuthToken}`)
//     .send(testFranchise);
  
//   testFranchiseId = franchiseRes.body.id;
// });

describe('GET /api/franchise I think', () => {
  let franchiseName;
  beforeAll(async () => {
    const adminUser = await createAdminUser();
    const adminRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = adminRes.body.token;
    franchiseName = randomName()
    const newFranchise = { name: franchiseName, location: 'New York', admins: [adminUser] };

    await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newFranchise);
  }); 

  test('get all franchises', async () => {
    const res = await request(app).get('/api/franchise').set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: franchiseName })
      ])
    );
  });

});


//TODO: make a test that actually creates a franchise, connects it to a user, then verifies that specific franchise.
describe('GET /api/franchise/:userId', () => {
  let userToken;
  let userId;
  beforeAll(async () => {
    // Create an admin user and get the token
    adminUser = await createAdminUser();
    const adminRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = adminRes.body.token;

    const baseUser = { name: randomName(), email: `${randomName()}user@example.com`, password: 'userpassword' };
    const userRes = await request(app).post('/api/auth').send(baseUser);
    userToken = userRes.body.token;

    const userLoginRes = await request(app).put('/api/auth').send(baseUser);
    console.log(`userLoginRes: ${JSON.stringify(userLoginRes)}`);
    userId = userLoginRes.body.user.id;
  });

  test('should get user franchises successfully when user is an admin', async () => {
    const res = await request(app)
      .get(`/api/franchise/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  test('should get user franchises successfully when user requests own franchises', async () => {
    const res = await request(app)
      .get(`/api/franchise/${userId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  test('should fail to get franchises if user is unauthorized', async () => {
    const res = await request(app)
      .get(`/api/franchise/${userId}`);

    expect(res.status).toBe(401);
  });

  test('should fail to get franchises if user is not admin and requests franchises of another user', async () => {
    const otherUserId = userId + 1; // Assume another user ID exists for the test
    const res = await request(app)
      .get(`/api/franchise/${otherUserId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]); // Should return an empty array since the user isn't admin and can't access other users' franchises.
  });
});

describe('POST /api/franchise', () => {
  beforeAll(async () => {
    adminUser = await createAdminUser();
    const adminRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = adminRes.body.token;
  
  });

  test('should create a franchise successfully when user is an admin', async () => {
      const newFranchise = { name: randomName(), location: 'New York', admins: [adminUser] };

      const res = await request(app)
          .post('/api/franchise')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(newFranchise);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('name', newFranchise.name);
      expect(res.body).toHaveProperty('location', newFranchise.location);
  });

  test('create franchise without credentials', async () => {
    const registerRes = await request(app).post('/api/auth').send({
      name: 'pizza franchisee',
      email: 'f@jwt.com',
      password: 'franchisee'
    });
    testUserAuthToken = registerRes.body.token; 

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${testUserAuthToken}`)
      .send(testFranchise);
    expect(res.status).toBe(403);
  });

  test('should fail to create a franchise when admin has wrong email', async () => {
    const newAdmin = JSON.parse(JSON.stringify(adminUser));
    newAdmin.email = 'wrongemail@test.com'
    const newFranchise = { name: randomName(), location: 'New York', admins: [newAdmin] };

    const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newFranchise);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/franchise/:franchiseId', () => {
  beforeAll(async () => {
    adminUser = await createAdminUser();
    const adminRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = adminRes.body.token;
  });

  test('delete franchise without credentials', async () => {
    const registerRes = await request(app).post('/api/auth').send({
      name: 'pizza franchisee',
      email: 'f@jwt.com',
      password: 'franchisee'
    });
    testUserAuthToken = registerRes.body.token; 

    const res = await request(app)
      .delete(`/api/franchise/${testFranchiseId}`)
      .set('Authorization', `Bearer ${testUserAuthToken}`);
    expect(res.status).toBe(403);
  });

  test('delete franchise with credentials', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${testFranchiseId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message')
  });
});

describe('POST /api/franchise/:franchiseId/store', () => {
  let adminToken, franchiseId;

  beforeAll(async () => {
    // Create an admin user and get the token
    const adminUser = await createAdminUser();
    const adminRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = adminRes.body.token;

    // Create a franchise admin user and get the token
    const franchiseAdmin = { name: 'Franchise Admin', email: 'franchiseadmin@example.com', password: 'password' };
    await request(app).post('/api/auth').send(franchiseAdmin);
    // franchiseAdminToken = franchiseAdminRes.body.token;

    // Create a franchise with the franchise admin
    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: randomName(), location: 'New York', admins: [franchiseAdmin] });
    franchiseId = franchiseRes.body.id;
  });

  test('should create a store successfully when user is an admin', async () => {
    const newStore = { name: 'New Store', location: 'New York' };

    const res = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newStore);

    expect(res.status).toBe(200);
  });

  test('should fail to create a store when user is unauthorized', async () => {
    const newStore = { name: 'Unauthorized Store', location: 'Houston' };

    const res = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .send(newStore);

    expect(res.status).toBe(401);
  });

  test('should fail to create a store when user is not an admin or franchise admin', async () => {
    const newStore = { name: 'Store for Non-Admin', location: 'Chicago' };
    const baseUser = { name: 'Regular User', email: 'user@example.com', password: 'userpassword' };
    const userRes = await request(app).post('/api/auth').send(baseUser);
    const userToken = userRes.body.token;

    const res = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${userToken}`)
      .send(newStore);

    expect(res.status).toBe(403);
  });
});


describe('DELETE /api/franchise/:franchiseId/store/:storeId', () => {
  let adminToken, franchiseAdminToken, franchiseId, storeId;

  beforeAll(async () => {
    // Create an admin user and get the token
    const adminUser = await createAdminUser();
    const adminRes = await request(app).put('/api/auth').send(adminUser);
    adminToken = adminRes.body.token;

    // Create a franchise admin user and get the token
    const franchiseAdmin = { name: 'Franchise Admin', email: 'franchiseadmin@example.com', password: 'password' };
    const franchiseAdminRes = await request(app).post('/api/auth').send(franchiseAdmin);
    franchiseAdminToken = franchiseAdminRes.body.token;

    // Create a franchise with the franchise admin
    const franchiseRes = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: randomName(), location: 'New York', admins: [franchiseAdmin] });
    franchiseId = franchiseRes.body.id;

    // Create a store under the franchise
    const storeRes = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${franchiseAdminToken}`)
      .send({ name: 'Store to Delete', location: 'Houston' });
    storeId = storeRes.body.id;
  });

  test('should delete a store successfully when user is an admin', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'store deleted');
  });

  // test('should delete a store successfully when user is a franchise admin', async () => {
  //   // Recreate the store to delete
  //   const storeRes = await request(app)
  //     .post(`/api/franchise/${franchiseId}/store`)
  //     .set('Authorization', `Bearer ${franchiseAdminToken}`)
  //     .send({ name: 'Another Store to Delete', location: 'Los Angeles' });
  //   const anotherStoreId = storeRes.body.id;

  //   const res = await request(app)
  //     .delete(`/api/franchise/${franchiseId}/store/${anotherStoreId}`)
  //     .set('Authorization', `Bearer ${franchiseAdminToken}`);

  //   expect(res.status).toBe(200);
  //   expect(res.body).toHaveProperty('message', 'store deleted');
  // });

  test('should fail to delete a store when user is unauthorized', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`);

    expect(res.status).toBe(401);
  });

  test('should fail to delete a store when user is not an admin or franchise admin', async () => {
    const baseUser = { name: 'Regular User', email: 'user@example.com', password: 'userpassword' };
    const userRes = await request(app).post('/api/auth').send(baseUser);
    const userToken = userRes.body.token;

    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });
});

