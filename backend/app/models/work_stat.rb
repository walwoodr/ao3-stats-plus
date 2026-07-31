# WorkStat is the per-work reading captured in a given Snapshot - the join
# between a Work and a Snapshot, keyed uniquely by (snapshot_id, work_id).
class WorkStat < ApplicationRecord
  belongs_to :snapshot
  belongs_to :work

  validates :work_id, uniqueness: { scope: :snapshot_id }

  validates :hits, :kudos, :comments, :bookmarks, :subscriptions, :word_count,
    numericality: { greater_than_or_equal_to: 0 }

  # Work-page enrichment columns (plan section 1a): nullable, NO default -
  # NULL means "not scraped this snapshot," 0 means "scraped, genuinely
  # zero," so `allow_nil: true` here (unlike the required counters above)
  # is load-bearing, not incidental.
  validates :public_bookmarks, :visible_comments, :chapter_count, :chapters_expected,
    numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  validate :chapters_expected_paired_with_chapter_count

  # Derived, NOT stored (plan section 1a "Derived, NOT stored"): only
  # computed once public_bookmarks was actually captured this snapshot;
  # clamped to >= 0 to tolerate a bookmark added between the two scrapes
  # within one fan-out run.
  def private_bookmarks
    return nil if public_bookmarks.nil?

    [ bookmarks - public_bookmarks, 0 ].max
  end

  private

  # chapters_expected and chapter_count are two halves of one "N/M as seen
  # that day" reading (plan section 1a) - a chapters_expected on its own,
  # or one lower than chapter_count, is a reading no real scrape could
  # produce.
  def chapters_expected_paired_with_chapter_count
    return if chapters_expected.nil?

    if chapter_count.nil?
      errors.add(:chapters_expected, "can't be present without chapter_count")
    elsif chapters_expected < chapter_count
      errors.add(:chapters_expected, "can't be less than chapter_count")
    end
  end
end
