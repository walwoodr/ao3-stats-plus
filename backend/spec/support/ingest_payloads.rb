# Shared builder for the ingest JSON payload shape, used by both
# SnapshotIngestService specs and the POST /ingest request specs so the two
# stay in sync on the contract this stage is defining.
#
# Field naming is camelCase because this mirrors the literal JSON body the
# bookmarklet POSTs (parsed into a plain Hash with string keys by the time it
# reaches the service, e.g. via ActionController::Parameters#to_unsafe_h).
module IngestPayloads
  CURRENT_SCHEMA_VERSION = 1

  def valid_ingest_payload(username: "someauthor", read_token: nil, works: nil)
    {
      "schemaVersion" => CURRENT_SCHEMA_VERSION,
      "username" => username,
      "readToken" => read_token,
      "aggregate" => {
        "hits" => 1_000,
        "kudos" => 100,
        "comments" => 20,
        "bookmarks" => 15,
        "subscriptions" => 10,
        "userSubscriptions" => 5,
        "wordCount" => 75_000,
        "worksCount" => 2
      },
      "works" => works || default_works
    }
  end

  def default_works
    [
      {
        "ao3WorkId" => 111,
        "title" => "Work A",
        "fandoms" => [ "Fandom One" ],
        "hits" => 400,
        "kudos" => 40,
        "comments" => 8,
        "bookmarks" => 6,
        "subscriptions" => 4,
        "wordCount" => 30_000
      },
      {
        "ao3WorkId" => 222,
        "title" => "Work B",
        "fandoms" => [ "Fandom Two" ],
        "hits" => 600,
        "kudos" => 60,
        "comments" => 12,
        "bookmarks" => 9,
        "subscriptions" => 6,
        "wordCount" => 45_000
      }
    ]
  end
end

RSpec.configure do |config|
  config.include IngestPayloads
end
