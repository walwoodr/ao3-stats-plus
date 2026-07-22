# WorkStat is the per-work reading captured in a given Snapshot - the join
# between a Work and a Snapshot, keyed uniquely by (snapshot_id, work_id).
class WorkStat < ApplicationRecord
  belongs_to :snapshot
  belongs_to :work

  validates :work_id, uniqueness: { scope: :snapshot_id }

  validates :hits, :kudos, :comments, :bookmarks, :subscriptions, :word_count,
    numericality: { greater_than_or_equal_to: 0 }
end
