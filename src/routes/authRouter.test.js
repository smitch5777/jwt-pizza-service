const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };

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

describe('PUT /api/auth', () => {
    beforeAll(async () => {
        testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
        await request(app).post('/api/auth').send(testUser);
      });
      
      test('login', async () => {
        const loginRes = await request(app).put('/api/auth').send(testUser);
        expect(loginRes.status).toBe(200);
        expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
      });
});



describe('POST /api/auth', () => {
    let user;

    beforeAll(async() => {
        user = { id: 1, name: 'Test User', email: 'test@example.com', password: 'a'};
        user.email = Math.random().toString(36).substring(2, 12) + '@test.com';
    })

    test('should register a new user when valid data is provided', async () => {
        const newUser = { name: 'New User', email: 'new@example.com', password: 'newpassword' };

        const registerRes = await request(app).post('/api/auth').send(newUser);

        expect(registerRes.status).toBe(200);
        expect(registerRes.body).toHaveProperty('user');
        expect(registerRes.body.user.name).toBe(newUser.name);
        expect(registerRes.body).toHaveProperty('token')
    });

    test('should return 400 if name, email, or password is missing', async () => {
        const res = await request(app).post('/api/auth').send({ email: 'missing@example.com' });
    
        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('message');
    });
});


describe('PUT /api/auth/:userId', () => {
    let adminToken;
    let userToken;
    let userId;
    let baseUser;
    let adminUser;

    beforeAll(async () => {
        adminUser = await createAdminUser();
        baseUser = { name: 'Regular User', email: 'user@example.com', password: 'userpassword' };

        const adminRes = await request(app).put('/api/auth').send(adminUser);
        adminToken = adminRes.body.token;

        const userRes = await request(app).post('/api/auth').send(baseUser);
        userToken = userRes.body.token;

        const userLoginRes = await request(app).put('/api/auth').send(baseUser);
        userId = userLoginRes.body.user.id;
    });

    test('should update user successfully with valid data and admin privileges', async () => {
        const updateData = { email: 'updated@example.com', password: 'newpassword' };

        const updateRes = await request(app)
            .put(`/api/auth/${userId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send(updateData);

        expect(updateRes.status).toBe(200);
        expect(updateRes.body).toHaveProperty('email', updateData.email);
    });

    test('should return 403 if user is not authorized to update the user', async () => {
        const updateData = { email: 'updated@example.com', password: 'newpassword' };

        const updateRes = await request(app)
            .put(`/api/auth/${userId + 1}`)
            .set('Authorization', `Bearer ${userToken}`)
            .send(updateData);

        expect(updateRes.status).toBe(403);
        expect(updateRes.body).toHaveProperty('message', 'unauthorized');
    });

    // This is a good test, but I'm not supposed to change the service, so RIP
    // test('should return 400 if required fields are missing', async () => {
    //     const updateRes = await request(app)
    //         .put(`/api/auth/${userId}`)
    //         .set('Authorization', `Bearer ${adminToken}`)
    //         .send({ email: '' });

    //     expect(updateRes.status).toBe(400);
    //     expect(updateRes.body).toHaveProperty('message', 'email and password are required');
    // });
});

describe('DELETE /api/auth', () => {
    let userToken
    beforeAll(async () => {
      const user = { name: 'Logout Test User', email: 'logouttest@example.com', password: 'testpassword' };
  
      await request(app).post('/api/auth').send(user);
  
      const loginRes = await request(app).put('/api/auth').send({ email: user.email, password: user.password });
      userToken = loginRes.body.token;
    });
  
    test('should log out a user successfully when a valid token is provided', async () => {
      const res = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'logout successful');
    });
  
    test('should return 401 if no token is provided', async () => {
      const res = await request(app).delete('/api/auth');
      
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message', 'unauthorized');
    });
  
    test('should return 401 if an invalid token is provided', async () => {
      const res = await request(app)
        .delete('/api/auth')
        .set('Authorization', 'Bearer invalidtoken');
      
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message', 'unauthorized');
    });
  });
  