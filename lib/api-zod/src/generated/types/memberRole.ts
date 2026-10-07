export type MemberRole = typeof MemberRole[keyof typeof MemberRole];

export const MemberRole = {
  owner: 'owner',
  manager: 'manager',
  staff: 'staff',
} as const;
