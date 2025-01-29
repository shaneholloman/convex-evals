import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  organizations: defineTable({
    name: v.string(),
  }),

  departments: defineTable({
    name: v.string(),
    organizationId: v.id("organizations"),
    managerId: v.optional(v.id("employees")),
  }).index("by_organization", ["organizationId"]),

  employees: defineTable({
    name: v.string(),
    departmentId: v.id("departments"),
    organizationId: v.id("organizations"),
    age: v.optional(v.number()),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.string(),
        city: v.string(),
        state: v.string(),
        zip: v.string(),
      })
    ),
  })
    .index("by_email", ["email"])
    .index("by_department", ["departmentId"])
    .index("by_organization", ["organizationId"])
});