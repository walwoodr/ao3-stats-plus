# SnapshotIngestService is the single write path for an ingested bookmarklet
# payload: find-or-create the Ao3User, mint/verify the capability token,
# dedup same-day snapshots, and transactionally persist snapshot + works +
# work_stats. See spec/support/ingest_payloads.rb for the payload contract.
class SnapshotIngestService
  class InvalidPayload < StandardError; end
  class TokenMismatch < StandardError; end
  class UnsupportedSchemaVersion < StandardError; end

  CURRENT_SCHEMA_VERSION = 1
  EARLIEST_POST_YEAR_RANGE = 1990..Date.current.year

  Result = Struct.new(:ao3_user, :snapshot, :read_token, :deduped, keyword_init: true) do
    def deduped?
      !!deduped
    end
  end

  def initialize(payload:)
    @payload = payload
  end

  def call
    validate_payload!

    ActiveRecord::Base.transaction do
      ao3_user = find_or_create_user!
      # Orthogonal to snapshot dedup: whether *this* capture is a same-day
      # repeat has nothing to do with whether earliest_post_year is still
      # missing, so this runs on both branches below rather than only the
      # new-snapshot one - a same-day retry (e.g. a user troubleshooting a
      # failed first scrape) must be able to backfill it too.
      persist_earliest_post_year!(ao3_user) if ao3_user.earliest_post_year.nil?
      existing_snapshot = ao3_user.snapshots.find_by(captured_on: captured_on)

      if existing_snapshot
        Result.new(ao3_user: ao3_user, snapshot: existing_snapshot, read_token: ao3_user.read_token, deduped: true)
      else
        snapshot = build_snapshot!(ao3_user)
        upsert_works!(ao3_user, snapshot)
        Result.new(ao3_user: ao3_user, snapshot: snapshot, read_token: ao3_user.read_token, deduped: false)
      end
    end
  end

  private

  attr_reader :payload

  def validate_payload!
    raise InvalidPayload, "username is required" if username.blank?
    raise InvalidPayload, "aggregate is required" unless payload["aggregate"].is_a?(Hash)
    raise UnsupportedSchemaVersion, "unsupported schemaVersion" unless payload["schemaVersion"] == CURRENT_SCHEMA_VERSION
  end

  def username
    payload["username"]
  end

  def client_read_token
    payload["readToken"]
  end

  def works_payload
    payload.fetch("works", [])
  end

  def captured_on
    @captured_on ||= Time.current.to_date
  end

  def find_or_create_user!
    ao3_user = Ao3User.find_by(username: username)
    return authorize_existing_user!(ao3_user) if ao3_user

    begin
      Ao3User.create!(username: username, read_token: generate_token)
    rescue ActiveRecord::RecordNotUnique
      # Two concurrent first-ingests for the same brand-new username: this
      # request's find_by above ran before the other request committed, so
      # it saw no row and lost the race to the unique index on username.
      # The other request's row now exists - fall back to it exactly like
      # the existing-user path above, rather than letting RecordNotUnique
      # propagate into a 500.
      authorize_existing_user!(Ao3User.find_by(username: username))
    end
  end

  def authorize_existing_user!(ao3_user)
    # secure_compare is constant-time but not nil-safe (raises on a nil
    # argument); client_read_token can genuinely be nil for a malformed
    # payload missing "readToken" entirely, so it's coerced to a string
    # first - "" still safely fails the comparison rather than matching.
    unless ActiveSupport::SecurityUtils.secure_compare(ao3_user.read_token, client_read_token.to_s)
      raise TokenMismatch, "token mismatch for #{username}"
    end
    ao3_user
  end

  def generate_token
    SecureRandom.hex(24)
  end

  def build_snapshot!(ao3_user)
    aggregate = payload["aggregate"]

    ao3_user.snapshots.create!(
      captured_on: captured_on,
      captured_at: Time.current,
      total_hits: aggregate["hits"],
      total_kudos: aggregate["kudos"],
      total_comments: aggregate["comments"],
      total_bookmarks: aggregate["bookmarks"],
      total_subscriptions: aggregate["subscriptions"],
      total_user_subscriptions: aggregate["userSubscriptions"],
      total_word_count: aggregate["wordCount"],
      works_count: aggregate["worksCount"],
    )
  end

  def persist_earliest_post_year!(ao3_user)
    year = payload["earliestPostYear"]
    return unless year.is_a?(Integer)
    return unless EARLIEST_POST_YEAR_RANGE.cover?(year)

    ao3_user.update!(earliest_post_year: year)
  end

  def upsert_works!(ao3_user, snapshot)
    works_payload.each do |work_data|
      work = ao3_user.works.find_or_initialize_by(ao3_work_id: work_data["ao3WorkId"])
      work.title = work_data["title"]
      work.fandoms = Array(work_data["fandoms"]).join(", ")
      work.last_seen_on = captured_on
      work.save!

      work.work_stats.create!(
        snapshot: snapshot,
        hits: work_data["hits"],
        kudos: work_data["kudos"],
        comments: work_data["comments"],
        bookmarks: work_data["bookmarks"],
        subscriptions: work_data["subscriptions"],
        word_count: work_data["wordCount"],
      )
    end
  end
end
