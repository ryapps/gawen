import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import argon2 from "argon2";
import express from "express";
import request from "supertest";
import app from "../src/app.js";
import { requireAuth, requireOrganizationRole } from "../src/middlewares/auth.middleware.js";
import errorHandler from "../src/middlewares/error.middleware.js";
import prisma from "../src/lib/prisma.js";

const TEST_PASSWORD = "Correct-Horse-Battery-42!";
const REGISTRATION_MESSAGE =
  "Jika registrasi dapat diproses, akun telah dibuat. Silakan masuk.";
const userIds = new Set<string>();
const organizationIds = new Set<string>();
const testIps = new Set<string>();
let authorizationApp: express.Express;
let nextTestIp = 1;

type TestUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  memberships: {
    id: string;
    role: string;
    organization: { id: string; name: string; timezone: string };
  }[];
};

type TestAuthResponse = {
  status: number;
  body: {
    data: {
      accessToken: string;
      tokenType: string;
      expiresAt: string;
      user: TestUser;
      businessJoinCode?: string;
    };
  };
  signup?: request.Response;
};

function nextIp(): string {
  return `198.51.100.${nextTestIp++}`;
}

function fromIp(ip: string) {
  testIps.add(ip);
  return (target: express.Express) => ({
    get: (path: string) =>
      request(target).get(path).set("x-forwarded-for", ip),
    post: (path: string) =>
      request(target).post(path).set("x-forwarded-for", ip),
  });
}

function submitOwnerRegistration(
  email = `owner-${randomUUID()}@example.test`,
  ip = nextIp(),
) {
  return fromIp(ip)(app).post("/api/auth/register").send({
    name: "Test Owner",
    email,
    password: TEST_PASSWORD,
    organizationName: "Test Organization",
  });
}

function submitEmployeeRegistration(
  email = `employee-${randomUUID()}@example.test`,
  ip = nextIp(),
) {
  return fromIp(ip)(app).post("/api/auth/register/employee").send({
    name: "Test Employee",
    email,
    password: TEST_PASSWORD,
  });
}

async function loginAccount(email: string): Promise<request.Response> {
  return fromIp(nextIp())(app).post("/api/auth/login").send({
    email,
    password: TEST_PASSWORD,
  });
}

