# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_02_135916) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "ao3_users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "earliest_post_year"
    t.string "read_token", null: false
    t.datetime "updated_at", null: false
    t.string "username", null: false
    t.index ["username"], name: "index_ao3_users_on_username", unique: true
  end

  create_table "snapshots", force: :cascade do |t|
    t.bigint "ao3_user_id", null: false
    t.datetime "captured_at", null: false
    t.date "captured_on", null: false
    t.datetime "created_at", null: false
    t.integer "total_bookmarks", default: 0, null: false
    t.integer "total_comments", default: 0, null: false
    t.integer "total_hits", default: 0, null: false
    t.integer "total_kudos", default: 0, null: false
    t.integer "total_subscriptions", default: 0, null: false
    t.integer "total_user_subscriptions", default: 0, null: false
    t.integer "total_word_count", default: 0, null: false
    t.datetime "updated_at", null: false
    t.integer "works_count", default: 0, null: false
    t.index ["ao3_user_id", "captured_on"], name: "index_snapshots_on_ao3_user_id_and_captured_on", unique: true
    t.index ["ao3_user_id"], name: "index_snapshots_on_ao3_user_id"
  end

  create_table "work_bookmarks", force: :cascade do |t|
    t.date "bookmarked_on"
    t.string "bookmarker_name"
    t.string "bookmarker_tags"
    t.string "collections"
    t.datetime "created_at", null: false
    t.text "note_html"
    t.datetime "updated_at", null: false
    t.bigint "work_id", null: false
    t.index ["work_id"], name: "index_work_bookmarks_on_work_id"
  end

  create_table "work_stats", force: :cascade do |t|
    t.integer "bookmarks", default: 0, null: false
    t.integer "chapter_count"
    t.integer "chapters_expected"
    t.integer "comments", default: 0, null: false
    t.datetime "created_at", null: false
    t.integer "hits", default: 0, null: false
    t.integer "kudos", default: 0, null: false
    t.integer "public_bookmarks"
    t.bigint "snapshot_id", null: false
    t.integer "subscriptions", default: 0, null: false
    t.datetime "updated_at", null: false
    t.integer "visible_comments"
    t.integer "word_count", default: 0, null: false
    t.bigint "work_id", null: false
    t.index ["snapshot_id", "work_id"], name: "index_work_stats_on_snapshot_id_and_work_id", unique: true
    t.index ["snapshot_id"], name: "index_work_stats_on_snapshot_id"
    t.index ["work_id"], name: "index_work_stats_on_work_id"
  end

  create_table "works", force: :cascade do |t|
    t.bigint "ao3_user_id", null: false
    t.bigint "ao3_work_id", null: false
    t.boolean "complete"
    t.datetime "created_at", null: false
    t.string "fandoms", null: false
    t.date "last_seen_on", null: false
    t.date "published_on"
    t.string "series"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.datetime "work_page_captured_at"
    t.index ["ao3_user_id", "ao3_work_id"], name: "index_works_on_ao3_user_id_and_ao3_work_id", unique: true
    t.index ["ao3_user_id"], name: "index_works_on_ao3_user_id"
  end

  add_foreign_key "snapshots", "ao3_users"
  add_foreign_key "work_bookmarks", "works"
  add_foreign_key "work_stats", "snapshots"
  add_foreign_key "work_stats", "works"
  add_foreign_key "works", "ao3_users"
end
