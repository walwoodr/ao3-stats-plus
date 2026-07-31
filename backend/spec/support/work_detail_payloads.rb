# Shared builder for the POST /ingest/work JSON payload shape, used by both
# WorkDetailIngestService specs and the POST /ingest/work request specs, so
# the two stay in sync on the contract this stage is defining - mirrors
# spec/support/ingest_payloads.rb's role for the existing /ingest payload.
#
# Field naming is camelCase (the literal JSON body the bookmarklet's fan-out
# POSTs per work, mirrored by frontend/src/bookmarklet/buildWorkDetailPayload.ts).
# Distinct schemaVersion namespace from IngestPayloads::CURRENT_SCHEMA_VERSION
# per the plan ("own schema-version constant, independent of the stats-page
# schemaVersion: 1").
module WorkDetailPayloads
  CURRENT_SCHEMA_VERSION = 1

  def valid_work_detail_payload(
    username: "someauthor",
    read_token: nil,
    ao3_work_id: 111,
    work_stats: nil,
    work: nil,
    bookmarks: nil,
    schema_version: CURRENT_SCHEMA_VERSION
  )
    {
      "schemaVersion" => schema_version,
      "username" => username,
      "readToken" => read_token,
      "ao3WorkId" => ao3_work_id,
      "workStats" => work_stats || default_work_stats,
      "work" => work || default_work,
      "bookmarks" => bookmarks || default_bookmarks
    }
  end

  def default_work_stats
    {
      "publicBookmarks" => 6,
      "visibleComments" => 14,
      "chapterCount" => 3,
      "chaptersExpected" => 12
    }
  end

  def default_work
    {
      "publishedOn" => "2023-05-01",
      "series" => [ "Series One" ],
      "complete" => false
    }
  end

  def default_bookmarks
    [
      {
        "bookmarkerName" => "avid_reader",
        "noteHtml" => "<p>Loved this!</p>",
        "bookmarkerTags" => [ "fluff" ],
        "bookmarkedOn" => "2024-05-01",
        "collections" => [ "Collection A" ]
      },
      {
        "bookmarkerName" => nil,
        "noteHtml" => nil,
        "bookmarkerTags" => [],
        "bookmarkedOn" => nil,
        "collections" => []
      }
    ]
  end
end

RSpec.configure do |config|
  config.include WorkDetailPayloads
end
