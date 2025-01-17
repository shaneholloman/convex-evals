import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Students table - stores basic student information
  students: defineTable({
    name: v.string(),
    email: v.string(),
  }),

  // Courses table - stores course information
  courses: defineTable({
    name: v.string(),
    code: v.string(),
    description: v.string(),
  }),

  // Enrollments table - represents the many-to-many relationship
  // between students and courses, plus enrollment-specific data
  enrollments: defineTable({
    studentId: v.id("students"),
    courseId: v.id("courses"),
    enrollmentDate: v.number(), // Unix timestamp
    grade: v.optional(v.string()), // null if not graded yet
  })    
    .index("by_student_and_course", ["studentId", "courseId"])
    .index("by_course_and_student", ["courseId", "studentId"]),
}); 