import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUD_OWNER_EMAIL,
  CLOUD_OWNER_UID,
  isCloudOwner,
} from "../src/features/cloud/services/ownerAccess.ts";

const owner = {
  uid: CLOUD_OWNER_UID,
  email: CLOUD_OWNER_EMAIL,
  emailVerified: true,
};

test("chỉ chấp nhận đúng tài khoản cloud chủ sở hữu đã xác minh", () => {
  assert.equal(isCloudOwner(owner), true);
  assert.equal(isCloudOwner({ ...owner, uid: "uid-khac" }), false);
  assert.equal(isCloudOwner({ ...owner, email: "nguoi-khac@example.com" }), false);
  assert.equal(isCloudOwner({ ...owner, emailVerified: false }), false);
  assert.equal(isCloudOwner({ ...owner, email: null }), false);
});

test("email chủ sở hữu không phụ thuộc chữ hoa chữ thường", () => {
  assert.equal(isCloudOwner({ ...owner, email: CLOUD_OWNER_EMAIL.toUpperCase() }), true);
});
