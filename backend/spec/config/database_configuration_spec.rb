require "rails_helper"

# Grounding (docs/plans/bookmarklet-entrypoint-and-hosting.md's finalized
# hosting-plan Section 1, task T1): config/database.yml's production stanza
# hardcodes `database: backend_production`, `username: backend`, and
# `password: ENV["BACKEND_DATABASE_PASSWORD"]`. Render's managed Postgres
# (the finalized plan's Basic Postgres add-on, $6/mo) supplies exactly one
# env var, DATABASE_URL, with its own database/host/user/password baked in -
# there is no BACKEND_DATABASE_PASSWORD on Render, and the hardcoded
# database/username don't match whatever Render actually names the
# database/role.
#
# This targets Rails.application.config.database_configuration directly (as
# named in the plan) rather than the fully-merged ActiveRecord::Base.
# configurations: the latter already re-derives its connection details from
# DATABASE_URL for whatever Rails env is *currently running* (see
# ActiveRecord::DatabaseConfigurations#merge_db_environment_variables), so it
# does not actually reproduce this bug in this Rails version - confirmed
# empirically via `bin/rails runner` with RAILS_ENV=production and
# DATABASE_URL set. The raw `database_configuration` hash is what's still
# wrong: it's what a fixed database.yml should stop hardcoding, and what any
# tooling reading the file/method directly (rather than through a live
# ActiveRecord connection) would see.
RSpec.describe "production database configuration" do
  around do |example|
    original_database_url = ENV["DATABASE_URL"]
    ENV["DATABASE_URL"] =
      "postgres://render_user:render_secret_pw@dpg-abcd1234-a.oregon-postgres.render.com/render_db_5xtq"
    example.run
  ensure
    ENV["DATABASE_URL"] = original_database_url
  end

  # Rails.application.config.database_configuration re-parses
  # config/database.yml (with ERB) fresh on every call - no memoization - so
  # this reflects the ENV change set above without needing to boot Rails in
  # a production environment.
  let(:production_config) { Rails.application.config.database_configuration["production"] }

  it "does not hardcode the database name" do
    expect(production_config["database"]).not_to eq("backend_production")
  end

  it "does not hardcode the username" do
    expect(production_config["username"]).not_to eq("backend")
  end

  it "defers to DATABASE_URL instead of a hardcoded connection" do
    expect(production_config["url"]).to eq(ENV["DATABASE_URL"])
  end
end
