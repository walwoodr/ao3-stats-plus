require "yaml"

# Validates render.yaml's eventual shape against Render's Blueprint spec
# (https://render.com/docs/blueprint-spec), per the finalized hosting plan
# (docs/plans/bookmarklet-entrypoint-and-hosting.md's Section 1 / T5): a
# Docker backend web service on the Starter plan with a /up health check
# and a migration preDeployCommand, a Basic Postgres database, and a
# frontend static site with SPA-rewrite routing plus VITE_API_ORIGIN/
# VITE_GRAPHQL_URL build env vars.
#
# Static sites live under the top-level `services:` array (type: web,
# runtime: static), same as any other service - Render's Blueprint schema
# has no separate top-level `staticSites:` key. An earlier version of this
# spec assumed `staticSites:` without verifying it against Render's live
# docs; Review caught that both this spec and render.yaml shared the same
# wrong assumption (tests passed while being wrong against the real
# schema) - see TECH_DEBT.md.
#
# render.yaml does not exist yet - authoring it is Implementation's job
# (plan task I7). This spec fails with a clear "file not found" failure
# until the file exists, then with clear per-key failures until each
# required piece is present, rather than an opaque error.
#
# Deliberately lives under backend/spec rather than a new top-level test
# runner: Ruby's stdlib YAML parser needs no new dependency (the frontend
# has no YAML-parsing package as a *direct* dependency, and adding one just
# for this would be an out-of-stack addition requiring sign-off per
# TECH_STACK.md), and this deliberately skips rails_helper - render.yaml is
# a repo-root deployment artifact, not backend app behavior, so this is
# pure file/YAML shape validation with no need for Rails/DB setup.
RSpec.describe "render.yaml" do
  render_yaml_path = File.expand_path("../../../render.yaml", __dir__)

  it "exists at the repo root" do
    expect(File.exist?(render_yaml_path)).to be(true), <<~MSG
      expected #{render_yaml_path} to exist. Authoring it is Implementation's
      job (docs/plans/bookmarklet-entrypoint-and-hosting.md, task I7) - see
      the rest of this spec file for its expected shape.
    MSG
  end

  # Every example below needs a parsed render.yaml to make any real
  # assertion. Raise a clear, deliberate failure (not a confusing
  # NoMethodError on nil, and not a silent "pending" skip) until the file
  # exists, so the whole suite reads unambiguously red rather than mixing
  # failures and pending examples.
  let(:parsed) do
    unless File.exist?(render_yaml_path)
      raise "render.yaml does not exist yet at #{render_yaml_path} - see the " \
        "'exists at the repo root' example above."
    end

    YAML.safe_load_file(render_yaml_path, permitted_classes: [], aliases: true)
  end

  it "is valid YAML that parses to a Hash" do
    expect(parsed).to be_a(Hash)
  end

  describe "the backend web service" do
    let(:backend_service) do
      Array(parsed["services"]).find { |svc| svc["runtime"] == "docker" }
    end

    it "is present, Docker-runtime, and type web" do
      expect(backend_service).not_to be_nil,
        "expected render.yaml's services: to include a runtime: docker web service for the backend"
      expect(backend_service["type"]).to eq("web")
    end

    it "runs on the Starter plan" do
      expect(backend_service&.dig("plan")).to eq("starter")
    end

    it "declares /up as its health check path" do
      expect(backend_service&.dig("healthCheckPath")).to eq("/up")
    end

    it "runs migrations via preDeployCommand" do
      expect(backend_service&.dig("preDeployCommand")).to match(/db:migrate/)
    end
  end

  describe "the Postgres database" do
    let(:database) { Array(parsed["databases"]).first }

    it "is present" do
      expect(database).not_to be_nil,
        "expected render.yaml's databases: to include the app's Postgres instance"
    end

    it "runs on a Basic plan" do
      expect(database&.dig("plan")).to match(/\Abasic/i)
    end
  end

  describe "the frontend static site" do
    let(:static_site) do
      Array(parsed["services"]).find { |svc| svc["runtime"] == "static" }
    end

    it "is present, static-runtime, and type web" do
      expect(static_site).not_to be_nil,
        "expected render.yaml's services: to include a runtime: static web service for the frontend"
      expect(static_site["type"]).to eq("web")
    end

    it "rewrites all paths to /index.html for client-side routing" do
      routes = Array(static_site&.dig("routes"))
      spa_rewrite = routes.find { |route| route["type"] == "rewrite" && route["source"] == "/*" }

      expect(spa_rewrite&.dig("destination")).to eq("/index.html")
    end

    it "wires VITE_API_ORIGIN and VITE_GRAPHQL_URL as build env vars" do
      env_keys = Array(static_site&.dig("envVars")).map { |env_var| env_var["key"] }

      expect(env_keys).to include("VITE_API_ORIGIN", "VITE_GRAPHQL_URL")
    end
  end
end
