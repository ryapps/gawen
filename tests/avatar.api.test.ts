import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import app from "../src/app.js";

test("avatar upload requires an authenticated user", async () => {
  const response = await request(app).post("/api/users/profile/avatar");
  assert.equal(response.status, 401);
  assert.equal(response.body.status, "error");
});

test("avatar upload rejects unauthenticated multipart files before processing", async () => {
  const response = await request(app)
    .post("/api/users/profile/avatar")
    .attach("avatar", Buffer.from("not an image"), {
      filename: "avatar.png",
      contentType: "image/png",
    });
  assert.equal(response.status, 401);
  assert.equal(response.body.status, "error");
});
