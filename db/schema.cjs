const {
  sqliteTable,
  text,
  integer,
  primaryKey,
} = require("drizzle-orm/sqlite-core");
exports.tasteFeedback = sqliteTable(
  "taste_feedback",
  {
    userId: text("user_id").notNull(),
    workId: integer("work_id").notNull(),
    title: text("title").notNull(),
    decision: text("decision"),
    watched: text("watched"),
    good: integer("good", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at").notNull(),
    bookmarkedAt: integer("bookmarked_at"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.workId] })],
);
