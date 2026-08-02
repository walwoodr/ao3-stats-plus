# Ao3User is the per-author identity record: one row per AO3 username, with
# a client-supplied capability token (re)set on every successful ingest.
# read_token is scoped per-username (username stays globally unique below);
# it is never a lookup key, so it is deliberately not unique across users.
class Ao3User < ApplicationRecord
  has_many :snapshots, dependent: :destroy
  has_many :works, dependent: :destroy

  validates :username, presence: true, uniqueness: true
  validates :read_token, presence: true
end
