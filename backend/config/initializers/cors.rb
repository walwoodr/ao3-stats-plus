# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

# Development-only: allow the Vite dev server to call the GraphQL API.
# Production origins are intentionally left unset here - decide the deployed
# frontend origin during Planning/Deployment rather than guessing it now.
if Rails.env.development?
  Rails.application.config.middleware.insert_before 0, Rack::Cors do
    allow do
      origins "http://localhost:5173"

      resource "*",
        headers: :any,
        methods: %i[get post put patch delete options head]
    end
  end
end
