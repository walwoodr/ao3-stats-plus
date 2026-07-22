# frozen_string_literal: true

module Types
  class QueryType < Types::BaseObject
    field :node, Types::NodeType, null: true, description: "Fetches an object given its ID." do
      argument :id, ID, required: true, description: "ID of the object."
    end

    def node(id:)
      context.schema.object_from_id(id, context)
    end

    field :nodes, [ Types::NodeType, null: true ], null: true, description: "Fetches a list of objects given a list of IDs." do
      argument :ids, [ ID ], required: true, description: "IDs of the objects."
    end

    def nodes(ids:)
      ids.map { |id| context.schema.object_from_id(id, context) }
    end

    # statsForUser is the read path for the frontend dashboard: username +
    # capability token in, that author's full stats history out. A wrong
    # token or unknown username is a typed GraphQL error (not an HTTP
    # failure or exception) so the frontend can render it inline.
    field :stats_for_user, Types::StatsForUserType, null: true,
      description: "An AO3 author's stats history, authorized by their capability token." do
      argument :username, String, required: true
      argument :token, String, required: true
    end

    def stats_for_user(username:, token:)
      ao3_user = Ao3User.find_by(username: username)
      raise GraphQL::ExecutionError, "No stats found for that username" unless ao3_user
      raise GraphQL::ExecutionError, "Invalid token" unless ao3_user.read_token == token

      StatsForUserResult.new(ao3_user)
    end
  end
end
