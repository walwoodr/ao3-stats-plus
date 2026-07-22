# Work is a per-fic identity record, upserted on every ingest and keyed by
# (ao3_user_id, ao3_work_id). fandoms is a comma-joined string because a work
# can appear under multiple fandoms on AO3's stats page (deduped upstream by
# the ingest service, unioned into this one field).
class Work < ApplicationRecord
  belongs_to :ao3_user
  has_many :work_stats, dependent: :destroy

  validates :ao3_work_id, presence: true, uniqueness: { scope: :ao3_user_id }
  validates :title, presence: true
  validates :last_seen_on, presence: true
end
