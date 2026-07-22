# Ao3User is the per-author identity record: one row per AO3 username, with
# a capability token minted on first ingest and required on every later one.
class Ao3User < ApplicationRecord
  has_many :snapshots, dependent: :destroy
  has_many :works, dependent: :destroy

  validates :username, presence: true, uniqueness: true
  validates :read_token, presence: true, uniqueness: true
end
