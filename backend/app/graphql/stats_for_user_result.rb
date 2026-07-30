# Presenter passed as the `object` for Types::StatsForUserType - wraps an
# already-authorized Ao3User (username + token verified by QueryType before
# this is built) and exposes exactly the shape that type's fields expect.
class StatsForUserResult
  def initialize(ao3_user)
    @ao3_user = ao3_user
  end

  def kudos_to_hits_ratio
    latest_snapshot = ao3_user.snapshots.order(captured_on: :desc).first
    return 0.0 unless latest_snapshot

    StatsRatio.kudos_to_hits(kudos: latest_snapshot.total_kudos, hits: latest_snapshot.total_hits)
  end

  def aggregate_series
    ao3_user.snapshots.order(:captured_on)
  end

  def per_work_series
    ao3_user.works.order(:ao3_work_id)
  end

  def earliest_post_year
    ao3_user.earliest_post_year
  end

  private

  attr_reader :ao3_user
end
