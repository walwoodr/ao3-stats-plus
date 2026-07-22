# Snapshot is a single point-in-time aggregate reading for one Ao3User,
# keyed by server-derived captured_on (date) - the (ao3_user_id, captured_on)
# unique index is the dedup mechanism described in the plan.
class Snapshot < ApplicationRecord
  belongs_to :ao3_user
  has_many :work_stats, dependent: :destroy

  validates :captured_on, presence: true, uniqueness: { scope: :ao3_user_id }
  validates :captured_at, presence: true

  validates :total_hits, :total_kudos, :total_comments, :total_bookmarks,
    :total_subscriptions, :total_user_subscriptions, :total_word_count, :works_count,
    numericality: { greater_than_or_equal_to: 0 }
end
