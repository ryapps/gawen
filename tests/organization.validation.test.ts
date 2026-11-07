import assert from "node:assert/strict";
import test from "node:test";

import { updateOrganizationSchema } from "../src/modules/organization/organization.validation.js";

const validRegions = {
  provinceCode: "31",
  provinceName: "DKI Jakarta",
  regencyCode: "31.74",
  regencyName: "Kota Administrasi Jakarta Selatan",
  districtCode: "31.74.07",
  districtName: "Kebayoran Baru",
  villageCode: "31.74.07.1002",
  villageName: "Gunung",
};

test("organization updates accept a consistent administrative region", () => {
  assert.equal(updateOrganizationSchema.safeParse(validRegions).success, true);
});

test("organization address setup payload accepts all region fields and setup progress", () => {
  const result = updateOrganizationSchema.safeParse({
    address: "Jl. Contoh No. 10",
    city: "Kota Jakarta Selatan",
    province: "DKI Jakarta",
    ...validRegions,
    postalCode: "12110",
    setupStep: 4,
  });

  assert.equal(result.success, true);
});

test("organization address setup accepts a selected province with empty children", () => {
  const result = updateOrganizationSchema.safeParse({
    address: "Jl. Contoh No. 10",
    city: null,
    province: "DKI Jakarta",
    provinceCode: "31",
    provinceName: "DKI Jakarta",
    regencyCode: null,
    regencyName: null,
    districtCode: null,
    districtName: null,
    villageCode: null,
    villageName: null,
    postalCode: null,
    setupStep: 4,
  });

  assert.equal(result.success, true);
});

test("organization updates accept the final setup step but reject higher values", () => {
  assert.equal(
    updateOrganizationSchema.safeParse({ setupStep: 5 }).success,
    true,
  );
  assert.equal(
    updateOrganizationSchema.safeParse({ setupStep: 6 }).success,
    false,
  );
});

test("organization updates reject malformed and inconsistent region codes", () => {
  assert.equal(
    updateOrganizationSchema.safeParse({
      ...validRegions,
      provinceCode: "3",
    }).success,
    false,
  );
  assert.equal(
    updateOrganizationSchema.safeParse({
      ...validRegions,
      regencyCode: "31.75",
    }).success,
    false,
  );
  assert.equal(
    updateOrganizationSchema.safeParse({
      districtCode: "31.74.07",
      districtName: "Kebayoran Baru",
    }).success,
    false,
  );
  assert.equal(
    updateOrganizationSchema.safeParse({
      provinceCode: "31",
    }).success,
    false,
  );
});