async function registration(
  email = `owner-${randomUUID()}@example.test`,
  ip = nextIp(),
): Promise<TestAuthResponse> {
  const signup = await submitOwnerRegistration(email, ip);
  assert.equal(signup.status, 202);
  assert.deepEqual(signup.body, {
    status: "ok",
    message: REGISTRATION_MESSAGE,
  });
  const login = await loginAccount(email.toLowerCase());
  assert.equal(login.status, 200);
  const organizationId = login.body.data.user.memberships[0].organization.id as string;
  const code = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${organizationId}/business-code/rotate`)
    .set("Authorization", `Bearer ${login.body.data.accessToken}`);
  assert.equal(code.status, 200);
  return {
    status: signup.status,
    signup,
    body: {
      data: {
        ...login.body.data,
        businessJoinCode: code.body.data.businessCode,
      },
    },
  };
}

async function employeeRegistration(
  email = `employee-${randomUUID()}@example.test`,
  ip = nextIp(),
): Promise<TestAuthResponse> {
  const signup = await submitEmployeeRegistration(email, ip);
  assert.equal(signup.status, 202);
  assert.deepEqual(signup.body, {
    status: "ok",
    message: REGISTRATION_MESSAGE,
  });
  const login = await loginAccount(email.toLowerCase());
  assert.equal(login.status, 200);
  return { status: signup.status, signup, body: login.body };
}

function rememberUser(response: TestAuthResponse): {
  userId: string;
  organizationId: string;
  token: string;
} {
  const { accessToken, user } = response.body.data;
  userIds.add(user.id);
  for (const membership of user.memberships) {
    organizationIds.add(membership.organization.id);
  }

  return {
    userId: user.id,
    organizationId: user.memberships[0].organization.id,
    token: accessToken,
  };
}

function rememberStandaloneUser(response: TestAuthResponse): {
  userId: string;
  token: string;
} {
  const { accessToken, user } = response.body.data;
  userIds.add(user.id);
  assert.deepEqual(user.memberships, []);
  return { userId: user.id, token: accessToken };
}

before(async () => {
  await prisma.$connect();

  authorizationApp = express();
  authorizationApp.get(
    "/organizations/:organizationId/owner",
    requireAuth,
    requireOrganizationRole("OWNER"),
    (_req, res) => res.sendStatus(204),
  );
  authorizationApp.use(errorHandler);
});

after(async () => {
  try {
    if (testIps.size > 0) {
      const rateLimitRoutes = [
        "register-owner",
        "register-employee",
        "login",
        "join-request",
        "business-code-rotate",
        "employee-invitation",
        "invitation-accept",
      ];
      const bucketKeys = [...testIps].flatMap((ip) =>
        rateLimitRoutes.map((route) =>
          createHash("sha256").update(`${route}:${ip}`).digest("hex"),
        ),
      );
      await prisma.authRateLimitBucket.deleteMany({
        where: { bucketKey: { in: bucketKeys } },
      });
    }
    if (userIds.size > 0 || organizationIds.size > 0) {
      await prisma.employeeJoinRequest.deleteMany({
        where: {
          OR: [
            ...(userIds.size > 0 ? [{ userId: { in: [...userIds] } }] : []),
            ...(organizationIds.size > 0
              ? [{ organizationId: { in: [...organizationIds] } }]
              : []),
          ],
        },
      });
      await prisma.organizationInvitation.deleteMany({
        where: {
          OR: [
            ...(userIds.size > 0
              ? [{ createdByUserId: { in: [...userIds] } }]
              : []),
            ...(organizationIds.size > 0
              ? [{ organizationId: { in: [...organizationIds] } }]
              : []),
          ],
        },
      });
    }
    if (userIds.size > 0) {
      await prisma.authSession.deleteMany({
        where: { userId: { in: [...userIds] } },
      });
    }
    await prisma.organizationMembership.deleteMany({
      where: {
        OR: [
          ...(userIds.size > 0 ? [{ userId: { in: [...userIds] } }] : []),
          ...(organizationIds.size > 0
            ? [{ organizationId: { in: [...organizationIds] } }]
            : []),
        ],
      },
    });
    if (organizationIds.size > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: [...organizationIds] } },
      });
    }
    if (userIds.size > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: [...userIds] } },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test("registration validates input and rejects client-controlled role or organization", async () => {
  const invalidEmail = await fromIp(nextIp())(app)
    .post("/api/auth/register")
    .send({
      name: "Test Owner",
      email: "not-an-email",
      password: TEST_PASSWORD,
      organizationName: "Test Organization",
    });
  assert.equal(invalidEmail.status, 400);

  const weakPassword = await fromIp(nextIp())(app)
    .post("/api/auth/register")
    .send({
      name: "Test Owner",
      email: `weak-${randomUUID()}@example.test`,
      password: "short",
      organizationName: "Test Organization",
    });
  assert.equal(weakPassword.status, 400);

  const missingField = await fromIp(nextIp())(app)
    .post("/api/auth/register")
    .send({ email: `missing-${randomUUID()}@example.test` });
  assert.equal(missingField.status, 400);

  const forgedRole = await fromIp(nextIp())(app)
    .post("/api/auth/register")
    .send({
      name: "Test Owner",
      email: `forged-${randomUUID()}@example.test`,
      password: TEST_PASSWORD,
      organizationName: "Test Organization",
      role: "OWNER",
      organizationId: "attacker-controlled",
    });
  assert.equal(forgedRole.status, 400);
});

test("registration creates an owner, organization, and session without exposing a password hash", async () => {
  const email = `Owner-${randomUUID()}@Example.Test`;
  const response = await registration(email);

  assert.equal(response.status, 202);
  assert.deepEqual(response.signup?.body, {
    status: "ok",
    message: REGISTRATION_MESSAGE,
  });
  const created = rememberUser(response);
  assert.equal(response.body.data.user.email, email.toLowerCase());
  assert.equal(response.body.data.user.memberships[0].role, "OWNER");
  const businessJoinCode = response.body.data.businessJoinCode;
  assert.ok(businessJoinCode);
  assert.match(businessJoinCode, /^[A-Z0-9]{8}$/);
  assert.equal(response.body.data.tokenType, "Bearer");
  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal("passwordHash" in response.body.data.user, false);

  const storedUser = await prisma.user.findUniqueOrThrow({
    where: { id: created.userId },
    select: { passwordHash: true },
  });
  assert.notEqual(storedUser.passwordHash, TEST_PASSWORD);
  assert.match(storedUser.passwordHash, /^\$argon2id\$/);
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: created.organizationId },
    select: { businessCodeHash: true },
  });
  assert.notEqual(
    organization.businessCodeHash,
    businessJoinCode,
  );
});

test("employee self-registration creates an authenticated account without organization access", async () => {
  const response = await employeeRegistration();
  assert.equal(response.status, 202);
  const employee = rememberStandaloneUser(response);
  assert.equal("businessJoinCode" in response.body.data, false);

  const profile = await fromIp(nextIp())(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${employee.token}`);
  assert.equal(profile.status, 200);
  assert.deepEqual(profile.body.data.user.memberships, []);

  const ownerResponse = await registration();
  const owner = rememberUser(ownerResponse);
  const organizationAccess = await fromIp(nextIp())(authorizationApp)
    .get(`/organizations/${owner.organizationId}/owner`)
    .set("Authorization", `Bearer ${employee.token}`);
  assert.equal(organizationAccess.status, 403);
});

