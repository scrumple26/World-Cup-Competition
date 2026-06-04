/** Friend-group assignment: balance to 4 per group, random among least-filled. */

import { FRIEND_GROUPS, GROUP_SIZE, type FriendGroup } from "./wc";

/**
 * Pick a friend-group for a new participant. Returns the group with the fewest
 * current members (random tiebreak), keeping groups balanced at GROUP_SIZE each.
 * @param counts current member count per group
 */
export function assignFriendGroup(
  counts: Record<FriendGroup, number>,
): FriendGroup {
  const open = FRIEND_GROUPS.filter((g) => (counts[g] ?? 0) < GROUP_SIZE);
  const pool = open.length > 0 ? open : [...FRIEND_GROUPS];
  const min = Math.min(...pool.map((g) => counts[g] ?? 0));
  const leastFilled = pool.filter((g) => (counts[g] ?? 0) === min);
  return leastFilled[Math.floor(Math.random() * leastFilled.length)];
}

/** Tally members per friend-group from a list of users. */
export function groupCounts(
  users: { friendGroup: FriendGroup }[],
): Record<FriendGroup, number> {
  const counts = { A: 0, B: 0, C: 0, D: 0 } as Record<FriendGroup, number>;
  for (const u of users) counts[u.friendGroup] = (counts[u.friendGroup] ?? 0) + 1;
  return counts;
}