test("business-code join creates a pending request without granting access; owner approval activates membership", async () => {
  const ownerResponse = await registration();
  const owner = rememberUser(ownerResponse);
  const employeeResponse = await employeeRegistration();
  const employee = rememberStandaloneUser(employeeResponse);
  const employeeAuth = `Bearer ${employee.token}`;

  const validCodeResponse = await fromIp(nextIp())(app)
    .post("/api/employees/join-requests")
    .set("Authorization", employeeAuth)
    .send({
      businessCode: (ownerResponse.body.data.businessJoinCode as string).toLowerCase(),
    });
  assert.equal(validCodeResponse.status, 202);
  assert.equal(validCodeResponse.body.message, "Jika kode bisnis valid dan belum ada permintaan, permintaan akan diproses.");

  const invalidCodeResponse = await fromIp(nextIp())(app)
    .post("/api/employees/join-requests")
    .set("Authorization", employeeAuth)
    .send({ businessCode: randomBytes(4).toString("hex").toUpperCase() });
  assert.equal(invalidCodeResponse.status, 202);
  assert.equal(invalidCodeResponse.body.message, validCodeResponse.body.message);

  const ownRequests = await fromIp(nextIp())(app)
    .get("/api/employees/join-requests/me")
    .set("Authorization", employeeAuth);
  assert.equal(ownRequests.status, 200);
  assert.equal(ownRequests.body.data.requests.length, 1);
  assert.equal(ownRequests.body.data.requests[0].status, "PENDING");
  assert.equal(ownRequests.body.data.requests[0].organization.id, owner.organizationId);

  const requestId = ownRequests.body.data.requests[0].id as string;
  const beforeApproval = await fromIp(nextIp())(authorizationApp)
    .get(`/organizations/${owner.organizationId}/owner`)
    .set("Authorization", employeeAuth);
  assert.equal(beforeApproval.status, 403);

  const ownerRequests = await fromIp(nextIp())(app)
    .get(`/api/employees/organizations/${owner.organizationId}/join-requests`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(ownerRequests.status, 200);
  assert.equal(ownerRequests.body.data.requests[0].id, requestId);

  const approved = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/join-requests/${requestId}/approve`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.status, "APPROVED");

  const afterApproval = await fromIp(nextIp())(app)
    .get("/api/auth/me")
    .set("Authorization", employeeAuth);
  assert.equal(afterApproval.body.data.user.memberships[0].role, "EMPLOYEE");
  assert.equal(afterApproval.body.data.user.memberships[0].organization.id, owner.organizationId);
  const ownerRouteAccess = await fromIp(nextIp())(authorizationApp)
    .get(`/organizations/${owner.organizationId}/owner`)
    .set("Authorization", employeeAuth);
  assert.equal(ownerRouteAccess.status, 403);

  const duplicate = await fromIp(nextIp())(app)
    .post("/api/employees/join-requests")
    .set("Authorization", employeeAuth)
    .send({ businessCode: ownerResponse.body.data.businessJoinCode });
  assert.equal(duplicate.status, 202);
  const memberRequests = await fromIp(nextIp())(app)
    .get("/api/employees/join-requests/me")
    .set("Authorization", employeeAuth);
  assert.equal(memberRequests.body.data.requests.length, 1);
});

test("join requests reject concurrent duplicates and allow reapplication after rejection", async () => {
  const ownerResponse = await registration();
  const owner = rememberUser(ownerResponse);
  const employeeResponse = await employeeRegistration();
  const employee = rememberStandaloneUser(employeeResponse);
  const apply = () =>
    fromIp(nextIp())(app)
      .post("/api/employees/join-requests")
      .set("Authorization", `Bearer ${employee.token}`)
      .send({ businessCode: ownerResponse.body.data.businessJoinCode });

  const concurrentResponses = await Promise.all([apply(), apply()]);
  assert.deepEqual(
    concurrentResponses.map((response) => response.status).sort(),
    [202, 202],
  );
  const ownRequests = await fromIp(nextIp())(app)
    .get("/api/employees/join-requests/me")
    .set("Authorization", `Bearer ${employee.token}`);
  assert.equal(ownRequests.body.data.requests.length, 1);

  const requestId = ownRequests.body.data.requests[0].id as string;
  const rejected = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/join-requests/${requestId}/reject`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.data.status, "REJECTED");
  assert.equal(
    await prisma.organizationMembership.count({
      where: {
        organizationId: owner.organizationId,
        userId: employee.userId,
      },
    }),
    0,
  );

  const reapplication = await apply();
  assert.equal(reapplication.status, 202);
  const updatedRequests = await fromIp(nextIp())(app)
    .get("/api/employees/join-requests/me")
    .set("Authorization", `Bearer ${employee.token}`);
  assert.equal(updatedRequests.body.data.requests.length, 1);
  assert.equal(updatedRequests.body.data.requests[0].status, "PENDING");
});

test("owner approvals are organization-scoped, cannot self-approve, and reject repeat decisions", async () => {
  const ownerResponse = await registration();
  const otherOwnerResponse = await registration();
  const owner = rememberUser(ownerResponse);
  const otherOwner = rememberUser(otherOwnerResponse);
  const employeeResponse = await employeeRegistration();
  const employee = rememberStandaloneUser(employeeResponse);

  await fromIp(nextIp())(app)
    .post("/api/employees/join-requests")
    .set("Authorization", `Bearer ${employee.token}`)
    .send({ businessCode: ownerResponse.body.data.businessJoinCode });
  const requests = await fromIp(nextIp())(app)
    .get("/api/employees/join-requests/me")
    .set("Authorization", `Bearer ${employee.token}`);
  const requestId = requests.body.data.requests[0].id as string;

  const crossOrganization = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${otherOwner.organizationId}/join-requests/${requestId}/approve`)
    .set("Authorization", `Bearer ${otherOwner.token}`);
  assert.equal(crossOrganization.status, 409);
  const otherRequestId = await prisma.employeeJoinRequest.create({
    data: {
      organizationId: otherOwner.organizationId,
      userId: employee.userId,
    },
    select: { id: true },
  });
  const ownerCrossOrganization = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${otherOwner.organizationId}/join-requests/${otherRequestId.id}/approve`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(ownerCrossOrganization.status, 403);

  const selfRequest = await prisma.employeeJoinRequest.create({
    data: {
      organizationId: owner.organizationId,
      userId: owner.userId,
    },
    select: { id: true },
  });
  const selfApproval = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/join-requests/${selfRequest.id}/approve`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(selfApproval.status, 403);

  const approved = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/join-requests/${requestId}/approve`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(approved.status, 200);
  const repeatedDecision = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/join-requests/${requestId}/approve`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(repeatedDecision.status, 409);
});

test("business-code rotation invalidates the old code and leaves new requests pending", async () => {
  const ownerResponse = await registration();
  const owner = rememberUser(ownerResponse);
  const employeeResponse = await employeeRegistration();
  const employee = rememberStandaloneUser(employeeResponse);
  const originalCode = ownerResponse.body.data.businessJoinCode as string;
  const rotated = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/business-code/rotate`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(rotated.status, 200);
  const newCode = rotated.body.data.businessCode as string;
  assert.notEqual(newCode, originalCode);
  assert.match(newCode, /^[A-Z0-9]{8}$/);

  const oldCodeApplication = await fromIp(nextIp())(app)
    .post("/api/employees/join-requests")
    .set("Authorization", `Bearer ${employee.token}`)
    .send({ businessCode: originalCode });
  const newCodeApplication = await fromIp(nextIp())(app)
    .post("/api/employees/join-requests")
    .set("Authorization", `Bearer ${employee.token}`)
    .send({ businessCode: newCode });
  assert.equal(oldCodeApplication.status, 202);
  assert.equal(newCodeApplication.status, 202);
  const ownRequests = await fromIp(nextIp())(app)
    .get("/api/employees/join-requests/me")
    .set("Authorization", `Bearer ${employee.token}`);
  assert.equal(ownRequests.body.data.requests.length, 1);
  assert.equal(ownRequests.body.data.requests[0].organization.id, owner.organizationId);
});

test("join requests are rate-limited and reject client-controlled membership fields", async () => {
  const employeeResponse = await employeeRegistration();
  const employee = rememberStandaloneUser(employeeResponse);
  const authorization = `Bearer ${employee.token}`;
  const malformedCode = await fromIp(nextIp())(app)
    .post("/api/employees/join-requests")
    .set("Authorization", authorization)
    .send({ businessCode: "TOO-SHORT" });
  assert.equal(malformedCode.status, 400);

  const forgedMembership = await fromIp(nextIp())(app)
    .post("/api/employees/join-requests")
    .set("Authorization", authorization)
    .send({
      businessCode: randomBytes(4).toString("hex").toUpperCase(),
      organizationId: "attacker-controlled",
      role: "OWNER",
      status: "APPROVED",
    });
  assert.equal(forgedMembership.status, 400);

  const ip = nextIp();
  const responses = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    responses.push(
      await fromIp(ip)(app)
        .post("/api/employees/join-requests")
        .set("Authorization", authorization)
        .send({ businessCode: randomBytes(4).toString("hex").toUpperCase() }),
    );
  }
  assert.deepEqual(
    responses.map((response) => response.status),
    [202, 202, 202, 202, 202, 429],
  );
});

test("owner invitations accept only the intended account, create EMPLOYEE membership, and are single-use", async () => {
  const ownerResponse = await registration();
  const owner = rememberUser(ownerResponse);
  const employeeResponse = await employeeRegistration();
  const employee = rememberStandaloneUser(employeeResponse);
  const wrongEmployeeResponse = await employeeRegistration();
  const wrongEmployee = rememberStandaloneUser(wrongEmployeeResponse);

  const invalidEmailInvitation = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/invitations`)
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ email: "invalid-email" });
  assert.equal(invalidEmailInvitation.status, 400);

  const invitationResponse = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/invitations`)
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ email: employeeResponse.body.data.user.email });
  assert.equal(invitationResponse.status, 201);
  const invitation = invitationResponse.body.data.invitation;
  assert.equal(invitation.email, employeeResponse.body.data.user.email);
  const storedInvitation = await prisma.organizationInvitation.findUniqueOrThrow({
    where: { id: invitation.id },
    select: { tokenHash: true, expiresAt: true },
  });
  assert.notEqual(storedInvitation.tokenHash, invitation.token);
  assert.ok(storedInvitation.expiresAt.getTime() > Date.now());

  const wrongAccount = await fromIp(nextIp())(app)
    .post("/api/employees/invitations/accept")
    .set("Authorization", `Bearer ${wrongEmployee.token}`)
    .send({ token: invitation.token });
  assert.equal(wrongAccount.status, 400);
  const accepted = await fromIp(nextIp())(app)
    .post("/api/employees/invitations/accept")
    .set("Authorization", `Bearer ${employee.token}`)
    .send({ token: invitation.token });
  assert.equal(accepted.status, 200);

  const profile = await fromIp(nextIp())(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${employee.token}`);
  assert.equal(profile.body.data.user.memberships[0].role, "EMPLOYEE");
  assert.equal(profile.body.data.user.memberships[0].organization.id, owner.organizationId);
  const replay = await fromIp(nextIp())(app)
    .post("/api/employees/invitations/accept")
    .set("Authorization", `Bearer ${employee.token}`)
    .send({ token: invitation.token });
  assert.equal(replay.status, 400);

  const revocable = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/invitations`)
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ email: wrongEmployeeResponse.body.data.user.email });
  assert.equal(revocable.status, 201);
  const revoke = await fromIp(nextIp())(app)
    .post(`/api/employees/organizations/${owner.organizationId}/invitations/${revocable.body.data.invitation.id}/revoke`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(revoke.status, 200);
  const revokedAccept = await fromIp(nextIp())(app)
    .post("/api/employees/invitations/accept")
    .set("Authorization", `Bearer ${wrongEmployee.token}`)
    .send({ token: revocable.body.data.invitation.token });
  assert.equal(revokedAccept.status, 400);

  const expiredToken = randomBytes(32).toString("base64url");
  await prisma.organizationInvitation.create({
    data: {
      organizationId: owner.organizationId,
      createdByUserId: owner.userId,
      email: wrongEmployeeResponse.body.data.user.email,
      tokenHash: createHash("sha256").update(expiredToken).digest("hex"),
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  const expiredAccept = await fromIp(nextIp())(app)
    .post("/api/employees/invitations/accept")
    .set("Authorization", `Bearer ${wrongEmployee.token}`)
    .send({ token: expiredToken });
  assert.equal(expiredAccept.status, 400);
});

test("registration rolls back all records when organization creation fails", async () => {
  await prisma.$executeRaw`
    CREATE OR REPLACE FUNCTION fail_test_organization_insert()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'forced test organization insert failure';
    END;
    $$
  `;
  await prisma.$executeRaw`
    CREATE TRIGGER fail_test_organization_insert
    BEFORE INSERT ON "Organization"
    FOR EACH ROW EXECUTE FUNCTION fail_test_organization_insert()
  `;

  const email = `rollback-${randomUUID()}@example.test`;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await submitOwnerRegistration(email);
    assert.equal(response.status, 500);
    assert.equal(
      JSON.stringify(response.body).includes("forced test organization insert failure"),
      false,
    );
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  } finally {
    console.error = originalConsoleError;
    await prisma.$executeRaw`
      DROP TRIGGER IF EXISTS fail_test_organization_insert ON "Organization"
    `;
    await prisma.$executeRaw`
      DROP FUNCTION IF EXISTS fail_test_organization_insert()
    `;
  }
});

test("concurrent registration with the same normalized email creates only one account", async () => {
  const email = `duplicate-${randomUUID()}@example.test`;
  const ip = nextIp();
  const responses = await Promise.all([
    submitOwnerRegistration(email, ip),
    submitOwnerRegistration(email.toUpperCase(), ip),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [202, 202],
  );
  assert.deepEqual(responses[0].body, responses[1].body);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      memberships: { select: { organizationId: true } },
    },
  });
  userIds.add(user.id);
  for (const membership of user.memberships) {
    organizationIds.add(membership.organizationId);
  }
});

test("login accepts valid credentials and returns a generic error for invalid credentials", async () => {
  const registrationResponse = await registration();
  assert.equal(registrationResponse.status, 202);
  const created = rememberUser(registrationResponse);

  const validLogin = await fromIp(nextIp())(app)
    .post("/api/auth/login")
    .send({
      email: registrationResponse.body.data.user.email,
      password: TEST_PASSWORD,
    });
  assert.equal(validLogin.status, 200);
  assert.equal("passwordHash" in validLogin.body.data.user, false);

  const wrongPassword = await fromIp(nextIp())(app)
    .post("/api/auth/login")
    .send({
      email: registrationResponse.body.data.user.email,
      password: "Incorrect-Password-42!",
    });
  const unknownEmail = await fromIp(nextIp())(app)
    .post("/api/auth/login")
    .send({
      email: `unknown-${randomUUID()}@example.test`,
      password: TEST_PASSWORD,
    });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.body.message, unknownEmail.body.message);

  const invalidInput = await fromIp(nextIp())(app)
    .post("/api/auth/login")
    .send({ email: "invalid", password: "password" });
  assert.equal(invalidInput.status, 400);
  assert.ok(created.userId);
});

test("profile requires a valid bearer session and logout revokes it", async () => {
  const registered = await registration();
  assert.equal(registered.status, 202);
  const created = rememberUser(registered);
  const profileRequest = () =>
    fromIp(nextIp())(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${created.token}`);

  const profile = await profileRequest();
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.user.id, created.userId);
  assert.equal("passwordHash" in profile.body.data.user, false);

  const unauthenticated = await fromIp(nextIp())(app).get("/api/auth/me");
  const invalidToken = await fromIp(nextIp())(app)
    .get("/api/auth/me")
    .set("Authorization", "Bearer invalid");
  const malformedHeader = await fromIp(nextIp())(app)
    .get("/api/auth/me")
    .set("Authorization", `Token ${created.token}`);
  assert.equal(unauthenticated.status, 401);
  assert.equal(invalidToken.status, 401);
  assert.equal(malformedHeader.status, 401);

  const logout = await fromIp(nextIp())(app)
    .post("/api/auth/logout")
    .set("Authorization", `Bearer ${created.token}`);
  assert.equal(logout.status, 200);
  assert.equal((await profileRequest()).status, 401);
});

test("role middleware checks live organization membership and prevents cross-organization access", async () => {
  const ownerResponse = await registration();
  const otherOwnerResponse = await registration();
  assert.equal(ownerResponse.status, 202);
  assert.equal(otherOwnerResponse.status, 202);
  const owner = rememberUser(ownerResponse);
  const otherOwner = rememberUser(otherOwnerResponse);

  const employeeId = `test-employee-${randomUUID()}`;
  const employeeEmail = `${employeeId}@example.test`;
  const employeePasswordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
  });
  const employee = await prisma.user.create({
    data: {
      id: employeeId,
      name: "Test Employee",
      email: employeeEmail,
      passwordHash: employeePasswordHash,
      memberships: {
        create: {
          organizationId: owner.organizationId,
          role: "EMPLOYEE",
        },
      },
    },
    select: { id: true },
  });
  userIds.add(employee.id);

  const employeeToken = randomBytes(32).toString("base64url");
  const expiredToken = randomBytes(32).toString("base64url");
  await prisma.authSession.create({
    data: {
      userId: employee.id,
      tokenHash: createHash("sha256").update(employeeToken).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await prisma.authSession.create({
    data: {
      userId: owner.userId,
      tokenHash: createHash("sha256").update(expiredToken).digest("hex"),
      expiresAt: new Date(Date.now() - 60_000),
    },
  });

  const ownerAccess = await fromIp(nextIp())(authorizationApp)
    .get(`/organizations/${owner.organizationId}/owner`)
    .set("Authorization", `Bearer ${owner.token}`);
  const employeeAccess = await fromIp(nextIp())(authorizationApp)
    .get(`/organizations/${owner.organizationId}/owner`)
    .set("Authorization", `Bearer ${employeeToken}`);
  const crossOrganizationAccess = await fromIp(nextIp())(authorizationApp)
    .get(`/organizations/${otherOwner.organizationId}/owner`)
    .set("Authorization", `Bearer ${owner.token}`);

  assert.equal(ownerAccess.status, 204);
  assert.equal(employeeAccess.status, 403);
  assert.equal(crossOrganizationAccess.status, 403);
  const expiredSessionAccess = await fromIp(nextIp())(authorizationApp)
    .get(`/organizations/${owner.organizationId}/owner`)
    .set("Authorization", `Bearer ${expiredToken}`);
  assert.equal(expiredSessionAccess.status, 401);

  await prisma.organizationMembership.deleteMany({
    where: { userId: owner.userId, organizationId: owner.organizationId },
  });
  const revokedMembershipAccess = await fromIp(nextIp())(authorizationApp)
    .get(`/organizations/${owner.organizationId}/owner`)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(revokedMembershipAccess.status, 403);
});

test("auth endpoints apply database-backed rate limits", async () => {
  const ip = nextIp();
  const attempts = await Promise.all(
    Array.from({ length: 11 }, () =>
      fromIp(ip)(app).post("/api/auth/login").send({
        email: `limited-${randomUUID()}@example.test`,
        password: TEST_PASSWORD,
      }),
    ),
  );

  assert.equal(attempts.filter((response) => response.status === 429).length, 1);
  assert.equal(attempts.filter((response) => response.status === 401).length, 10);
  const limitedAttempt = attempts.find((response) => response.status === 429);
  assert.ok(limitedAttempt?.headers["retry-after"]);
});

test("oversized JSON requests receive a generic client error", async () => {
  const response = await fromIp(nextIp())(app)
    .post("/api/auth/login")
    .send({ payload: "x".repeat(17_000) });

  assert.equal(response.status, 413);
  assert.equal(response.body.message, "Ukuran request melebihi batas.");
});

test("existing health endpoints remain available", async () => {
  const health = await request(app).get("/health");
  const databaseHealth = await request(app).get("/health/db");

  assert.equal(health.status, 200);
  assert.equal(databaseHealth.status, 200);
  assert.equal(databaseHealth.body.database, "connected");
});

test("unexpected errors do not expose internal details", async () => {
  const errorApp = express();
  errorApp.get("/failure", () => {
    throw new Error("sensitive database detail");
  });
  errorApp.use(errorHandler);

  const originalConsoleError = console.error;
  let loggedMessage = "";
  console.error = (...args: unknown[]) => {
    loggedMessage = args.join(" ");
  };
  try {
    const response = await request(errorApp).get("/failure");
    assert.equal(response.status, 500);
    assert.equal(response.body.message, "Terjadi kesalahan pada server.");
    assert.equal(
      JSON.stringify(response.body).includes("sensitive database detail"),
      false,
    );
    assert.equal(loggedMessage.includes("sensitive database detail"), false);
  } finally {
    console.error = originalConsoleError;
  }
});
